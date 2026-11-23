export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
export const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

/** A card as it exists in a set (before being opened into a pool). */
export interface CardTemplate {
  scryfallId: string;
  name: string;
  manaCost: string;
  cmc: number;
  colors: Color[];
  colorIdentity: Color[];
  typeLine: string;
  rarity: Rarity;
  oracleText: string;
  power?: string;
  toughness?: string;
  producedMana: string[];
  image: string | null;
  imageBack: string | null;
  collectorNumber: string;
}

/** A physical card in an opened pool. `uid` is unique within the pool. */
export interface PoolCard extends CardTemplate {
  uid: string;
  foil: boolean;
  pack: number;
}

export type BoosterType = 'play' | 'draft';

export interface SetInfo {
  code: string;
  name: string;
  releasedAt: string;
  setType: string;
  iconSvg: string;
}

export interface DeckSummary {
  id: string;
  playerName: string;
  mainCount: number;
  submittedAt: string | null;
  updatedAt: string;
}

export type BasicLands = Partial<Record<Color, CardTemplate>>;

export interface Pool {
  id: string;
  setCode: string;
  setName: string;
  boosterType: BoosterType;
  packCount: number;
  createdBy: string;
  createdAt: string;
  cards: PoolCard[];
  /** Basic land printings used to show basics as cards. */
  basicLands: BasicLands;
}

export interface PoolWithDecks extends Pool {
  decks: DeckSummary[];
}

export type Basics = Record<Color, number>;
export const emptyBasics = (): Basics => ({ W: 0, U: 0, B: 0, R: 0, G: 0 });

/**
 * Where each card sits on the table: columns ("piles") of card ids, top to bottom.
 * Basic lands appear in the deck as ids like "basic-W-3".
 */
export interface Layout {
  deck: string[][];
  side: string[][];
}

export interface PoolListItem {
  id: string;
  setCode: string;
  setName: string;
  createdBy: string;
  createdAt: string;
  players: { deckId: string; playerName: string; submitted: boolean }[];
}

export interface Deck {
  id: string;
  poolId: string;
  playerName: string;
  /** uids of pool cards in the main deck; everything else is sideboard */
  main: string[];
  basics: Basics;
  notes: string;
  layout: Layout | null;
  /** The player's rating of the pool, 1–10, given when submitting. */
  rating: number | null;
  submittedAt: string | null;
  updatedAt: string;
}

/** Stored in the browser so a player can come back to their deck. */
export interface Identity {
  deckId: string;
  token: string;
  playerName: string;
}
