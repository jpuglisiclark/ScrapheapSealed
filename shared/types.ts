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

export interface Pool {
  id: string;
  setCode: string;
  setName: string;
  boosterType: BoosterType;
  packCount: number;
  createdBy: string;
  createdAt: string;
  cards: PoolCard[];
}

export interface PoolWithDecks extends Pool {
  decks: DeckSummary[];
}

export type Basics = Record<Color, number>;
export const emptyBasics = (): Basics => ({ W: 0, U: 0, B: 0, R: 0, G: 0 });

export interface Deck {
  id: string;
  poolId: string;
  playerName: string;
  /** uids of pool cards in the main deck; everything else is sideboard */
  main: string[];
  basics: Basics;
  notes: string;
  submittedAt: string | null;
  updatedAt: string;
}

/** Stored in the browser so a player can come back to their deck. */
export interface Identity {
  deckId: string;
  token: string;
  playerName: string;
}
