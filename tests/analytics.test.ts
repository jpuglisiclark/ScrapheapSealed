import { describe, expect, it } from 'vitest';
import { comparePool, headToHead, analyzeDeck, similarity } from '../shared/analytics.ts';
import { pips, suggestBasics, exportDecklist, archetypeName } from '../shared/cards.ts';
import { emptyBasics, type Deck, type Pool, type PoolCard } from '../shared/types.ts';
import { card } from './fixtures.ts';

const pc = (uid: string, p: Parameters<typeof card>[0]): PoolCard => ({ ...card(p), uid, foil: false, pack: 1 });

const pool: Pool = {
  id: 'p', setCode: 'tst', setName: 'Test', boosterType: 'play', packCount: 1, createdBy: 'a', createdAt: '', basicLands: {},
  cards: [
    pc('1', { name: 'Bear', colors: ['G'], manaCost: '{1}{G}', cmc: 2 }),
    pc('2', { name: 'Bear', colors: ['G'], manaCost: '{1}{G}', cmc: 2 }),
    pc('3', { name: 'Bolt', colors: ['R'], manaCost: '{R}', cmc: 1, typeLine: 'Instant', rarity: 'rare' }),
    pc('4', { name: 'Angel', colors: ['W'], manaCost: '{3}{W}{W}', cmc: 5, rarity: 'mythic' }),
    pc('5', { name: 'Gate', typeLine: 'Land — Gate', manaCost: '', cmc: 0 }),
  ],
};
const deck = (id: string, main: string[], basics = emptyBasics()): Deck => ({
  id, poolId: 'p', playerName: id.toUpperCase(), main, basics, notes: '', layout: null, submittedAt: 'x', updatedAt: 'x',
});

describe('cards helpers', () => {
  it('counts pips including hybrid halves', () => {
    expect(pips('{2}{W}{W}')).toMatchObject({ W: 2 });
    expect(pips('{W/U}{B}')).toMatchObject({ W: 0.5, U: 0.5, B: 1 });
  });
  it('suggests basics proportional to pips, net of nonbasic lands', () => {
    const b = suggestBasics([pool.cards[0], pool.cards[1], pool.cards[2], pool.cards[4]], 17);
    expect(b.G + b.R).toBe(16);
    expect(b.G).toBeGreaterThan(b.R);
  });
  it('exports an importable decklist', () => {
    const txt = exportDecklist([pool.cards[0], pool.cards[1]], { ...emptyBasics(), G: 17 }, [pool.cards[2]]);
    expect(txt).toBe('Deck\n2 Bear\n17 Forest\n\nSideboard\n1 Bolt');
  });
  it('names archetypes', () => {
    expect(archetypeName(['R', 'G'], [])).toBe('Gruul');
    expect(archetypeName(['W', 'B'], ['R'])).toBe('Orzhov splash R');
  });
});

describe('analytics', () => {
  const a = deck('a', ['1', '2', '3', '5'], { ...emptyBasics(), G: 9, R: 7 });
  const b = deck('b', ['1', '4']);
  const c = deck('c', ['3']);

  it('analyzes a deck', () => {
    const x = analyzeDeck(pool, a);
    expect(x.total).toBe(20);
    expect(x.lands).toBe(17);
    expect(x.creatures).toBe(2);
    expect(x.curve).toEqual([1, 2, 0, 0, 0, 0]);
    expect(x.rares.map((r) => r.name)).toEqual(['Bolt']);
  });

  it('computes similarity by card name, not physical copy', () => {
    const x = analyzeDeck(pool, deck('x', ['1']));
    const y = analyzeDeck(pool, deck('y', ['2']));
    expect(similarity(x, y)).toBe(1);
    expect(similarity(analyzeDeck(pool, a), analyzeDeck(pool, b))).toBeCloseTo(1 / 5);
  });

  it('builds a head-to-head split', () => {
    const h = headToHead(analyzeDeck(pool, a), analyzeDeck(pool, b));
    expect(h.both.map((c) => c.name)).toEqual(['Bear']);
    expect(h.onlyA.map((c) => c.name).sort()).toEqual(['Bear', 'Bolt', 'Gate']);
    expect(h.onlyB.map((c) => c.name)).toEqual(['Angel']);
  });

  it('summarizes consensus across players', () => {
    const r = comparePool(pool, [a, b, c]);
    const bear = r.consensus.find((x) => x.name === 'Bear')!;
    expect(bear.copiesInPool).toBe(2);
    expect(bear.players.map((p) => p.playerName)).toEqual(['A', 'B']);
    expect(bear.rate).toBeCloseTo(2 / 3);
    expect(r.unanimous).toHaveLength(0);
    expect(r.uniquePicks.map((x) => x.name).sort()).toEqual(['Angel', 'Gate']);
    expect(r.benchedRares).toHaveLength(0);
    expect(r.matrix[0][0]).toBe(1);
  });
});
