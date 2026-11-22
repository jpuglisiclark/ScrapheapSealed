import { COLORS, type Basics, type CardTemplate, type Color, type PoolCard } from './types.ts';

export const isLand = (c: Pick<CardTemplate, 'typeLine'>) => /\bLand\b/.test(c.typeLine.split('//')[0]);
export const isCreature = (c: Pick<CardTemplate, 'typeLine'>) => /\bCreature\b/.test(c.typeLine.split('//')[0]);
export const isBasicLand = (c: Pick<CardTemplate, 'typeLine'>) => /\bBasic\b/.test(c.typeLine) && isLand(c);

export const BASIC_NAMES: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** Colored mana symbols in a mana cost. Hybrid symbols count half to each side. */
export function pips(manaCost: string): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  // Only the front face's cost matters for casting the "main" half.
  const front = manaCost.split('//')[0];
  for (const m of front.matchAll(/\{([^}]+)\}/g)) {
    const parts = m[1].split('/').filter((p) => (COLORS as string[]).includes(p)) as Color[];
    for (const p of parts) out[p] += 1 / parts.length;
  }
  return out;
}

/** Colors a card asks you to play. Lands contribute nothing (they're fixing, not demand). */
export function cardColors(c: CardTemplate): Color[] {
  if (isLand(c)) return [];
  return c.colors.length ? c.colors : COLORS.filter((col) => pips(c.manaCost)[col] > 0);
}

export type ColorGroup = Color | 'M' | 'C' | 'L';
export function colorGroup(c: CardTemplate): ColorGroup {
  if (isLand(c)) return 'L';
  const cols = cardColors(c);
  if (cols.length === 0) return 'C';
  if (cols.length > 1) return 'M';
  return cols[0];
}

export const RARITY_ORDER: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 4 };

export function curveBucket(cmc: number): number {
  return Math.max(1, Math.min(6, Math.floor(cmc)));
}
export const CURVE_LABELS = ['1', '2', '3', '4', '5', '6+'];

/** Sum of front-face colored pips across nonland cards. */
export function totalPips(cards: CardTemplate[]): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of cards) {
    if (isLand(c)) continue;
    const p = pips(c.manaCost);
    for (const col of COLORS) out[col] += p[col];
  }
  return out;
}

/**
 * Distribute `landCount` basics proportionally to colored pips,
 * after accounting for nonbasic lands already in the deck.
 */
export function suggestBasics(cards: CardTemplate[], landCount = 17): Basics {
  const nonbasicLands = cards.filter((c) => isLand(c)).length;
  const toAdd = Math.max(0, landCount - nonbasicLands);
  const p = totalPips(cards);
  const total = COLORS.reduce((s, c) => s + p[c], 0);
  const out: Basics = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (total === 0 || toAdd === 0) return out;
  // Largest-remainder apportionment, with at least 1 land for any color that's present.
  const raw = COLORS.map((c) => ({ c, v: (p[c] / total) * toAdd }));
  let assigned = 0;
  for (const r of raw) {
    out[r.c] = r.v > 0 ? Math.max(1, Math.floor(r.v)) : 0;
    assigned += out[r.c];
  }
  const byRemainder = [...raw].filter((r) => r.v > 0).sort((a, b) => (b.v % 1) - (a.v % 1));
  let i = 0;
  while (assigned < toAdd && byRemainder.length) {
    out[byRemainder[i % byRemainder.length].c]++;
    assigned++;
    i++;
  }
  // If minimum-1 rule overshot, take from the largest.
  while (assigned > toAdd) {
    const biggest = COLORS.reduce((a, b) => (out[a] >= out[b] ? a : b));
    out[biggest]--;
    assigned--;
  }
  return out;
}

export const basicsCount = (b: Basics) => COLORS.reduce((s, c) => s + b[c], 0);

/** Arena/MTGO-importable decklist. */
export function exportDecklist(main: PoolCard[], basics: Basics, sideboard: PoolCard[]): string {
  const count = (cards: PoolCard[]) => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.name, (m.get(c.name) ?? 0) + 1);
    return [...m.entries()].map(([n, k]) => `${k} ${n}`);
  };
  const lines = ['Deck', ...count(main)];
  for (const col of COLORS) if (basics[col]) lines.push(`${basics[col]} ${BASIC_NAMES[col]}`);
  if (sideboard.length) lines.push('', 'Sideboard', ...count(sideboard));
  return lines.join('\n');
}

export const GUILDS: Record<string, string> = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WUG: 'Bant',
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
};
export const MONO: Record<Color, string> = { W: 'Mono-White', U: 'Mono-Blue', B: 'Mono-Black', R: 'Mono-Red', G: 'Mono-Green' };

export function sortColors(cols: Iterable<Color>): Color[] {
  const s = new Set(cols);
  return COLORS.filter((c) => s.has(c));
}

export function archetypeName(main: Color[], splash: Color[]): string {
  const key = sortColors(main).join('');
  let name = main.length === 0 ? 'Colorless' : main.length === 1 ? MONO[main[0]] : GUILDS[key] ?? `${main.length}-color`;
  if (main.length >= 4) name = main.length === 5 ? '5-color' : '4-color';
  if (splash.length) name += ` splash ${sortColors(splash).join('')}`;
  return name;
}
