import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useRealtime } from './useRealtime.js';

const PAGE_SIZE = 20;
const POLL_MS = 5000;

// Accept an incoming copy of a session only if it's at least as new as what
// we already have. Updates can arrive out of order (a slow poll response after
// a fast WebSocket push), and `version` tells us which one is newer.
const isNewer = (incoming, current) => !current || incoming.version >= current.version;

/**
 * All dashboard state lives here, so components stay simple and presentational.
 *  - list:     match history (summaries), filter + "load more" pagination
 *  - detail:   the selected session, loaded from GET /sessions/:id on click
 *  - realtime: WebSocket pushes, with polling fallback while disconnected
 *  - actions:  optimistic score updates, end session, create session
 */
export function useDashboard() {
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState({ items: [], total: 0, loading: true, error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ session: null, loading: false, error: null });
  const [toast, setToast] = useState(null);

  // Refs give async callbacks the *current* values without re-creating them.
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const loadedCountRef = useRef(0);
  loadedCountRef.current = list.items.length;
  const listAbort = useRef(null);
  const detailAbort = useRef(null);

  const showError = useCallback((err) => {
    if (err.name === 'AbortError') return;
    setToast(err.message || 'Something went wrong');
  }, []);

  // ---- Match history ------------------------------------------------------
  const loadList = useCallback(async ({ append = false } = {}) => {
    // Cancel an in-flight request (e.g. user switched filter quickly) so an
    // older response can't overwrite a newer one.
    listAbort.current?.abort();
    const ctrl = (listAbort.current = new AbortController());
    setList((l) => ({ ...l, loading: true, error: null }));
    try {
      const status = filterRef.current === 'all' ? undefined : filterRef.current;
      // A refresh re-fetches everything already shown, so "load more" pages survive it.
      const offset = append ? loadedCountRef.current : 0;
      const limit = append ? PAGE_SIZE : Math.min(100, Math.max(PAGE_SIZE, loadedCountRef.current));
      const page = await api.listSessions({ status, limit, offset }, ctrl.signal);
      setList((l) => ({
        items: append ? [...l.items, ...page.items] : page.items,
        total: page.total,
        loading: false,
        error: null,
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setList((l) => ({ ...l, loading: false, error: err.message }));
    }
  }, []);

  // Reload from the top whenever the filter changes.
  useEffect(() => {
    setList({ items: [], total: 0, loading: true, error: null });
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Select something sensible on first load: the newest active session.
  useEffect(() => {
    if (selectedId || list.items.length === 0) return;
    const first = list.items.find((s) => s.status === 'active') ?? list.items[0];
    setSelectedId(first.id);
  }, [list.items, selectedId]);

  // ---- Selected session: "clicking a session loads its data" --------------
  const loadDetail = useCallback(async (id, { quiet = false } = {}) => {
    detailAbort.current?.abort();
    const ctrl = (detailAbort.current = new AbortController());
    if (!quiet) setDetail((d) => ({ session: d.session?.id === id ? d.session : null, loading: true, error: null }));
    try {
      const session = await api.getSession(id, ctrl.signal);
      if (selectedIdRef.current !== id) return; // user already clicked something else
      setDetail((d) => ({
        session: d.session?.id === id && !isNewer(session, d.session) ? d.session : session,
        loading: false,
        error: null,
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setDetail((d) => ({ ...d, loading: false, error: quiet ? d.error : err.message }));
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ---- Real-time updates ---------------------------------------------------
  const applyServerSession = useCallback((session, summary) => {
    if (summary) {
      setList((l) => {
        const idx = l.items.findIndex((s) => s.id === summary.id);
        if (idx >= 0) {
          if (!isNewer(summary, l.items[idx])) return l;
          const items = l.items.slice();
          // A session that no longer matches the filter (e.g. it just completed
          // while viewing "Active") drops out of the list.
          if (filterRef.current !== 'all' && summary.status !== filterRef.current) {
            items.splice(idx, 1);
            return { ...l, items, total: l.total - 1 };
          }
          items[idx] = summary;
          return { ...l, items };
        }
        if (filterRef.current === 'all' || filterRef.current === summary.status) {
          // New session: put it at the top (list is newest first).
          return { ...l, items: [summary, ...l.items], total: l.total + 1 };
        }
        return l;
      });
    }
    if (session && session.id === selectedIdRef.current) {
      setDetail((d) => (isNewer(session, d.session) ? { ...d, session } : d));
    }
  }, []);

  const connection = useRealtime(
    useCallback((msg) => {
      if (msg.type === 'hello') {
        // (Re)connected: we may have missed events while offline, so resync once.
        loadList();
        if (selectedIdRef.current) loadDetail(selectedIdRef.current, { quiet: true });
      } else if (msg.type === 'session.updated' || msg.type === 'session.created') {
        applyServerSession(msg.session, msg.summary);
      }
    }, [loadList, loadDetail, applyServerSession]),
  );

  // Polling fallback: only while the WebSocket is down, and only when the tab
  // is visible (no point refreshing a background tab).
  useEffect(() => {
    if (connection === 'live') return;
    const id = setInterval(() => {
      if (document.hidden) return;
      if (selectedIdRef.current) loadDetail(selectedIdRef.current, { quiet: true });
      loadList();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connection, loadDetail, loadList]);

  // ---- Actions -------------------------------------------------------------
  // Optimistic update: change the score on screen immediately, then send the
  // delta to the server. The server's response (with a higher version) replaces
  // our guess; if the request fails we reload the real data and show an error.
  const changeScore = useCallback(async (playerId, delta) => {
    const id = selectedIdRef.current;
    setDetail((d) => ({
      ...d,
      session: d.session && {
        ...d.session,
        players: d.session.players.map((p) => (p.id === playerId ? { ...p, score: Math.max(0, p.score + delta) } : p)),
      },
    }));
    try {
      const session = await api.updateSession(id, { players: [{ id: playerId, delta }] });
      applyServerSession(session);
    } catch (err) {
      showError(err);
      loadDetail(id, { quiet: true });
    }
  }, [applyServerSession, loadDetail, showError]);

  const setStatus = useCallback(async (status) => {
    try {
      const session = await api.updateSession(selectedIdRef.current, { status });
      applyServerSession(session);
    } catch (err) { showError(err); }
  }, [applyServerSession, showError]);

  const createSession = useCallback(async (data) => {
    const session = await api.createSession(data); // errors go back to the form
    // The WebSocket also announces it; isNewer() makes the duplicate harmless.
    setFilter((f) => (f === 'completed' ? 'all' : f));
    setSelectedId(session.id);
    setDetail({ session, loading: false, error: null });
    return session;
  }, []);

  return {
    filter, setFilter,
    list, loadMore: () => loadList({ append: true }),
    selectedId, select: setSelectedId,
    detail, retryDetail: () => selectedId && loadDetail(selectedId),
    connection,
    changeScore, setStatus, createSession,
    toast, dismissToast: () => setToast(null),
  };
}
