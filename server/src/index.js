// Entry point: wires the database, HTTP app, WebSocket hub and simulator together.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createRepository } from './repository.js';
import { createApp } from './app.js';
import { createRealtimeHub } from './realtime.js';
import { startSimulator } from './simulator.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4000')
  .split(',').map((s) => s.trim()).filter(Boolean);
const clientDir = path.resolve(here, '../../client/dist');

const db = openDatabase();
const repo = createRepository(db);
seedIfEmpty(repo, db);

let hub;
const notify = (session, type = 'session.updated') =>
  hub?.broadcast({ type, session, summary: repo.summaryOf(session) });

const app = createApp({
  repo,
  onChange: notify,
  allowedOrigins,
  apiKey: process.env.API_KEY,
  mediaDir: path.resolve(here, '../media'),
  clientDir: fs.existsSync(clientDir) ? clientDir : undefined,
});

const server = http.createServer(app);
hub = createRealtimeHub(server, { allowedOrigins });

if (process.env.SIMULATE !== 'false') {
  startSimulator({ repo, onChange: notify, intervalMs: Number(process.env.SIM_INTERVAL_MS || 3000) });
}

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}  (WebSocket: ws://localhost:${PORT}/ws)`);
});

// Graceful shutdown: stop accepting connections, then close the DB cleanly.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    hub.close();
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
