import { COLORS, emptyBasics, type Basics, type Color, type Layout, type Pool, type PoolCard } from './types.ts';
import { BASIC_NAMES, colorGroup, curveBucket, isCreature, isLand } from './cards.ts';

export type Zone = 'deck' | 'side';
export type SortMode = 'color' | 'cmc' | 'type';

const BASIC_RE = /^basic-([WUBRG])-(\d+)$/;
export const isBasicId = (uid: string) => BASIC_RE.test(uid);
export const basicColor = (uid: string) => (uid.match(BASIC_RE)?.[1] ?? null) as Color | null;

/** A basic land as a card object, using the pool's basic land printing when available. */
export function basicCard(pool: Pick<Pool, 'basicLands'>, uid: string): PoolCard {
  const color = basicColor(uid)!;
  const t = pool.basicLands?.[color];
  return {
    scryfallId: t?.scryfallId ?? `basic-${color}`,
    name: BASIC_NAMES[color],
    manaCost: '',
    cmc: 0,
    colors: [],
    colorIdentity: [color],
    typeLine: t?.typeLine ?? `Basic Land — ${BASIC_NAMES[color]}`,
    rarity: 'common',
    oracleText: t?.oracleText ?? '',
    producedMana: [color],
    image: t?.image ?? null,
    imageBack: null,
    collectorNumber: t?.collectorNumber ?? '',
    uid,
    foil: false,
    pack: 0,
  };
}

/** Ordering key used to decide which pile a card belongs in. */
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G', 'M', 'C', 'L'];
export function sortKey(card: PoolCard, mode: SortMode): number {
  if (mode === 'color') return COLOR_ORDER.indexOf(colorGroup(card));
  if (mode === 'type') return isLand(card) ? 2 : isCreature(card) ? 0 : 1;
  return isLand(card) ? 7 : curveBucket(card.cmc);
}

const byCmcName = (a: PoolCard, b: PoolCard) =>
  a.cmc - b.cmc || a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid, undefined, { numeric: true });

/** Arrange cards into piles by sort key, each pile ordered by mana value then name. */
export function sortedColumns(cards: PoolCard[], mode: SortMode): string[][] {
  const groups = new Map<number, PoolCard[]>();
  for (const c of cards) {
    const k = sortKey(c, mode);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, cs]) => cs.sort(byCmcName).map((c) => c.uid));
}

const clean = (cols: string[][]) => cols.filter((c) => c.length > 0);

export function removeCard(layout: Layout, uid: string): Layout {
  const strip = (cols: string[][]) => clean(cols.map((col) => col.filter((u) => u !== uid)));
  return { deck: strip(layout.deck), side: strip(layout.side) };
}

export type DropTarget = { zone: Zone; col: number; index: number } | { zone: Zone; newCol: number };

/** Move a card to an exact spot. Basic lands dropped in the sideboard are removed. */
export function moveCard(layout: Layout, uid: string, target: DropTarget): Layout {
  return moveCards(layout, [uid], target);
}

/**
 * Move a group of cards to one spot, keeping them together in the given order.
 * `target.index` refers to positions in the pile as it is before the move.
 * Basic lands dropped in the sideboard are removed.
 */
export function moveCards(layout: Layout, uids: string[], target: DropTarget): Layout {
  const moving = new Set(uids);
  const placed = target.zone === 'side' ? uids.filter((u) => !isBasicId(u)) : uids;
  const strip = (cols: string[][]) => cols.map((col) => col.filter((u) => !moving.has(u)));
  const out: Layout = { deck: strip(layout.deck), side: strip(layout.side) };
  const cols = out[target.zone];
  if ('newCol' in target) {
    if (placed.length) cols.splice(Math.max(0, Math.min(cols.length, target.newCol)), 0, [...placed]);
  } else {
    const before = layout[target.zone][target.col] ?? [];
    const index = before.slice(0, target.index).filter((u) => !moving.has(u)).length;
    if (!cols[target.col]) cols[target.col] = [];
    cols[target.col].splice(index, 0, ...placed);
  }
  return { deck: clean(out.deck), side: clean(out.side) };
}

/** Card ids in on-screen order: pile by pile, top to bottom, deck first. */
export function layoutOrder(layout: Layout): string[] {
  return [...layout.deck.flat(), ...layout.side.flat()];
}

/**
 * Put a card in the pile it naturally belongs to (same sort key as that pile's first card),
 * creating a new pile in sorted position if none matches. Basics join their own color's pile first.
 */
export function placeCard(layout: Layout, zone: Zone, card: PoolCard, mode: SortMode, getCard: (uid: string) => PoolCard): Layout {
  const base = removeCard(layout, card.uid);
  if (zone === 'side' && isBasicId(card.uid)) return base;
  const cols = base[zone].map((c) => [...c]);
  const key = sortKey(card, mode);
  const color = basicColor(card.uid);
  let target = color ? cols.findIndex((col) => col.some((u) => basicColor(u) === color)) : -1;
  if (target === -1) target = cols.findIndex((col) => sortKey(getCard(col[0]), mode) === key);
  if (target !== -1) {
    const col = cols[target];
    // Keep the pile in mana value order where it already is; otherwise just add to the bottom.
    let at = col.findIndex((u) => byCmcName(card, getCard(u)) < 0);
    if (at === -1 || color) at = col.length;
    col.splice(at, 0, card.uid);
  } else {
    let at = cols.findIndex((col) => sortKey(getCard(col[0]), mode) > key);
    if (at === -1) at = cols.length;
    cols.splice(at, 0, [card.uid]);
  }
  return { ...base, [zone]: cols };
}

export function mainFromLayout(layout: Layout): string[] {
  return layout.deck.flat().filter((u) => !isBasicId(u));
}

export function basicsFromLayout(layout: Layout): Basics {
  const b = emptyBasics();
  for (const u of layout.deck.flat()) {
    const c = basicColor(u);
    if (c) b[c]++;
  }
  return b;
}

/** A fresh id for one more basic land of this color. */
export function nextBasicId(layout: Layout, color: Color): string {
  let max = 0;
  for (const u of layout.deck.flat()) {
    const m = u.match(BASIC_RE);
    if (m && m[1] === color) max = Math.max(max, Number(m[2]));
  }
  return `basic-${color}-${max + 1}`;
}

/**
 * Make a saved layout agree with the deck's actual contents: every pool card appears exactly
 * once (deck if in `main`, otherwise sideboard), and basics match `basics` counts.
 */
export function reconcileLayout(pool: Pool, main: string[], basics: Basics, saved: Layout | null, sideMode: SortMode = 'color'): Layout {
  const mainSet = new Set(main);
  const byUid = new Map(pool.cards.map((c) => [c.uid, c]));
  const getCard = (u: string) => (isBasicId(u) ? basicCard(pool, u) : byUid.get(u)!);

  if (!saved) {
    const basicIds = COLORS.flatMap((c) => Array.from({ length: basics[c] }, (_, i) => `basic-${c}-${i + 1}`));
    const deckCards = [...main.map((u) => byUid.get(u)).filter((c): c is PoolCard => !!c), ...basicIds.map(getCard)];
    return {
      deck: sortedColumns(deckCards, 'cmc'),
      side: sortedColumns(pool.cards.filter((c) => !mainSet.has(c.uid)), sideMode),
    };
  }

  const seen = new Set<string>();
  const basicSeen = emptyBasics();
  const keepDeck = (u: string) => {
    if (seen.has(u)) return false;
    const color = basicColor(u);
    if (color) {
      if (basicSeen[color] >= basics[color]) return false;
      basicSeen[color]++;
    } else if (!mainSet.has(u)) return false;
    seen.add(u);
    return true;
  };
  const keepSide = (u: string) => {
    if (seen.has(u) || !byUid.has(u) || mainSet.has(u)) return false;
    seen.add(u);
    return true;
  };
  let layout: Layout = {
    deck: clean(saved.deck.map((col) => col.filter(keepDeck))),
    side: clean(saved.side.map((col) => col.filter(keepSide))),
  };
  for (const c of COLORS) {
    for (let i = basicSeen[c]; i < basics[c]; i++) layout = placeCard(layout, 'deck', basicCard(pool, nextBasicId(layout, c)), 'cmc', getCard);
  }
  for (const card of pool.cards) {
    if (seen.has(card.uid)) continue;
    layout = placeCard(layout, mainSet.has(card.uid) ? 'deck' : 'side', card, mainSet.has(card.uid) ? 'cmc' : sideMode, getCard);
  }
  return layout;
}

/** Basic sanity limits on a layout sent by a client. */
export function sanitizeLayout(v: unknown): Layout | null {
  if (!v || typeof v !== 'object') return null;
  const cols = (x: unknown) =>
    Array.isArray(x)
      ? x
          .slice(0, 60)
          .filter(Array.isArray)
          .map((col: unknown[]) => col.filter((u): u is string => typeof u === 'string' && u.length <= 24).slice(0, 200))
      : [];
  const l = v as Record<string, unknown>;
  return { deck: cols(l.deck), side: cols(l.side) };
}
