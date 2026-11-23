// Express application: HTTP routes + security middleware.
// Kept separate from index.js (which starts the server) so tests can create
// an app with an in-memory database.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { z } from 'zod';
import { NotFoundError, ConflictError } from './repository.js';
import { listQuery, sessionId, createSessionBody, updateSessionBody } from './validation.js';

export function createApp({ repo, onChange = () => {}, allowedOrigins = [], apiKey, mediaDir, clientDir }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs for rate limiting behind one proxy/load balancer

  // Security headers (CSP, X-Content-Type-Options, frame protection, ...).
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // Only force HTTPS in production (local dev runs over plain HTTP).
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  }));

  // CORS: only our own frontend origin(s) may call the API from a browser.
  app.use('/api', cors({ origin: allowedOrigins.length ? allowedOrigins : false }));

  // Small body limit: a session update is a few hundred bytes.
  app.use(express.json({ limit: '10kb' }));

  // Rate-limit writes so one client can't flood the DB / broadcast channel.
  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });

  // Optional shared-secret auth for writes. A placeholder for real auth
  // (OIDC/JWT): see README "Security". Disabled when API_KEY isn't set.
  const requireWriteAuth = (req, res, next) => {
    if (!apiKey || req.get('x-api-key') === apiKey) return next();
    res.status(401).json({ error: 'Unauthorized' });
  };

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  // GET /api/sessions?status=active&limit=20&offset=0  → match history (summaries)
  api.get('/sessions', (req, res) => {
    const q = listQuery.parse(req.query);
    res.set('Cache-Control', 'no-cache'); // always revalidate: data changes live
    res.json(repo.listSessions(q));
  });

  // GET /api/sessions/:id  → full session incl. players, photos, video
  api.get('/sessions/:id', (req, res) => {
    const id = sessionId.parse(req.params.id);
    const session = repo.getSession(id);
    if (!session) throw new NotFoundError(`Session ${id} not found`);
    // ETag lets a polling client get a cheap 304 when nothing changed.
    res.set('ETag', `W/"${session.id}-${session.version}"`);
    if (req.fresh) return res.status(304).end();
    res.set('Cache-Control', 'no-cache');
    res.json(session);
  });

  // POST /api/sessions  → start a new session
  api.post('/sessions', writeLimiter, requireWriteAuth, (req, res) => {
    const body = createSessionBody.parse(req.body);
    const session = repo.createSession(body);
    onChange(session, 'session.created');
    res.status(201).location(`/api/sessions/${session.id}`).json(session);
  });

  // PATCH /api/sessions/:id  → update scores and/or status
  api.patch('/sessions/:id', writeLimiter, requireWriteAuth, (req, res) => {
    const id = sessionId.parse(req.params.id);
    const body = updateSessionBody.parse(req.body);
    const session = repo.updateSession(id, body);
    onChange(session, 'session.updated');
    res.json(session);
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Media (player photos, match videos). express.static supports HTTP Range
  // requests, which is what lets the browser stream and seek in a video
  // without downloading the whole file first.
  if (mediaDir) {
    app.use('/media', express.static(mediaDir, {
      maxAge: '7d',
      fallthrough: false,
      setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
    }));
  }

  // In production the built React app is served by the same process.
  if (clientDir) {
    app.use(express.static(clientDir, {
      setHeaders: (res, file) => {
        // Vite puts a content hash in asset file names, so they can be cached forever.
        if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
        else res.set('Cache-Control', 'no-cache');
      },
    }));
    app.get(/^\/(?!api|media|ws).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  // Central error handler: map known errors to status codes and never leak
  // stack traces or SQL to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
