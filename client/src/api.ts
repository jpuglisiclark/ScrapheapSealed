import type { Basics, Deck, Layout, PoolListItem, PoolWithDecks, SetInfo } from '../../shared/types.ts';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Deck-Token'] = token;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface DeckUpdate {
  main?: string[];
  basics?: Basics;
  notes?: string;
  layout?: Layout;
  rating?: number;
  playerName?: string;
  submitted?: boolean;
}

export const api = {
  config: () => call<{ set: SetInfo; boosterType: 'play' }>('GET', '/config'),
  pools: () => call<PoolListItem[]>('GET', '/pools'),
  createPool: (b: { packCount: number; createdBy: string }) => call<{ id: string }>('POST', '/pools', b),
  pool: (id: string) => call<PoolWithDecks>('GET', `/pools/${id}`),
  join: (poolId: string, playerName: string) =>
    call<{ deckId: string; token: string; playerName: string }>('POST', `/pools/${poolId}/decks`, { playerName }),
  deck: (deckId: string, token: string) => call<Deck>('GET', `/decks/${deckId}`, undefined, token),
  saveDeck: (deckId: string, token: string, update: DeckUpdate) => call<Deck>('PUT', `/decks/${deckId}`, update, token),
  results: (poolId: string, token: string) =>
    call<{ pool: PoolWithDecks; decks: Deck[] }>('GET', `/pools/${poolId}/results`, undefined, token),
};
