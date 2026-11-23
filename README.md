# Game Session Dashboard

A React dashboard for game sessions, backed by a small Node.js API and a SQLite database.

- **Session overview**: session ID, game, status (active/completed), players with photos and scores, duration, total points
- **Live updates**: scores change in real time over WebSockets (with automatic polling fallback); a simulator plays the active games
- **Update scores**: −1 / +1 / +5 buttons with optimistic UI, plus *End session*
- **Match history**: filterable list of sessions (All / Active / Completed) with pagination; clicking one loads it from `GET /api/sessions/:id`; completed matches play a replay video
- **New session**: create a session with up to 8 players (`POST /api/sessions`)
- **Responsive**: two columns on desktop, stacked on phones

## Running it

Requirements: Node.js 20+ (built and tested on Node 22). Python 3 with Pillow and ffmpeg are needed only to regenerate the demo media, which is already included.

```bash
# 1. API (http://localhost:4000)
cd server
npm install
npm start          # creates data/game.db and seeds demo data on first run

# 2. Frontend, dev mode with hot reload (http://localhost:5173)
cd client
npm install
npm run dev        # proxies /api, /media and /ws to :4000
```

**Production-style run**: `cd client && npm run build`, then `cd server && npm start`. The API serves the built app at http://localhost:4000.

| Command (in `server/`) | What it does |
|---|---|
| `npm test` | API tests (Node's built-in test runner, in-memory DB) |
| `npm run seed` | Reset the database to the demo data |
| `npm run media` | Regenerate demo player photos and match videos |

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `DB_FILE` | `data/game.db` | SQLite file |
| `CLIENT_ORIGIN` | `http://localhost:5173,http://localhost:4000` | Allowed browser origins (CORS + WebSocket) |
| `SIMULATE` / `SIM_INTERVAL_MS` | `true` / `3000` | Live score simulator |
| `API_KEY` | unset | If set, POST/PATCH require an `x-api-key` header |

## Architecture

```
React (Vite)  ──HTTP──▶  Express API  ──SQL──▶  SQLite
     ▲                      │
     └──── WebSocket /ws ◀──┘  (broadcast on every change)
```

```
server/src
  index.js        wires everything together and starts the server
  app.js          routes + security middleware + static/media serving
  repository.js   all SQL (parameterised), transactions, atomic score updates
  validation.js   zod schemas for every request
  realtime.js     WebSocket hub: broadcast, heartbeat, origin check
  simulator.js    fake "game server" that keeps changing live scores
  db.js / seed.js schema, indexes, demo data
client/src
  hooks/useDashboard.js  all state: list, selected session, realtime, actions
  hooks/useRealtime.js   WebSocket with reconnect/backoff
  components/            SessionOverview, PlayerRow, MatchHistory, VideoPlayer, …
```

### API

| Method | Path | Description |
|---|---|---|
| GET | `/api/sessions?status=&limit=&offset=` | Match history: lightweight summaries (leader, player count, poster) + `total` |
| GET | `/api/sessions/:id` | Full session: players, photos, video. Sends an `ETag`; returns `304` if unchanged |
| POST | `/api/sessions` | `{ game, players: [{ name, score?, photoUrl? }] }` → `201` |
| PATCH | `/api/sessions/:id` | `{ status?, players?: [{ id, delta } \| { id, score }], expectedVersion? }` |

Errors: `400` validation (with details), `404`, `409` (version conflict, or editing a completed match), `413` body too large, `429` rate limited.

WebSocket messages (server → client): `{ type: "session.updated" | "session.created", session, summary }`.

**Design notes**

- **Score changes are deltas** (`score = score + ?` in SQL). Two people pressing +1 at the same moment both count; a "read, add, write" approach would lose one. A test fires 20 concurrent +1s and checks for exactly 20.
- **Every session has a `version`** that goes up on each change. The client ignores any update older than what it already shows, so out-of-order poll and push responses can't roll the UI backwards. `expectedVersion` adds optional optimistic locking.
- **List vs detail**: the list returns summaries, and the server works out each leader in SQL. Full player data and video URLs are loaded only for the session you click.

---

## Frontend performance optimisation

- **Code splitting**: `React.lazy` splits `VideoPlayer` and `NewSessionForm` into their own chunks, so they download only when needed. The main bundle is about 74 KB gzipped, mostly React itself.
- **Fewer re-renders**: `PlayerRow` and `SessionItem` are wrapped in `memo`, and callbacks are stable (`useCallback` and refs). A live score change re-renders only the affected row, not the whole list. Derived data (ranks, sorting) uses `useMemo`.
- **Real-time without waste**: pushes come over a WebSocket instead of polling every client. Polling only starts while the socket is down, pauses while the tab is hidden, and uses `ETag`/`304` so an unchanged session costs a few bytes.
- **Request hygiene**: an `AbortController` cancels stale requests, so clicking quickly through sessions never shows the wrong one. The list endpoint is paginated (`Load more`).
- **Perceived speed**: optimistic score updates show instantly. Skeleton loaders and fixed image/video dimensions prevent layout shift (CLS).
- **UX choice**: during a live match, players keep a stable order with a rank number. Re-sorting would move the +1 buttons under your cursor. Completed matches show a sorted leaderboard.
- **Lean CSS**: plain CSS with no CSS-in-JS runtime. Animations use `transform`/`opacity` and respect `prefers-reduced-motion`.
- **Caching**: Vite gives built assets content-hashed names, and the server sends them with `Cache-Control: immutable, max-age=1y`. `index.html` is always revalidated.

**Next steps at larger sizes:** virtualise the history list (e.g. `react-window`) once it reaches hundreds of rows; use a data library such as TanStack Query for caching and deduplication; batch rapid clicks into one PATCH; run Lighthouse/Web Vitals in CI.

## Efficient handling of images and video

- **Player photos** are WebP (about 25–35% smaller than JPEG/PNG) at **two sizes** (64 px and 128 px). With `srcset` + `sizes`, a normal screen downloads the 64 px file and a retina phone the 128 px one. Each photo is 2–6 KB.
- They use `loading="lazy"`, `decoding="async"` and explicit `width`/`height`. If a photo is missing or fails to load, the player's initials are shown instead.
- **Videos** use `preload="none"` plus a small WebP **poster frame**, so nothing downloads until the user presses play. The poster doubles as the history thumbnail.
- MP4s are H.264 with `-movflags +faststart` (the index sits at the start of the file), so playback begins right away. The server supports **HTTP Range requests** (`206 Partial Content`), so the browser streams the file and can seek without downloading all of it.
- `key={src}` on the `<video>` means switching matches tears down the old element and cancels its download.
- Media gets `Cache-Control` headers. The `VideoPlayer` code itself is lazy-loaded.

**In production:**
- Store media in object storage (S3/GCS/Azure Blob) behind a **CDN**.
- Clients upload directly to storage with **pre-signed URLs**, so large files never pass through the API.
- An async pipeline (MediaConvert/Transcoder API/ffmpeg workers) transcodes recordings to **adaptive bitrate HLS/DASH** (several resolutions, chosen to suit the viewer's bandwidth), generates posters and thumbnails, and produces AVIF/WebP image variants. An image CDN with on-the-fly resizing could replace the fixed sizes.

## What I would do differently at scale

| Area | Now (demo) | At scale |
|---|---|---|
| Database | SQLite file, single process | Managed **PostgreSQL** (RDS/Cloud SQL) with read replicas for history, connection pooling (PgBouncer), migrations tool. Very hot live scores could live in **Redis** (sorted sets are a natural leaderboard), flushed to Postgres |
| API servers | One Node process | Stateless containers (ECS/Kubernetes/Cloud Run) behind a load balancer, autoscaled; health checks; graceful shutdown (already in place) |
| Real-time | In-memory WebSocket hub, everyone gets every event | **Redis pub/sub / NATS / Kafka** fan-out between instances, or a managed service (API Gateway WebSockets, Azure Web PubSub, Ably/Pusher). **Per-session subscriptions** so clients only receive the sessions they're viewing; throttle/coalesce updates (e.g. max 5/s per session) |
| Writes | Each click is a PATCH | Game servers send score events to a **queue** (SQS/Kafka); workers apply them idempotently (event IDs) |
| Pagination | `limit/offset` | **Keyset (cursor) pagination** on `(started_at, id)`: offset gets slow on deep pages |
| Media | Files on API server | Object storage + CDN + transcoding pipeline (above) |
| Caching | ETag on detail | CDN/edge caching of completed sessions (they never change), Redis cache for lists |
| Ops | console logs | Structured logs, metrics, tracing (OpenTelemetry), alerts, SLOs; IaC (Terraform), CI/CD with tests, blue/green deploys |
| Data growth | One table | Partition/archive old sessions by date; retention policy for videos (cold storage tiers) |

## Security concerns in this solution, and how I'd address them in production

What the code **already does**:
- **Input validation** with zod on every body, query and path param: strict schemas (unknown fields rejected), length and range limits, unique names, URL allow-list for photos (blocks `javascript:`/`data:` URLs).
- **SQL injection** prevented by parameterised prepared statements only.
- **Security headers** via Helmet (Content-Security-Policy, nosniff, frame-ancestors, etc.). `x-powered-by` is disabled.
- **CORS and WebSocket origin check** restricted to known front-end origins. Socket `maxPayload` is 1 KB, the heartbeat removes dead sockets, and slow consumers get back-pressure.
- **Abuse limits**: 10 KB JSON body limit, rate limit on writes (300/min/IP), max 8 players, max page size 100.
- **Safe errors**: a central handler returns clean messages and never leaks stack traces or SQL.
- **XSS**: React escapes all rendered text, and the app never uses `dangerouslySetInnerHTML`.
- **Business rules**: scores can't go negative and completed matches are locked (409).

**Known gaps** (fine for a homework demo, not for production) and the fixes:

| Concern | Risk | Production fix |
|---|---|---|
| **No authentication/authorisation** | Anyone who can reach the API can create sessions or change any score; the WebSocket broadcasts all sessions to anyone | OIDC login (Cognito/Auth0/Entra ID) with short-lived **JWTs** verified on every request and on the WebSocket handshake. **Role-based access**: players read; only the game server / admins write scores. Scores ideally come from a trusted game server (service-to-service auth: mTLS or signed tokens), never from the browser. Per-session authorisation for subscriptions |
| Optional `API_KEY` is a shared secret | A key in the browser is visible to anyone | Use only server-to-server; store in a secrets manager (AWS Secrets Manager/Key Vault) and rotate |
| **Score tampering / cheating** | A client could send arbitrary deltas | Server-authoritative scoring; signed score events; anomaly detection; audit log of every change (who/when/what) |
| Transport | Plain HTTP / `ws://` in dev | TLS everywhere (HTTPS/`wss://`), HSTS; TLS terminated at the load balancer |
| DoS | In-memory rate limiter per instance | Rate limiting at the edge (WAF/API Gateway, Cloudflare), shared Redis store for limits, connection limits for WebSockets |
| Media | Public `/media` URLs, no uploads yet | Private buckets + **signed, expiring CDN URLs** for replays; for uploads: pre-signed URLs, content-type/size checks, malware scanning, strip EXIF/location metadata from photos |
| Privacy (player photos/names are personal data) | Visible to everyone | Access control, data retention and deletion (GDPR right to erasure), consent for photos |
| Database | Local file | Encrypted at rest, private subnet, least-privilege DB user, automated backups and tested restores |
| Supply chain | npm dependencies | `npm audit`/Dependabot, lockfiles, SAST in CI, container image scanning, minimal base images, run as non-root |
| Observability | console only | Security logging and alerting (failed auth spikes, rate-limit hits), no sensitive data in logs |

## Testing

`cd server && npm test` covers create/list/get, validation failures, 404/400/409/413, ETag `304`, concurrent deltas (no lost updates), and score locking after completion. The UI was checked end-to-end in headless Chrome: live connection, optimistic +5, video playback, session creation, and responsive layout with 2× images on mobile.

## Trade-offs and shortcuts

- **JavaScript, not TypeScript**, to keep the homework small. For a real codebase I'd use TypeScript and share types and zod schemas between client and server.
- **SQLite** keeps setup to one command, and the SQL is portable to Postgres.
- **Demo media is generated** (ffmpeg test patterns and illustrated avatars), so the repository has no copyright or privacy issues.
