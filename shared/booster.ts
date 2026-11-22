import type { BoosterType, CardTemplate, PoolCard, Rarity } from './types.ts';
import { isBasicLand, isLand } from './cards.ts';

export type Rng = () => number;

/** Small seedable PRNG so pools can be reproduced in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sheets {
  common: CardTemplate[];
  uncommon: CardTemplate[];
  rare: CardTemplate[];
  mythic: CardTemplate[];
  commonLand: CardTemplate[];
}

export function buildSheets(cards: CardTemplate[]): Sheets {
  const nonBasic = cards.filter((c) => !isBasicLand(c));
  const by = (r: Rarity) => nonBasic.filter((c) => c.rarity === r);
  return {
    common: by('common'),
    uncommon: by('uncommon'),
    rare: by('rare'),
    mythic: by('mythic'),
    commonLand: by('common').filter((c) => isLand(c)),
  };
}

/** Pick `n` distinct cards from a sheet (or with repeats if the sheet is too small). */
function pick(sheet: CardTemplate[], n: number, rng: Rng): CardTemplate[] {
  if (sheet.length === 0 || n <= 0) return [];
  if (sheet.length < n) return Array.from({ length: n }, () => sheet[Math.floor(rng() * sheet.length)]);
  const idx = new Set<number>();
  while (idx.size < n) idx.add(Math.floor(rng() * sheet.length));
  return [...idx].map((i) => sheet[i]);
}

function firstNonEmpty(...sheets: CardTemplate[][]): CardTemplate[] {
  return sheets.find((s) => s.length > 0) ?? [];
}

function rareSlot(s: Sheets, mythicChance: number, rng: Rng): CardTemplate[] {
  const sheet = s.mythic.length && rng() < mythicChance ? s.mythic : firstNonEmpty(s.rare, s.mythic, s.uncommon);
  return pick(sheet, 1, rng);
}

function weightedSlot(s: Sheets, weights: [number, number, number, number], rng: Rng): CardTemplate[] {
  const sheets = [s.common, s.uncommon, s.rare, s.mythic];
  const live = weights.map((w, i) => (sheets[i].length ? w : 0));
  const total = live.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < 4; i++) {
    if ((r -= live[i]) < 0) return pick(sheets[i], 1, rng);
  }
  return pick(firstNonEmpty(...sheets), 1, rng);
}

export interface OpenedCard {
  card: CardTemplate;
  foil: boolean;
}

/**
 * Open one booster. Approximations of real collation:
 * - draft: 10 commons, 3 uncommons, 1 rare/mythic (mythic 1 in 8)
 * - play: 7 commons, 3 uncommons, 1 rare/mythic (mythic ~1 in 7), 1 wildcard,
 *   1 foil wildcard, and a common nonbasic land if the set has any.
 */
export function openPack(sheets: Sheets, type: BoosterType, rng: Rng): OpenedCard[] {
  const nf = (cards: CardTemplate[]) => cards.map((card) => ({ card, foil: false }));
  if (type === 'draft') {
    return [
      ...nf(rareSlot(sheets, 1 / 8, rng)),
      ...nf(pick(sheets.uncommon, 3, rng)),
      ...nf(pick(sheets.common, 10, rng)),
    ];
  }
  const commonsNoLands = sheets.common.filter((c) => !sheets.commonLand.includes(c));
  return [
    ...nf(rareSlot(sheets, 1 / 7, rng)),
    ...nf(pick(sheets.uncommon, 3, rng)),
    ...nf(weightedSlot(sheets, [0.42, 0.42, 0.13, 0.03], rng)),
    ...nf(pick(commonsNoLands.length ? commonsNoLands : sheets.common, 7, rng)),
    ...nf(pick(sheets.commonLand, 1, rng)),
    ...weightedSlot(sheets, [0.6, 0.3, 0.085, 0.015], rng).map((card) => ({ card, foil: true })),
  ];
}

export function generatePool(cards: CardTemplate[], type: BoosterType, packCount: number, rng: Rng = Math.random): PoolCard[] {
  const sheets = buildSheets(cards);
  if (sheets.common.length + sheets.uncommon.length + sheets.rare.length + sheets.mythic.length === 0) {
    throw new Error('This set has no booster cards to open.');
  }
  const out: PoolCard[] = [];
  for (let p = 0; p < packCount; p++) {
    for (const { card, foil } of openPack(sheets, type, rng)) {
      out.push({ ...card, uid: `${p}-${out.length}`, foil, pack: p + 1 });
    }
  }
  return out;
}
