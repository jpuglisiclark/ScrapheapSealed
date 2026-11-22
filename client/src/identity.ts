import type { Identity } from '../../shared/types.ts';

// Browser storage is a convenience; every read/write tolerates it being unavailable.
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const getIdentity = (poolId: string): Identity | null => read<Record<string, Identity>>('st:identities', {})[poolId] ?? null;
export function setIdentity(poolId: string, id: Identity) {
  write('st:identities', { ...read<Record<string, Identity>>('st:identities', {}), [poolId]: id });
}

export const getLastName = () => read<string>('st:name', '');
export const setLastName = (n: string) => write('st:name', n);

export interface RecentPool {
  id: string;
  setName: string;
  setCode: string;
  visitedAt: string;
}
export const getRecent = () => read<RecentPool[]>('st:recent', []);
export function rememberPool(p: Omit<RecentPool, 'visitedAt'>) {
  const list = getRecent().filter((r) => r.id !== p.id);
  write('st:recent', [{ ...p, visitedAt: new Date().toISOString() }, ...list].slice(0, 12));
}

/** A link that restores a player's identity on another device. */
export const resumeUrl = (poolId: string, id: Identity) =>
  `${location.origin}/p/${poolId}/resume#${encodeURIComponent(JSON.stringify(id))}`;
