import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import type { DB } from './db.ts';
import { generatePool } from '../shared/booster.ts';
import { COLORS, emptyBasics, type Basics, type BasicLands, type CardTemplate, type Deck, type DeckSummary, type Pool, type PoolListItem, type SetInfo } from '../shared/types.ts';
import { sanitizeLayout } from '../shared/layout.ts';

export interface CardSource {
  fetchSets(): Promise<SetInfo[]>;
  fetchSetCards(code: string): Promise<CardTemplate[]>;
  fetchBasics(code: string): Promise<BasicLands>;
}

export interface AppOptions {
  db: DB;
  cards: CardSource;
  staticDir?: string;
  setCacheMs?: number;
  /** The only set pools are opened from. */
  setCode?: string;
}

const id = (bytes = 6) => crypto.randomBytes(bytes).toString('base64url');
const now = () => new Date().toISOString();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const cleanName = (v: unknown, field = 'Name') => {
  const s = typeof v === 'string' ? v.trim().slice(0, 40) : '';
  if (!s) throw new HttpError(400, `${field} is required`);
  return s;
};

function tokensMatch(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createApp({ db, cards, staticDir, setCacheMs = 7 * 24 * 3600 * 1000, setCode = 'trk' }: AppOptions) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  // ---- data access -------------------------------------------------------
  const rowToDeck = (r: any): Deck => ({
    id: r.id,
    poolId: r.pool_id,
    playerName: r.player_name,
    main: JSON.parse(r.main),
    basics: JSON.parse(r.basics),
    notes: r.notes,
    layout: r.layout ? JSON.parse(r.layout) : null,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  });

  function loadPool(poolId: string): Pool {
    const r: any = db.prepare('SELECT * FROM pools WHERE id = ?').get(poolId);
    if (!r) throw new HttpError(404, 'Pool not found');
    return {
      id: r.id,
      setCode: r.set_code,
      setName: r.set_name,
      boosterType: r.booster_type,
      packCount: r.pack_count,
      createdBy: r.created_by,
      createdAt: r.created_at,
      cards: JSON.parse(r.cards),
      basicLands: JSON.parse(r.basic_lands ?? '{}'),
    };
  }

  function deckSummaries(poolId: string): DeckSummary[] {
    return (db.prepare('SELECT * FROM decks WHERE pool_id = ? ORDER BY created_at').all(poolId) as any[]).map((r) => ({
      id: r.id,
      playerName: r.player_name,
      mainCount: JSON.parse(r.main).length,
      submittedAt: r.submitted_at,
      updatedAt: r.updated_at,
    }));
  }

  /** Loads a deck and verifies the caller's token. */
  function authDeck(req: Request): { row: any; deck: Deck } {
    const row: any = db.prepare('SELECT * FROM decks WHERE id = ?').get(req.params.deckId);
    if (!row) throw new HttpError(404, 'Deck not found');
    const token = req.header('x-deck-token') ?? '';
    if (!tokensMatch(token, row.token)) throw new HttpError(403, 'Not your deck');
    return { row, deck: rowToDeck(row) };
  }

  let setsCache: { at: number; sets: SetInfo[] } | null = null;
  async function getSets() {
    if (!setsCache || Date.now() - setsCache.at > 12 * 3600 * 1000) setsCache = { at: Date.now(), sets: await cards.fetchSets() };
    return setsCache.sets;
  }

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const r: any = db.prepare('SELECT * FROM set_cache WHERE code = ?').get(key);
    if (r && Date.now() - r.fetched_at < setCacheMs) return JSON.parse(r.data);
    const value = await load();
    db.prepare('INSERT OR REPLACE INTO set_cache (code, fetched_at, data) VALUES (?, ?, ?)').run(key, Date.now(), JSON.stringify(value));
    return value;
  }

  async function currentSet(): Promise<SetInfo> {
    const set = (await getSets()).find((s) => s.code === setCode);
    if (!set) throw new HttpError(500, `Set ${setCode.toUpperCase()} is not available`);
    return set;
  }

  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

  // ---- routes ------------------------------------------------------------
  app.get('/api/config', wrap(async (_req, res) => res.json({ set: await currentSet(), boosterType: 'play' })));

  app.get(
    '/api/pools',
    wrap((_req, res) => {
      const pools = db.prepare('SELECT id, set_code, set_name, created_by, created_at FROM pools ORDER BY created_at DESC LIMIT 200').all() as any[];
      const decks = db.prepare('SELECT id, pool_id, player_name, submitted_at FROM decks ORDER BY created_at').all() as any[];
      const out: PoolListItem[] = pools.map((p) => ({
        id: p.id,
        setCode: p.set_code,
        setName: p.set_name,
        createdBy: p.created_by,
        createdAt: p.created_at,
        players: decks.filter((d) => d.pool_id === p.id).map((d) => ({ deckId: d.id, playerName: d.player_name, submitted: !!d.submitted_at })),
      }));
      res.json(out);
    }),
  );

  app.post(
    '/api/pools',
    wrap(async (req, res) => {
      const { packCount = 6, createdBy } = req.body ?? {};
      const name = cleanName(createdBy, 'Your name');
      const packs = Number(packCount);
      if (!Number.isInteger(packs) || packs < 1 || packs > 12) throw new HttpError(400, 'Pack count must be 1–12');
      const set = await currentSet();
      const setCards = await cached(set.code, () => cards.fetchSetCards(set.code));
      const basicLands = await cached(`basics:${set.code}`, () => cards.fetchBasics(set.code));
      const pool = generatePool(setCards, 'play', packs);
      const poolId = id();
      db.prepare(
        'INSERT INTO pools (id, set_code, set_name, booster_type, pack_count, created_by, created_at, cards, basic_lands) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(poolId, set.code, set.name, 'play', packs, name, now(), JSON.stringify(pool), JSON.stringify(basicLands));
      res.status(201).json({ id: poolId });
    }),
  );

  app.get('/api/pools/:poolId', wrap((req, res) => res.json({ ...loadPool(req.params.poolId), decks: deckSummaries(req.params.poolId) })));

  app.post(
    '/api/pools/:poolId/decks',
    wrap((req, res) => {
      const pool = loadPool(req.params.poolId);
      const playerName = cleanName(req.body?.playerName);
      const deckId = id();
      const token = id(24);
      const t = now();
      db.prepare(
        'INSERT INTO decks (id, pool_id, player_name, token, main, basics, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(deckId, pool.id, playerName, token, '[]', JSON.stringify(emptyBasics()), '', t, t);
      res.status(201).json({ deckId, token, playerName });
    }),
  );

  app.get('/api/decks/:deckId', wrap((req, res) => res.json(authDeck(req).deck)));

  app.put(
    '/api/decks/:deckId',
    wrap((req, res) => {
      const { row, deck } = authDeck(req);
      const pool = loadPool(row.pool_id);
      const body = req.body ?? {};
      const submit: boolean | undefined = body.submitted;

      if (deck.submittedAt && submit !== false && (body.main || body.basics || body.layout)) {
        throw new HttpError(409, 'Deck is submitted. Reopen it to make changes.');
      }

      let main = deck.main;
      if (body.main !== undefined) {
        if (!Array.isArray(body.main)) throw new HttpError(400, 'main must be a list');
        const valid = new Set(pool.cards.map((c) => c.uid));
        main = [...new Set(body.main as unknown[])].filter((u): u is string => typeof u === 'string' && valid.has(u));
      }
      let basics: Basics = deck.basics;
      if (body.basics !== undefined) {
        basics = emptyBasics();
        for (const c of COLORS) {
          const n = Number(body.basics?.[c] ?? 0);
          basics[c] = Number.isInteger(n) ? Math.max(0, Math.min(60, n)) : 0;
        }
      }
      const layout = body.layout !== undefined ? sanitizeLayout(body.layout) : deck.layout;
      const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : deck.notes;
      const playerName = body.playerName !== undefined ? cleanName(body.playerName) : deck.playerName;
      let submittedAt = deck.submittedAt;
      if (submit === true) submittedAt = now();
      if (submit === false) submittedAt = null;

      db.prepare('UPDATE decks SET main = ?, basics = ?, layout = ?, notes = ?, player_name = ?, submitted_at = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(main),
        JSON.stringify(basics),
        layout ? JSON.stringify(layout) : null,
        notes,
        playerName,
        submittedAt,
        now(),
        deck.id,
      );
      res.json(rowToDeck(db.prepare('SELECT * FROM decks WHERE id = ?').get(deck.id)));
    }),
  );

  /** Everyone's submitted decks. Only visible once you've submitted your own (no peeking!). */
  app.get(
    '/api/pools/:poolId/results',
    wrap((req, res) => {
      const pool = loadPool(req.params.poolId);
      const rows = db.prepare('SELECT * FROM decks WHERE pool_id = ?').all(pool.id) as any[];
      const token = req.header('x-deck-token') ?? '';
      const me = rows.find((r) => tokensMatch(token, r.token));
      if (!me) throw new HttpError(403, 'Build and submit a deck for this pool to see results.');
      if (!me.submitted_at) throw new HttpError(403, 'Submit your deck to unlock everyone else’s.');
      res.json({
        pool: { ...pool, decks: deckSummaries(pool.id) },
        decks: rows.filter((r) => r.submitted_at).map(rowToDeck),
      });
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err.status && err.status < 500 ? 502 : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message ?? 'Something went wrong' });
  });

  return app;
}
