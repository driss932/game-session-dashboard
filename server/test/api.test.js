// API tests using Node's built-in test runner and fetch (no extra deps).
// Each test file gets a fresh in-memory database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDatabase } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import { createApp } from '../src/app.js';

let server, base, events = [];

before(async () => {
  const repo = createRepository(openDatabase(':memory:'));
  const app = createApp({ repo, onChange: (s, type) => events.push({ type, s }) });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const req = (method, path, body) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });

let created;

test('POST /sessions creates a session with players', async () => {
  const res = await req('POST', '/sessions', { game: 'Arena Rush', players: [{ name: 'Ann' }, { name: 'Bo', score: 3 }] });
  assert.equal(res.status, 201);
  created = await res.json();
  assert.match(created.id, /^gs_/);
  assert.equal(created.status, 'active');
  assert.deepEqual(created.players.map((p) => [p.name, p.score]), [['Bo', 3], ['Ann', 0]]);
  assert.equal(events.at(-1).type, 'session.created');
});

test('POST /sessions rejects invalid input', async () => {
  const cases = [
    {},
    { game: 'x', players: [] },
    { game: 'x', players: [{ name: 'A' }, { name: 'a' }] }, // duplicate names
    { game: 'x', players: [{ name: 'A', photoUrl: 'javascript:alert(1)' }] },
    { game: 'x', players: [{ name: 'A' }], admin: true }, // unknown field
  ];
  for (const body of cases) assert.equal((await req('POST', '/sessions', body)).status, 400, JSON.stringify(body));
});

test('GET /sessions lists summaries with leader', async () => {
  const res = await req('GET', '/sessions?status=active');
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.deepEqual(body.items[0].leader, { name: 'Bo', score: 3 });
  assert.equal(body.items[0].players, undefined, 'list should not include full player data');
});

test('GET /sessions/:id returns detail, 404 and 400 as appropriate', async () => {
  const res = await req('GET', `/sessions/${created.id}`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('etag'));
  // A poll with the same ETag gets a cheap 304
  // (Node's fetch always adds Cache-Control: no-cache, which disables 304s, so use http.get.)
  const status = await new Promise((resolve) =>
    http.get(`${base}/sessions/${created.id}`, { headers: { 'if-none-match': res.headers.get('etag') } },
      (r) => { r.resume(); resolve(r.statusCode); }));
  assert.equal(status, 304);
  assert.equal((await req('GET', '/sessions/gs_doesnotexist')).status, 404);
  assert.equal((await req('GET', '/sessions/1%20OR%201=1')).status, 400);
});

test('PATCH applies concurrent deltas without losing updates', async () => {
  const ann = created.players.find((p) => p.name === 'Ann');
  await Promise.all(Array.from({ length: 20 }, () =>
    req('PATCH', `/sessions/${created.id}`, { players: [{ id: ann.id, delta: 1 }] })));
  const s = await (await req('GET', `/sessions/${created.id}`)).json();
  assert.equal(s.players.find((p) => p.id === ann.id).score, 20);
  assert.equal(s.version, 21);
});

test('PATCH validates players and versions', async () => {
  assert.equal((await req('PATCH', `/sessions/${created.id}`, { players: [{ id: 99999, delta: 1 }] })).status, 404);
  assert.equal((await req('PATCH', `/sessions/${created.id}`, { players: [{ id: 1, delta: 1, score: 2 }] })).status, 400);
  assert.equal((await req('PATCH', `/sessions/${created.id}`, { status: 'completed', expectedVersion: 1 })).status, 409);
});

test('completing a session locks its scores', async () => {
  const res = await req('PATCH', `/sessions/${created.id}`, { status: 'completed' });
  const s = await res.json();
  assert.equal(s.status, 'completed');
  assert.ok(s.endedAt);
  const locked = await req('PATCH', `/sessions/${created.id}`, { players: [{ id: s.players[0].id, delta: 1 }] });
  assert.equal(locked.status, 409);
});

test('oversized and malformed bodies are rejected', async () => {
  const big = await req('POST', '/sessions', { game: 'x'.repeat(20_000), players: [{ name: 'A' }] });
  assert.equal(big.status, 413);
  const bad = await fetch(base + '/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
});
