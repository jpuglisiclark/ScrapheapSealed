import { COLORS, type Color, type Deck, type Pool, type PoolCard } from './types.ts';
import {
  archetypeName,
  basicsCount,
  cardColors,
  curveBucket,
  isBasicLand,
  isCreature,
  isLand,
  sortColors,
} from './cards.ts';

export interface DeckAnalysis {
  deck: Deck;
  cards: PoolCard[];
  spells: PoolCard[];
  total: number;
  lands: number;
  nonbasicLands: number;
  creatures: number;
  noncreatureSpells: number;
  avgCmc: number;
  /** index 0..5 → cmc 1(or less), 2, 3, 4, 5, 6+ */
  curve: number[];
  creatureCurve: number[];
  /** nonland spells per color (gold cards count toward each of their colors) */
  colorCounts: Record<Color, number>;
  mainColors: Color[];
  splashColors: Color[];
  archetype: string;
  rares: PoolCard[];
}

export function analyzeDeck(pool: Pool, deck: Deck): DeckAnalysis {
  const byUid = new Map(pool.cards.map((c) => [c.uid, c]));
  const cards = deck.main.map((u) => byUid.get(u)).filter((c): c is PoolCard => !!c);
  const spells = cards.filter((c) => !isLand(c));
  const nonbasicLands = cards.length - spells.length;
  const curve = [0, 0, 0, 0, 0, 0];
  const creatureCurve = [0, 0, 0, 0, 0, 0];
  const colorCounts: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of spells) {
    curve[curveBucket(c.cmc) - 1]++;
    if (isCreature(c)) creatureCurve[curveBucket(c.cmc) - 1]++;
    for (const col of cardColors(c)) colorCounts[col]++;
  }
  const { main, splash } = classifyColors(colorCounts, spells.length);
  const creatures = spells.filter(isCreature).length;
  return {
    deck,
    cards,
    spells,
    total: cards.length + basicsCount(deck.basics),
    lands: nonbasicLands + basicsCount(deck.basics),
    nonbasicLands,
    creatures,
    noncreatureSpells: spells.length - creatures,
    avgCmc: spells.length ? spells.reduce((s, c) => s + c.cmc, 0) / spells.length : 0,
    curve,
    creatureCurve,
    colorCounts,
    mainColors: main,
    splashColors: splash,
    archetype: archetypeName(main, splash),
    rares: cards.filter((c) => c.rarity === 'rare' || c.rarity === 'mythic'),
  };
}

/**
 * A color is "main" if it has a meaningful share of the spells (>= 5, or >= 20% for small decks).
 * Colors with fewer spells are splashes.
 */
export function classifyColors(counts: Record<Color, number>, spellCount: number) {
  const threshold = Math.max(3, Math.min(5, Math.ceil(spellCount * 0.2)));
  let main = COLORS.filter((c) => counts[c] >= threshold);
  if (main.length === 0) {
    const max = Math.max(...COLORS.map((c) => counts[c]));
    if (max > 0) main = COLORS.filter((c) => counts[c] === max);
  }
  const splash = COLORS.filter((c) => !main.includes(c) && counts[c] > 0);
  return { main: sortColors(main), splash: sortColors(splash) };
}

/** Name → count, nonbasic cards only. */
function nameCounts(cards: PoolCard[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) if (!isBasicLand(c)) m.set(c.name, (m.get(c.name) ?? 0) + 1);
  return m;
}

/** Weighted Jaccard similarity over card names (0 = nothing shared, 1 = identical 23). */
export function similarity(a: DeckAnalysis, b: DeckAnalysis): number {
  const ma = nameCounts(a.cards);
  const mb = nameCounts(b.cards);
  let min = 0;
  let max = 0;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const x = ma.get(k) ?? 0;
    const y = mb.get(k) ?? 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
  }
  return max === 0 ? 0 : min / max;
}

export function similarityMatrix(analyses: DeckAnalysis[]): number[][] {
  return analyses.map((a) => analyses.map((b) => (a === b ? 1 : similarity(a, b))));
}

export interface CardConsensus {
  name: string;
  card: PoolCard;
  copiesInPool: number;
  /** players who maindecked at least one copy */
  players: { deckId: string; playerName: string; count: number }[];
  /** fraction of decks that played it */
  rate: number;
}

export function cardConsensus(pool: Pool, analyses: DeckAnalysis[]): CardConsensus[] {
  const groups = new Map<string, CardConsensus>();
  for (const c of pool.cards) {
    if (isBasicLand(c)) continue;
    const g = groups.get(c.name);
    if (g) g.copiesInPool++;
    else groups.set(c.name, { name: c.name, card: c, copiesInPool: 1, players: [], rate: 0 });
  }
  for (const a of analyses) {
    for (const [name, count] of nameCounts(a.cards)) {
      groups.get(name)?.players.push({ deckId: a.deck.id, playerName: a.deck.playerName, count });
    }
  }
  const n = analyses.length || 1;
  for (const g of groups.values()) g.rate = g.players.length / n;
  return [...groups.values()].sort((x, y) => y.rate - x.rate || x.card.cmc - y.card.cmc || x.name.localeCompare(y.name));
}

export interface HeadToHead {
  onlyA: PoolCard[];
  both: PoolCard[];
  onlyB: PoolCard[];
}

/** Compare two decks by card name (copies matter: 2 vs 1 copy puts one in "both", one in "only"). */
export function headToHead(a: DeckAnalysis, b: DeckAnalysis): HeadToHead {
  const remainingB = nameCounts(b.cards);
  const onlyA: PoolCard[] = [];
  const both: PoolCard[] = [];
  for (const c of a.cards) {
    if (isBasicLand(c)) continue;
    const left = remainingB.get(c.name) ?? 0;
    if (left > 0) {
      both.push(c);
      remainingB.set(c.name, left - 1);
    } else onlyA.push(c);
  }
  const onlyB: PoolCard[] = [];
  const takenFromB = new Map<string, number>();
  for (const c of b.cards) {
    if (isBasicLand(c)) continue;
    const used = takenFromB.get(c.name) ?? 0;
    const shared = both.filter((x) => x.name === c.name).length;
    if (used < shared) takenFromB.set(c.name, used + 1);
    else onlyB.push(c);
  }
  const byCmc = (x: PoolCard, y: PoolCard) => x.cmc - y.cmc || x.name.localeCompare(y.name);
  return { onlyA: onlyA.sort(byCmc), both: both.sort(byCmc), onlyB: onlyB.sort(byCmc) };
}

export interface ColorPopularity {
  color: Color;
  main: number;
  splash: number;
}

export function colorPopularity(analyses: DeckAnalysis[]): ColorPopularity[] {
  return COLORS.map((color) => ({
    color,
    main: analyses.filter((a) => a.mainColors.includes(color)).length,
    splash: analyses.filter((a) => a.splashColors.includes(color)).length,
  }));
}

export interface PoolComparison {
  analyses: DeckAnalysis[];
  consensus: CardConsensus[];
  matrix: number[][];
  colors: ColorPopularity[];
  unanimous: CardConsensus[];
  divisive: CardConsensus[];
  uniquePicks: CardConsensus[];
  benchedRares: CardConsensus[];
  /** average pairwise similarity, excluding the diagonal */
  agreement: number;
}

export function comparePool(pool: Pool, decks: Deck[]): PoolComparison {
  const analyses = decks.map((d) => analyzeDeck(pool, d));
  const consensus = cardConsensus(pool, analyses);
  const matrix = similarityMatrix(analyses);
  const n = analyses.length;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      sum += matrix[i][j];
      pairs++;
    }
  const played = consensus.filter((c) => c.players.length > 0);
  return {
    analyses,
    consensus,
    matrix,
    colors: colorPopularity(analyses),
    unanimous: n > 1 ? played.filter((c) => c.players.length === n) : [],
    divisive:
      n > 2
        ? played
            .filter((c) => c.players.length < n)
            .sort((a, b) => Math.abs(a.rate - 0.5) - Math.abs(b.rate - 0.5))
            .slice(0, 8)
        : [],
    uniquePicks: n > 1 ? played.filter((c) => c.players.length === 1) : [],
    benchedRares: consensus.filter((c) => c.players.length === 0 && (c.card.rarity === 'rare' || c.card.rarity === 'mythic')),
    agreement: pairs ? sum / pairs : 1,
  };
}
