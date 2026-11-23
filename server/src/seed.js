// Demo data so the dashboard has something to show on first run.
// Runs automatically when the database is empty; `npm run seed` resets it.
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createRepository } from './repository.js';

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const photo = (slug) => `/media/players/${slug}-128.webp`;
const P = (name, score) => ({ name, score, photoUrl: photo(name.toLowerCase()) });

const DEMO_SESSIONS = [
  // Active sessions: the simulator keeps changing these scores.
  { game: 'Arena Rush', status: 'active', startedAt: minutesAgo(12),
    players: [P('Nova', 42), P('Kai', 37), P('Rhea', 51), P('Jonas', 18)] },
  { game: 'Starfall Rally', status: 'active', startedAt: minutesAgo(5),
    players: [P('Mira', 12), P('Theo', 9), P('Ana', 15)] },
  // Completed sessions: these have a recorded video.
  ...[
    ['Pixel Tactics', 95, [P('Kai', 120), P('Mira', 98), P('Leo', 143), P('Sana', 77)]],
    ['Arena Rush', 180, [P('Nova', 210), P('Rhea', 199)]],
    ['Quarry Kings', 300, [P('Jonas', 64), P('Ana', 88), P('Theo', 71)]],
    ['Starfall Rally', 1440, [P('Leo', 155), P('Sana', 160), P('Kai', 149), P('Nova', 131)]],
    ['Pixel Tactics', 2900, [P('Rhea', 90), P('Mira', 104)]],
    ['Quarry Kings', 4300, [P('Theo', 56), P('Jonas', 61), P('Leo', 49)]],
  ].map(([game, ago, players], i) => ({
    game,
    status: 'completed',
    startedAt: minutesAgo(ago),
    endedAt: minutesAgo(ago - 25),
    videoUrl: `/media/videos/match-${i + 1}.mp4`,
    posterUrl: `/media/videos/match-${i + 1}.webp`,
    players,
  })),
];

export function seedIfEmpty(repo, db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM sessions').get();
  if (n > 0) return;
  for (const s of DEMO_SESSIONS) repo.createSession(s);
  console.log(`Seeded ${DEMO_SESSIONS.length} demo sessions`);
}

// `node src/seed.js --reset` wipes and reseeds.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  if (process.argv.includes('--reset')) db.exec('DELETE FROM players; DELETE FROM sessions;');
  seedIfEmpty(createRepository(db), db);
  db.close();
}
