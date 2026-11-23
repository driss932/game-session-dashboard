import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import PlayerRow from './PlayerRow.jsx';
import { duration, formatDateTime } from '../lib/format.js';

const VideoPlayer = lazy(() => import('./VideoPlayer.jsx'));

// Re-render once a minute so the "duration" of an active session ticks along.
function useMinuteTick(enabled) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export default function SessionOverview({ detail, onScore, onStatus, onRetry }) {
  const { session, loading, error } = detail;
  const now = useMinuteTick(session?.status === 'active');

  // Players are shown in a stable order (join order) so the +1 buttons don't
  // jump around under your cursor while scores change; rank is shown as a number.
  const { players, ranks, leaderId } = useMemo(() => {
    if (!session) return { players: [], ranks: new Map(), leaderId: null };
    const byScore = [...session.players].sort((a, b) => b.score - a.score || a.id - b.id);
    const ranks = new Map();
    byScore.forEach((p, i) => {
      // ties share a rank (1, 2, 2, 4)
      const prev = byScore[i - 1];
      ranks.set(p.id, prev && prev.score === p.score ? ranks.get(prev.id) : i + 1);
    });
    return {
      // Completed matches are read-only, so show them as a final leaderboard.
      players: session.status === 'active' ? [...session.players].sort((a, b) => a.id - b.id) : byScore,
      ranks,
      leaderId: byScore[0]?.score > 0 ? byScore[0].id : null,
    };
  }, [session]);

  if (error && !session) {
    return (
      <section className="panel overview overview--empty">
        <p>Couldn’t load this session: {error}</p>
        <button className="btn" onClick={onRetry}>Try again</button>
      </section>
    );
  }
  if (!session) {
    return <section className="panel overview overview--loading" aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></section>;
  }

  const active = session.status === 'active';
  const total = session.players.reduce((sum, p) => sum + p.score, 0);

  return (
    <section className="panel overview" aria-busy={loading} aria-labelledby="overview-title">
      <header className="overview__head">
        <div>
          <p className="eyebrow">Session Overview</p>
          <h2 id="overview-title">{session.game}</h2>
          <p className="overview__id">
            Session ID <code>{session.id}</code>
          </p>
        </div>
        <StatusBadge status={session.status} />
      </header>

      <dl className="stats">
        <div><dt>Started</dt><dd>{formatDateTime(session.startedAt)}</dd></div>
        <div><dt>{active ? 'Running for' : 'Duration'}</dt><dd>{duration(session.startedAt, session.endedAt, now)}</dd></div>
        <div><dt>Players</dt><dd>{session.players.length}</dd></div>
        <div><dt>Total points</dt><dd>{total.toLocaleString()}</dd></div>
      </dl>

      <h3 className="section-title">Players</h3>
      <ol className="players">
        {players.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            rank={ranks.get(p.id)}
            isLeader={p.id === leaderId}
            editable={active}
            onScore={onScore}
          />
        ))}
      </ol>

      {active ? (
        <div className="overview__footer">
          <p className="muted">Scores update live. Use the buttons to adjust a player’s score.</p>
          <button className="btn btn--danger" onClick={() => onStatus('completed')}>End session</button>
        </div>
      ) : session.videoUrl ? (
        <Suspense fallback={<div className="video video--placeholder" />}>
          <VideoPlayer src={session.videoUrl} poster={session.posterUrl} title={session.game} />
        </Suspense>
      ) : (
        <p className="muted">No replay was recorded for this match.</p>
      )}
    </section>
  );
}
