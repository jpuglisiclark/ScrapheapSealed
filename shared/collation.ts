/**
 * Booster collation in Draftmancer's custom card list format:
 *   [Settings]  JSON with "layouts" (weighted pack layouts made of slots)
 *   [Sheet]     one card per line: "[count] Name (set) collector_number"
 * Lines starting with # are comments.
 */
import type { CardTemplate, PoolCard } from './types.ts';
import type { Rng } from './booster.ts';

export interface CardRef {
  name: string;
  set: string;
  collectorNumber: string;
  /** Copies on the sheet (relative weight within it). */
  count: number;
}

interface SheetChoice {
  name: string;
  weight: number;
}

export interface Slot {
  name: string;
  count: number;
  foil: boolean;
  sheets: SheetChoice[];
}

export interface PackLayout {
  name: string;
  weight: number;
  slots: Slot[];
}

export interface Collation {
  name: string;
  duplicateProtection: boolean;
  layouts: PackLayout[];
  sheets: Record<string, CardRef[]>;
}

export const refKey = (r: { set: string; collectorNumber: string }) => `${r.set.toLowerCase()}:${r.collectorNumber}`;

export function parseCollation(text: string): Collation {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = [];
      sections.set(header[1], current);
    } else current?.push(line);
  }

  const settingsText = sections.get('Settings');
  if (!settingsText) throw new Error('Collation has no [Settings] section');
  const settings = JSON.parse(settingsText.join('\n'));
  sections.delete('Settings');

  const sheets: Record<string, CardRef[]> = {};
  for (const [name, lines] of sections) {
    sheets[name] = lines.map((l) => {
      const m = l.match(/^(?:(\d+)\s+)?(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+)$/);
      if (!m) throw new Error(`Can't read card line in [${name}]: ${l}`);
      return { count: m[1] ? Number(m[1]) : 1, name: m[2], set: m[3].toLowerCase(), collectorNumber: m[4] };
    });
  }

  const layouts: PackLayout[] = Object.entries(settings.layouts ?? {}).map(([name, l]: [string, any]) => ({
    name,
    weight: Number(l.weight ?? 1),
    slots: (l.slots ?? []).map((s: any) => ({
      name: s.name,
      count: Number(s.count ?? 1),
      foil: !!s.foil,
      sheets: (s.sheets ?? []).map((sh: any) => (typeof sh === 'string' ? { name: sh, weight: 1 } : { name: sh.name, weight: Number(sh.weight ?? 1) })),
    })),
  }));
  for (const l of layouts)
    for (const s of l.slots)
      for (const sh of s.sheets) if (!sheets[sh.name]) throw new Error(`Slot "${s.name}" uses unknown sheet [${sh.name}]`);
  if (!layouts.length) throw new Error('Collation has no layouts');

  return { name: settings.name ?? 'Custom collation', duplicateProtection: settings.duplicateProtection !== false, layouts, sheets };
}

/** Every distinct printing the collation can produce. */
export function collationRefs(c: Collation): CardRef[] {
  const seen = new Map<string, CardRef>();
  for (const sheet of Object.values(c.sheets)) for (const r of sheet) seen.set(refKey(r), r);
  return [...seen.values()];
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) if ((r -= weight(t)) < 0) return t;
  return items[items.length - 1];
}

export interface OpenedRef {
  ref: CardRef;
  foil: boolean;
  slot: string;
}

/**
 * Open one pack: pick a layout by weight, then for each slot pick a sheet by weight and a card
 * from it (sheets aren't depleted). With duplicate protection, a card name already in the pack
 * is re-drawn (from the same sheet) when another option exists.
 */
export function openCollationPack(c: Collation, rng: Rng): OpenedRef[] {
  const layout = pickWeighted(c.layouts, (l) => l.weight, rng);
  const out: OpenedRef[] = [];
  const names = new Set<string>();
  for (const slot of layout.slots) {
    for (let i = 0; i < slot.count; i++) {
      const sheet = c.sheets[pickWeighted(slot.sheets, (s) => s.weight, rng).name];
      if (!sheet.length) continue;
      let ref = pickWeighted(sheet, (r) => r.count, rng);
      if (c.duplicateProtection) {
        const fresh = sheet.filter((r) => !names.has(r.name));
        if (names.has(ref.name) && fresh.length) ref = pickWeighted(fresh, (r) => r.count, rng);
      }
      names.add(ref.name);
      out.push({ ref, foil: slot.foil, slot: slot.name });
    }
  }
  return out;
}

/** Open `packCount` packs and turn them into pool cards using fetched card data. */
export function generateCollationPool(c: Collation, cards: Record<string, CardTemplate>, packCount: number, rng: Rng = Math.random): PoolCard[] {
  const pool: PoolCard[] = [];
  for (let p = 0; p < packCount; p++) {
    for (const { ref, foil } of openCollationPack(c, rng)) {
      const t = cards[refKey(ref)];
      if (!t) continue; // printing missing from the card database: skip rather than fail the whole pool
      pool.push({ ...t, uid: `${p}-${pool.length}`, foil, pack: p + 1 });
    }
  }
  return pool;
}
