import { describe, expect, it } from 'vitest';
import { moveCards, basicCard, basicsFromLayout, mainFromLayout, moveCard, nextBasicId, placeCard, reconcileLayout, removeCard } from '../shared/layout.ts';
import { emptyBasics, type Layout, type Pool, type PoolCard } from '../shared/types.ts';
import { card } from './fixtures.ts';

const pc = (uid: string, p: Parameters<typeof card>[0]): PoolCard => ({ ...card(p), uid, foil: false, pack: 1 });
const pool: Pool = {
  id: 'p', setCode: 't', setName: 'T', boosterType: 'play', packCount: 1, createdBy: '', createdAt: '',
  basicLands: { G: card({ name: 'Forest', typeLine: 'Basic Land — Forest', image: 'forest.jpg' }) },
  cards: [
    pc('a', { name: 'Two Drop', colors: ['G'], manaCost: '{1}{G}', cmc: 2 }),
    pc('b', { name: 'Three Drop', colors: ['G'], manaCost: '{2}{G}', cmc: 3 }),
    pc('c', { name: 'Other Two', colors: ['R'], manaCost: '{1}{R}', cmc: 2 }),
    pc('d', { name: 'Gate', typeLine: 'Land', manaCost: '', cmc: 0 }),
  ],
};
const get = (u: string) => (u.startsWith('basic-') ? basicCard(pool, u) : pool.cards.find((c) => c.uid === u)!);

describe('layout', () => {
  it('builds a default layout: deck by mana value with basics, sideboard by color', () => {
    const l = reconcileLayout(pool, ['a', 'b'], { ...emptyBasics(), G: 2 }, null);
    expect(l.deck).toEqual([['a'], ['b'], ['basic-G-1', 'basic-G-2']]);
    expect(l.side).toEqual([['c'], ['d']]);
    expect(basicCard(pool, 'basic-G-1').image).toBe('forest.jpg');
    expect(basicCard(pool, 'basic-W-1').name).toBe('Plains');
  });

  it('keeps a saved arrangement but fixes it to match the real deck', () => {
    const saved: Layout = { deck: [['b', 'a', 'c', 'basic-G-1', 'basic-G-2', 'a']], side: [['zzz']] };
    const l = reconcileLayout(pool, ['a', 'b'], { ...emptyBasics(), G: 1 }, saved);
    expect(l.deck).toEqual([['b', 'a', 'basic-G-1']]);
    expect(l.side.flat().sort()).toEqual(['c', 'd']);
  });

  it('moves cards anywhere, including within a pile, across zones, and into a new pile', () => {
    let l: Layout = { deck: [['a', 'b']], side: [['c'], ['d']] };
    l = moveCard(l, 'a', { zone: 'deck', col: 0, index: 2 });
    expect(l.deck).toEqual([['b', 'a']]);
    l = moveCard(l, 'c', { zone: 'deck', col: 0, index: 1 });
    expect(l).toEqual({ deck: [['b', 'c', 'a']], side: [['d']] });
    l = moveCard(l, 'a', { zone: 'deck', newCol: 0 });
    expect(l.deck).toEqual([['a'], ['b', 'c']]);
    l = moveCard(l, 'a', { zone: 'side', col: 0, index: 0 });
    expect(l).toEqual({ deck: [['b', 'c']], side: [['a', 'd']] });
  });

  it('removes basics dropped into the sideboard', () => {
    const l = moveCard({ deck: [['basic-G-1', 'a']], side: [] }, 'basic-G-1', { zone: 'side', col: 0, index: 0 });
    expect(l).toEqual({ deck: [['a']], side: [] });
  });

  it('places clicked cards in the matching pile and new basics with their color', () => {
    let l: Layout = { deck: [['a'], ['basic-G-1']], side: [['b', 'c']] };
    l = placeCard(l, 'deck', get('c'), 'cmc', get);
    expect(l.deck).toEqual([['c', 'a'], ['basic-G-1']]);
    l = placeCard(l, 'deck', get('b'), 'cmc', get);
    expect(l.deck).toEqual([['c', 'a'], ['b'], ['basic-G-1']]);
    l = placeCard(l, 'deck', basicCard(pool, nextBasicId(l, 'G')), 'cmc', get);
    expect(l.deck[2]).toEqual(['basic-G-1', 'basic-G-2']);
    expect(basicsFromLayout(l).G).toBe(2);
    expect(mainFromLayout(l)).toEqual(['c', 'a', 'b']);
    expect(removeCard(l, 'b').deck).toHaveLength(2);
  });

  it('moves a group of cards together, from several piles and zones', () => {
    const l: Layout = { deck: [['a', 'b', 'basic-G-1'], ['x']], side: [['c', 'd'], ['e']] };
    // into the middle of a pile, counting positions as they were before the move
    expect(moveCards(l, ['a', 'c', 'e'], { zone: 'deck', col: 0, index: 2 })).toEqual({ deck: [['b', 'a', 'c', 'e', 'basic-G-1'], ['x']], side: [['d']] });
    // into a new pile
    expect(moveCards(l, ['b', 'x'], { zone: 'deck', newCol: 2 })).toEqual({ deck: [['a', 'basic-G-1'], ['b', 'x']], side: [['c', 'd'], ['e']] });
    // to the sideboard: basics are dropped
    expect(moveCards(l, ['a', 'basic-G-1'], { zone: 'side', col: 1, index: 1 })).toEqual({ deck: [['b'], ['x']], side: [['c', 'd'], ['e', 'a']] });
  });
});
