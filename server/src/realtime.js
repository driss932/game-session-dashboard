// Real-time hub: a WebSocket endpoint at /ws. Whenever a session changes
// (via the API or the simulator), we push the new state to every connected
// browser, so scores update without the user refreshing.
//
// This keeps the connections in one process's memory. With several server
// instances you'd publish events through Redis pub/sub (or a managed
// service such as API Gateway WebSockets / Azure Web PubSub) so every
// instance can forward them. See README "At scale".
import { WebSocketServer } from 'ws';

export function createRealtimeHub(httpServer, { allowedOrigins = [] } = {}) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 1024, // clients only send tiny pings; refuse anything bigger
    // Browsers always send Origin on WebSocket upgrades. Checking it stops a
    // malicious site from opening a socket to our API from a user's browser.
    verifyClient: ({ origin }) => !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

  // Heartbeat: drop connections that have silently died (laptop lid closed,
  // mobile network switch) so we don't keep sending to them forever.
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', () => {}); // ignore client messages; this channel is server→client
    ws.send(JSON.stringify({ type: 'hello', at: new Date().toISOString() }));
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const ws of wss.clients) {
      // Back-pressure: skip clients that can't keep up instead of buffering
      // unbounded memory for them. They'll catch up via their next poll/refetch.
      if (ws.readyState === ws.OPEN && ws.bufferedAmount < 1_000_000) ws.send(data);
    }
  }

  return { broadcast, close: () => wss.close(), clientCount: () => wss.clients.size };
}
