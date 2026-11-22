import type { CardTemplate, Color, Rarity, SetInfo } from '../shared/types.ts';

const API = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'SealedTogether/0.1', Accept: 'application/json' };
const ALLOWED_SET_TYPES = new Set(['expansion', 'core', 'draft_innovation', 'masters']);

let lastRequest = 0;
/** Scryfall asks for 50–100ms between requests. */
async function get(url: string): Promise<any> {
  const wait = lastRequest + 100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.details ?? `Scryfall request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function fetchSets(): Promise<SetInfo[]> {
  const body = await get(`${API}/sets`);
  const today = new Date().toISOString().slice(0, 10);
  return (body.data as any[])
    .filter((s) => ALLOWED_SET_TYPES.has(s.set_type) && !s.digital && !/commander|jumpstart/i.test(s.name) && s.card_count >= 60 && s.released_at <= today)
    .map((s) => ({ code: s.code, name: s.name, releasedAt: s.released_at, setType: s.set_type, iconSvg: s.icon_svg_uri }));
}

const COLOR_SET = new Set(['W', 'U', 'B', 'R', 'G']);
const asColors = (xs: unknown): Color[] => (Array.isArray(xs) ? xs.filter((x) => COLOR_SET.has(x)) : []) as Color[];

export function normalizeCard(c: any): CardTemplate {
  const faces: any[] = c.card_faces ?? [];
  const front = faces[0] ?? {};
  const colors = c.colors ?? [...new Set(faces.flatMap((f) => f.colors ?? []))];
  return {
    scryfallId: c.id,
    name: c.name,
    manaCost: c.mana_cost ?? front.mana_cost ?? '',
    cmc: c.cmc ?? 0,
    colors: asColors(colors),
    colorIdentity: asColors(c.color_identity),
    typeLine: c.type_line ?? front.type_line ?? '',
    rarity: c.rarity as Rarity,
    oracleText: c.oracle_text ?? faces.map((f) => f.oracle_text).filter(Boolean).join('\n—\n'),
    power: c.power ?? front.power,
    toughness: c.toughness ?? front.toughness,
    producedMana: c.produced_mana ?? [],
    image: c.image_uris?.normal ?? front.image_uris?.normal ?? null,
    imageBack: !c.image_uris && faces[1]?.image_uris?.normal ? faces[1].image_uris.normal : null,
    collectorNumber: c.collector_number,
  };
}

async function searchAll(query: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${API}/cards/search?${new URLSearchParams({ q: query, unique: 'cards', order: 'set' })}`;
  while (url) {
    const page: any = await get(url);
    out.push(...page.data);
    url = page.has_more ? page.next_page : null;
  }
  return out;
}

/** All cards that can appear in a booster of this set (basics excluded). */
export async function fetchSetCards(code: string): Promise<CardTemplate[]> {
  const safe = code.replace(/[^a-z0-9]/gi, '');
  let raw: any[];
  try {
    raw = await searchAll(`set:${safe} is:booster -type:basic`);
  } catch (e: any) {
    if (e.status !== 404) throw e;
    // Older sets sometimes lack booster metadata; fall back to the whole set.
    raw = await searchAll(`set:${safe} -type:basic -is:promo`);
  }
  return raw.filter((c) => c.rarity !== 'special' && c.rarity !== 'bonus').map(normalizeCard);
}
