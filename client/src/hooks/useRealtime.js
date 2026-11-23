import { useEffect, useRef, useState } from 'react';

// Connects to the server's WebSocket and calls onMessage for every event.
//
// Resilience:
//  - automatic reconnect with exponential backoff + jitter (1s, 2s, 4s … max 30s),
//    so thousands of clients don't all reconnect at the same instant after an outage
//  - status is exposed so the UI can show "Live" vs "Reconnecting", and so the
//    dashboard can fall back to polling while the socket is down
//  - the server's ping/pong heartbeat cleans up sockets that silently died
export function useRealtime(onMessage) {
  const [status, setStatus] = useState('connecting'); // 'live' | 'connecting' | 'offline'
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage; // always call the latest handler without reconnecting

  useEffect(() => {
    let ws;
    let attempt = 0;
    let retryTimer;
    let stopped = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      setStatus(attempt === 0 ? 'connecting' : 'offline');

      ws.onopen = () => { attempt = 0; setStatus('live'); };
      ws.onmessage = (e) => {
        try { handlerRef.current(JSON.parse(e.data)); } catch (err) { console.warn('bad ws message', err); }
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus('offline');
        const delay = Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + Math.random() / 2);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return status;
}
