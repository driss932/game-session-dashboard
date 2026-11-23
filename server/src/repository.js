// Repository: the only module that talks SQL. Routes call these functions and
// never build queries themselves. Every query uses bound parameters (?, @name)
// so user input can never change the SQL — this is the SQL-injection defence.
import crypto from 'node:crypto';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const now = () => new Date().toISOString();
const newSessionId = () => 'gs_' + crypto.randomBytes(6).toString('base64url');

export function createRepository(db) {
  const stmts = {
    count: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE (@status IS NULL OR status = @status)`),
    // The list endpoint returns a lightweight summary. The leader is worked out
    // in SQL, so we never load every player of every session just to draw the list.
    list: db.prepare(`
      SELECT s.id, s.game, s.status, s.started_at, s.ended_at, s.poster_url, s.version,
             (SELECT COUNT(*) FROM players p WHERE p.session_id = s.id) AS player_count,
             (SELECT p.name  FROM players p WHERE p.session_id = s.id ORDER BY p.score DESC, p.id LIMIT 1) AS leader_name,
             (SELECT p.score FROM players p WHERE p.session_id = s.id ORDER BY p.score DESC, p.id LIMIT 1) AS leader_score
      FROM sessions s
      WHERE (@status IS NULL OR s.status = @status)
      ORDER BY s.started_at DESC, s.id
      LIMIT @limit OFFSET @offset`),
    session: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    players: db.prepare(`SELECT id, name, score, photo_url FROM players WHERE session_id = ? ORDER BY score DESC, id`),
    insertSession: db.prepare(`
      INSERT INTO sessions (id, game, status, started_at, ended_at, video_url, poster_url, updated_at)
      VALUES (@id, @game, @status, @startedAt, @endedAt, @videoUrl, @posterUrl, @updatedAt)`),
    insertPlayer: db.prepare(`
      INSERT INTO players (session_id, name, score, photo_url) VALUES (@sessionId, @name, @score, @photoUrl)`),
    // `score = score + ?` is atomic in the database. If two people press +1 at
    // the same moment, both increments land (no read-modify-write "lost update").
    // MAX(0, …) keeps the score from going negative.
    addScore: db.prepare(`UPDATE players SET score = MAX(0, score + ?) WHERE id = ? AND session_id = ?`),
    setScore: db.prepare(`UPDATE players SET score = ? WHERE id = ? AND session_id = ?`),
    setStatus: db.prepare(`
      UPDATE sessions SET status = @status,
        ended_at = CASE WHEN @status = 'completed' THEN COALESCE(ended_at, @now) ELSE NULL END
      WHERE id = @id`),
    touch: db.prepare(`UPDATE sessions SET version = version + 1, updated_at = ? WHERE id = ?`),
    randomActivePlayer: db.prepare(`
      SELECT p.id AS player_id, p.session_id FROM players p
      JOIN sessions s ON s.id = p.session_id
      WHERE s.status = 'active' ORDER BY RANDOM() LIMIT 1`),
  };

  // Map DB rows (snake_case) to the API shape (camelCase) in one place.
  const toSummary = (r) => ({
    id: r.id,
    game: r.game,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    posterUrl: r.poster_url,
    version: r.version,
    playerCount: r.player_count,
    leader: r.leader_name == null ? null : { name: r.leader_name, score: r.leader_score },
  });

  function getSession(id) {
    const s = stmts.session.get(id);
    if (!s) return null;
    return {
      id: s.id,
      game: s.game,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      videoUrl: s.video_url,
      posterUrl: s.poster_url,
      version: s.version,
      updatedAt: s.updated_at,
      players: stmts.players.all(id).map((p) => ({
        id: p.id, name: p.name, score: p.score, photoUrl: p.photo_url,
      })),
    };
  }

  function summaryOf(session) {
    const leader = session.players[0];
    return {
      id: session.id, game: session.game, status: session.status,
      startedAt: session.startedAt, endedAt: session.endedAt,
      posterUrl: session.posterUrl, version: session.version,
      playerCount: session.players.length,
      leader: leader ? { name: leader.name, score: leader.score } : null,
    };
  }

  function listSessions({ status = null, limit = 20, offset = 0 } = {}) {
    return {
      items: stmts.list.all({ status, limit, offset }).map(toSummary),
      total: stmts.count.get({ status }).n,
      limit,
      offset,
    };
  }

  // db.transaction() wraps the work so a session and its players are created
  // together or not at all.
  const createSession = db.transaction((input) => {
    const id = newSessionId();
    const ts = now();
    stmts.insertSession.run({
      id,
      game: input.game,
      status: input.status ?? 'active',
      startedAt: input.startedAt ?? ts,
      endedAt: input.endedAt ?? null,
      videoUrl: input.videoUrl ?? null,
      posterUrl: input.posterUrl ?? null,
      updatedAt: ts,
    });
    for (const p of input.players) {
      stmts.insertPlayer.run({ sessionId: id, name: p.name, score: p.score ?? 0, photoUrl: p.photoUrl ?? null });
    }
    return getSession(id);
  });

  const updateSession = db.transaction((id, patch) => {
    const current = stmts.session.get(id);
    if (!current) throw new NotFoundError(`Session ${id} not found`);

    // Optimistic concurrency (optional): the client can say "I'm editing
    // version N". If someone else changed it first we refuse with 409.
    if (patch.expectedVersion != null && patch.expectedVersion !== current.version) {
      throw new ConflictError(`Session was modified (version ${current.version})`);
    }
    if (patch.players?.length && current.status === 'completed' && patch.status !== 'active') {
      throw new ConflictError('Cannot change scores of a completed session');
    }

    for (const p of patch.players ?? []) {
      const res = p.delta != null
        ? stmts.addScore.run(p.delta, p.id, id)
        : stmts.setScore.run(p.score, p.id, id);
      if (res.changes === 0) throw new NotFoundError(`Player ${p.id} is not in session ${id}`);
    }
    if (patch.status) stmts.setStatus.run({ id, status: patch.status, now: now() });

    stmts.touch.run(now(), id);
    return getSession(id);
  });

  function randomActivePlayer() {
    return stmts.randomActivePlayer.get() ?? null;
  }

  return { listSessions, getSession, createSession, updateSession, summaryOf, randomActivePlayer };
}
