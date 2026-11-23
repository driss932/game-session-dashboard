// Input validation with zod. Every request body / query is parsed against a
// schema before it reaches the repository. Unknown fields are rejected
// (.strict()) and every string has a maximum length, so clients can't send
// huge or unexpected payloads.
import { z } from 'zod';

// Only allow images from our own /media folder or https URLs. This blocks
// `javascript:` / `data:` URLs and plain-http mixed content.
const mediaUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith('/media/') || /^https:\/\/[^\s]+$/.test(v), {
    message: 'must be a /media/ path or an https URL',
  });

const playerName = z.string().trim().min(1).max(40);

export const listQuery = z.object({
  status: z.enum(['active', 'completed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const sessionId = z.string().regex(/^gs_[A-Za-z0-9_-]{4,32}$/, 'invalid session id');

export const createSessionBody = z
  .object({
    game: z.string().trim().min(1).max(60),
    players: z
      .array(
        z.object({
          name: playerName,
          score: z.number().int().min(0).max(1_000_000).optional(),
          photoUrl: mediaUrl.optional(),
        }).strict(),
      )
      .min(1)
      .max(8)
      .refine((ps) => new Set(ps.map((p) => p.name.toLowerCase())).size === ps.length, {
        message: 'player names must be unique',
      }),
  })
  .strict();

const playerUpdate = z
  .object({
    id: z.number().int().positive(),
    // Either set an absolute score or apply a relative change. Deltas are
    // preferred for live updates because they combine safely when several
    // clients update the same player at once.
    score: z.number().int().min(0).max(1_000_000).optional(),
    delta: z.number().int().min(-1000).max(1000).optional(),
  })
  .strict()
  .refine((p) => (p.score == null) !== (p.delta == null), {
    message: 'provide exactly one of score or delta',
  });

export const updateSessionBody = z
  .object({
    status: z.enum(['active', 'completed']).optional(),
    players: z.array(playerUpdate).min(1).max(8).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine((b) => b.status || b.players, { message: 'nothing to update' });
