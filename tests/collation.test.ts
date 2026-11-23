import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { collationRefs, generateCollationPool, openCollationPack, parseCollation, refKey } from '../shared/collation.ts';
import { mulberry32 } from '../shared/booster.ts';
import type { CardTemplate, Rarity } from '../shared/types.ts';
import { createApp } from '../server/app.ts';
import { openDb } from '../server/db.ts';

const text = fs.readFileSync(path.resolve('server/collations/trk.txt'), 'utf8');
const trk = parseCollation(text);

/** Which sheet each card came from, so packs can be checked by sheet. */
const sheetOf = new Map<string, string>();
for (const [name, refs] of Object.entries(trk.sheets)) for (const r of refs) sheetOf.set(refKey(r), name);

describe('TRK collation file', () => {
  it('parses settings, layouts and sheets', () => {
    expect(trk.name).toBe('Star Trek (TRK) Play Booster - primary art only');
    expect(trk.layouts.map((l) => [l.name, l.weight, l.slots.length])).toEqual([
      ['Play Booster', 24, 14],
      ['Play Booster with Stardates', 1, 14],
    ]);
    expect(Object.fromEntries(Object.entries(trk.sheets).map(([k, v]) => [k, v.length]))).toEqual({
      'Main Common': 81, 'Main Uncommon': 110, 'Main Rare': 80, 'Main Mythic': 25, 'Dual Land': 10, 'Basic Land': 10, Stardates: 30,
    });
    expect(collationRefs(trk)).toHaveLength(346);
    expect(trk.sheets['Main Common'][0]).toEqual({ count: 1, name: 'Andromedan Automatons', set: 'trk', collectorNumber: '2' });
  });

  it('opens 14-card packs with one foil and no duplicate names', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const pack = openCollationPack(trk, rng);
      expect(pack).toHaveLength(14);
      expect(pack.filter((c) => c.foil)).toHaveLength(1);
      expect(new Set(pack.map((c) => c.ref.name)).size).toBe(14);
    }
  });

  it('matches the slot rates in the file', () => {
    const rng = mulberry32(42);
    const N = 25000;
    const count = (slot: string, sheet: string, packs: ReturnType<typeof openCollationPack>[]) =>
      packs.filter((p) => p.some((c) => c.slot === slot && sheetOf.get(refKey(c.ref)) === sheet)).length / packs.length;
    const packs = Array.from({ length: N }, () => openCollationPack(trk, rng));
    // Rare slot: mythic 124 / (868 + 124) = 12.5%
    expect(count('Rare or Mythic', 'Main Mythic', packs)).toBeCloseTo(124 / 992, 2);
    // Wildcard: uncommon 576 / 977 = 59%
    expect(count('Wildcard', 'Main Uncommon', packs)).toBeCloseTo(576 / 977, 2);
    // Foil: common 512 / 969 = 52.8%
    expect(count('Traditional Foil', 'Main Common', packs)).toBeCloseTo(512 / 969, 2);
    // Land slot: dual 500 / 1002
    expect(count('Land', 'Dual Land', packs)).toBeCloseTo(500 / 1002, 2);
    // Stardates layout in 1 of 25 packs, replacing a common
    const stardates = packs.filter((p) => p.some((c) => c.slot === 'Stardates'));
    expect(stardates.length / N).toBeCloseTo(1 / 25, 2);
    expect(stardates.every((p) => p.filter((c) => sheetOf.get(refKey(c.ref)) === 'Main Common' && !c.foil && c.slot.startsWith('Common')).length === 6)).toBe(true);
  });

  it('builds a pool from fetched card data and skips printings the database lacks', () => {
    const cards: Record<string, CardTemplate> = {};
    for (const r of collationRefs(trk)) {
      if (r.name === 'Moopsy') continue; // pretend this one is missing
      cards[refKey(r)] = { scryfallId: refKey(r), name: r.name, manaCost: '', cmc: 0, colors: [], colorIdentity: [], typeLine: 'Creature', rarity: 'common' as Rarity, oracleText: '', producedMana: [], image: null, imageBack: null, collectorNumber: r.collectorNumber };
    }
    const pool = generateCollationPool(trk, cards, 6, mulberry32(3));
    expect(pool.length).toBeGreaterThanOrEqual(6 * 14 - 6);
    expect(pool.some((c) => c.name === 'Moopsy')).toBe(false);
    expect(new Set(pool.map((c) => c.uid)).size).toBe(pool.length);
    expect(pool.filter((c) => c.foil)).toHaveLength(6);
  });

  it('the server opens pools from the collation when one is given', async () => {
    let fetched = 0;
    const app = createApp({
      db: openDb(':memory:'),
      setCode: 'trk',
      collation: trk,
      cards: {
        fetchSets: async () => [{ code: 'trk', name: 'Star Trek', releasedAt: '2026-11-13', setType: 'expansion', iconSvg: '' }],
        fetchSetCards: async () => {
          throw new Error('should not be used when a collation is set');
        },
        fetchBasics: async () => ({}),
        fetchCards: async (refs) => {
          fetched++;
          return Object.fromEntries(refs.map((r) => [refKey(r), { scryfallId: refKey(r), name: (r as any).name, manaCost: '', cmc: 0, colors: [], colorIdentity: [], typeLine: 'Creature', rarity: 'common', oracleText: '', producedMana: [], image: null, imageBack: null, collectorNumber: r.collectorNumber }]));
        },
      },
    });
    const { id } = (await request(app).post('/api/pools').send({ createdBy: 'A' }).expect(201)).body;
    const pool = (await request(app).get(`/api/pools/${id}`).expect(200)).body;
    expect(pool.cards).toHaveLength(84);
    await request(app).post('/api/pools').send({ createdBy: 'B' }).expect(201);
    expect(fetched).toBe(1); // card data cached
  });
});
