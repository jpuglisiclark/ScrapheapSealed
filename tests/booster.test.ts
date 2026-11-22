import { describe, expect, it } from 'vitest';
import { generatePool, mulberry32 } from '../shared/booster.ts';
import { fakeSet } from './fixtures.ts';

describe('generatePool', () => {
  it('opens draft boosters as 1 rare/mythic, 3 uncommons, 10 commons', () => {
    const pool = generatePool(fakeSet(), 'draft', 6, mulberry32(1));
    expect(pool).toHaveLength(84);
    for (let p = 1; p <= 6; p++) {
      const pack = pool.filter((c) => c.pack === p);
      expect(pack.filter((c) => c.rarity === 'rare' || c.rarity === 'mythic')).toHaveLength(1);
      expect(pack.filter((c) => c.rarity === 'uncommon')).toHaveLength(3);
      expect(pack.filter((c) => c.rarity === 'common')).toHaveLength(10);
    }
  });

  it('opens play boosters with a foil and a land slot, never basics', () => {
    const pool = generatePool(fakeSet(), 'play', 6, mulberry32(2));
    expect(pool).toHaveLength(6 * 14);
    expect(pool.filter((c) => c.foil)).toHaveLength(6);
    expect(pool.some((c) => c.name === 'Plains')).toBe(false);
    for (let p = 1; p <= 6; p++) {
      expect(pool.filter((c) => c.pack === p && !c.foil && c.name.startsWith('Common Land')).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every card a unique uid and is reproducible with a seed', () => {
    const a = generatePool(fakeSet(), 'play', 6, mulberry32(3));
    const b = generatePool(fakeSet(), 'play', 6, mulberry32(3));
    expect(new Set(a.map((c) => c.uid)).size).toBe(a.length);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
  });

  it('does not repeat a card within the same sheet of a pack', () => {
    const pool = generatePool(fakeSet(), 'draft', 1, mulberry32(4));
    const commons = pool.filter((c) => c.rarity === 'common').map((c) => c.name);
    expect(new Set(commons).size).toBe(commons.length);
  });
});
