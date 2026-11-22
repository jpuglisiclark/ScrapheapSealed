import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, COLOR_NAMES, type Basics, type Color, type Deck, type PoolCard, type PoolWithDecks } from '../../../shared/types.ts';
import {
  BASIC_NAMES,
  CURVE_LABELS,
  RARITY_ORDER,
  basicsCount,
  cardColors,
  colorGroup,
  curveBucket,
  exportDecklist,
  isCreature,
  isLand,
  suggestBasics,
  totalPips,
  type ColorGroup,
} from '../../../shared/cards.ts';
import { classifyColors } from '../../../shared/analytics.ts';
import { CardTile } from '../components/Card.tsx';
import { ColorDots } from '../components/Mana.tsx';
import { Curve, CurveLegend } from '../components/Curve.tsx';
import { CopyButton } from './Lobby.tsx';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';
type GroupMode = 'color' | 'cmc' | 'type';

const GROUP_LABEL: Record<ColorGroup, string> = { ...COLOR_NAMES, M: 'Multicolor', C: 'Colorless', L: 'Lands' };
const byCmcName = (a: PoolCard, b: PoolCard) => a.cmc - b.cmc || a.name.localeCompare(b.name);

function groupCards(cards: PoolCard[], mode: GroupMode): { key: string; label: string; cards: PoolCard[] }[] {
  const groups = new Map<string, PoolCard[]>();
  let order: { key: string; label: string }[];
  if (mode === 'color') {
    order = (['W', 'U', 'B', 'R', 'G', 'M', 'C', 'L'] as ColorGroup[]).map((g) => ({ key: g, label: GROUP_LABEL[g] }));
    for (const c of cards) groups.set(colorGroup(c), [...(groups.get(colorGroup(c)) ?? []), c]);
  } else if (mode === 'cmc') {
    order = [...CURVE_LABELS.map((l, i) => ({ key: String(i + 1), label: `${l} mana` })), { key: 'L', label: 'Lands' }];
    for (const c of cards) {
      const k = isLand(c) ? 'L' : String(curveBucket(c.cmc));
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
  } else {
    order = [
      { key: 'creature', label: 'Creatures' },
      { key: 'spell', label: 'Noncreature spells' },
      { key: 'land', label: 'Lands' },
    ];
    for (const c of cards) {
      const k = isLand(c) ? 'land' : isCreature(c) ? 'creature' : 'spell';
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
  }
  return order
    .map((o) => ({ ...o, cards: (groups.get(o.key) ?? []).sort(mode === 'color' ? byCmcName : (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || byCmcName(a, b)) }))
    .filter((g) => g.cards.length);
}

function Column({ label, cards, onCard, disabled }: { label: string; cards: PoolCard[]; onCard: (c: PoolCard) => void; disabled?: boolean }) {
  return (
    <div className="column">
      <div className="column-head">
        {label} <span className="muted">{cards.length}</span>
      </div>
      <div className="stack">
        {cards.map((c) => (
          <CardTile key={c.uid} card={c} onClick={disabled ? undefined : () => onCard(c)} />
        ))}
      </div>
    </div>
  );
}

export default function Builder() {
  const { poolId = '' } = useParams();
  const me = getIdentity(poolId);
  const [pool, setPool] = useState<PoolWithDecks | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState('');
  const [save, setSave] = useState<SaveState>('saved');
  const [groupMode, setGroupMode] = useState<GroupMode>('color');
  const [filter, setFilter] = useState<Set<Color>>(new Set());
  const [search, setSearch] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    if (!me) return;
    Promise.all([api.pool(poolId), api.deck(me.deckId, me.token)])
      .then(([p, d]) => {
        setPool(p);
        setDeck(d);
        // Pre-select the colors you've already committed to, if any.
        const cards = p.cards.filter((c) => d.main.includes(c.uid));
        const counts = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<Color, number>;
        for (const c of cards) for (const col of cardColors(c)) counts[col]++;
        setFilter(new Set(classifyColors(counts, cards.length).main));
      })
      .catch((e) => setError(e.message));
  }, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave of main/basics/notes.
  useEffect(() => {
    if (!deck || !me) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (deck.submittedAt) return;
    setSave('pending');
    const t = setTimeout(() => {
      setSave('saving');
      api
        .saveDeck(me.deckId, me.token, { main: deck.main, basics: deck.basics, notes: deck.notes })
        .then(() => setSave('saved'))
        .catch(() => setSave('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [deck?.main, deck?.basics, deck?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  const mainSet = useMemo(() => new Set(deck?.main), [deck?.main]);
  const mainCards = useMemo(() => pool?.cards.filter((c) => mainSet.has(c.uid)) ?? [], [pool, mainSet]);
  const sideCards = useMemo(() => pool?.cards.filter((c) => !mainSet.has(c.uid)) ?? [], [pool, mainSet]);

  if (!me) return <Navigate to={`/p/${poolId}`} replace />;
  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!pool || !deck) return <main className="page"><p className="muted">Loading your pool…</p></main>;

  const locked = !!deck.submittedAt;
  const update = (patch: Partial<Deck>) => setDeck((d) => (d ? { ...d, ...patch } : d));
  const addCard = (c: PoolCard) => update({ main: [...deck.main, c.uid] });
  const removeCard = (c: PoolCard) => update({ main: deck.main.filter((u) => u !== c.uid) });
  const setBasic = (col: Color, n: number) => update({ basics: { ...deck.basics, [col]: Math.max(0, Math.min(30, n)) } as Basics });

  const spells = mainCards.filter((c) => !isLand(c));
  const nonbasicLands = mainCards.length - spells.length;
  const basics = basicsCount(deck.basics);
  const total = mainCards.length + basics;
  const creatures = spells.filter(isCreature).length;
  const curve = [0, 0, 0, 0, 0, 0];
  const creatureCurve = [0, 0, 0, 0, 0, 0];
  for (const c of spells) {
    curve[curveBucket(c.cmc) - 1]++;
    if (isCreature(c)) creatureCurve[curveBucket(c.cmc) - 1]++;
  }
  const pipTotals = totalPips(mainCards);
  const pipSum = COLORS.reduce((s, c) => s + pipTotals[c], 0);
  const avgCmc = spells.length ? spells.reduce((s, c) => s + c.cmc, 0) / spells.length : 0;

  const deckColumns = groupCards(mainCards, 'cmc');
  const q = search.trim().toLowerCase();
  const visibleSide = sideCards.filter((c) => {
    if (q && !`${c.name} ${c.typeLine} ${c.oracleText}`.toLowerCase().includes(q)) return false;
    if (filter.size === 0) return true;
    return cardColors(c).every((col) => filter.has(col));
  });
  const sideColumns = groupCards(visibleSide, groupMode);

  async function setSubmitted(submitted: boolean) {
    if (!me || !deck) return;
    if (submitted && total !== 40 && !confirm(`Your deck has ${total} cards (40 is standard). Submit anyway?`)) return;
    setSave('saving');
    try {
      // Flush pending edits along with the submit so nothing is lost.
      const d = await api.saveDeck(me.deckId, me.token, submitted ? { main: deck.main, basics: deck.basics, notes: deck.notes, submitted } : { submitted });
      loaded.current = false;
      setDeck(d);
      setSave('saved');
    } catch (e: any) {
      setSave('error');
      alert(e.message);
    }
  }

  const decklist = exportDecklist([...mainCards].sort(byCmcName), deck.basics, sideCards);
  const saveLabel = { saved: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed — retrying on next change' }[save];

  return (
    <main className="builder">
      <div className="builder-bar">
        <div className="bar-left">
          <Link to={`/p/${poolId}`} className="back">← {pool.setName}</Link>
          <span className="muted">Building as <b>{deck.playerName}</b></span>
        </div>
        <div className="bar-right">
          <span className={`save-state ${save}`}>{locked ? 'Submitted' : saveLabel}</span>
          <CopyButton text={decklist} label="Copy decklist" />
          {locked ? (
            <>
              <button className="btn" onClick={() => setSubmitted(false)}>Reopen to edit</button>
              <Link className="btn primary" to={`/p/${poolId}/results`}>Compare decks →</Link>
            </>
          ) : (
            <button className="btn primary" onClick={() => setSubmitted(true)} disabled={save === 'saving'}>
              Submit deck
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="callout">
          Your deck is submitted and visible to others who’ve submitted. Reopening it hides it from the comparison until you submit again.
        </div>
      )}

      <div className="builder-body">
        <div className="zones">
          <section className="zone deck-zone">
            <div className="zone-head">
              <h2>
                Deck <span className={`count ${total === 40 ? 'ok' : ''}`}>{total}/40</span>
              </h2>
              <span className="muted">
                {spells.length} spells · {nonbasicLands + basics} lands · click a card to send it to the sideboard
              </span>
            </div>
            {mainCards.length === 0 ? (
              <p className="empty">Click cards in your pool below to add them to your deck.</p>
            ) : (
              <div className="columns">
                {deckColumns.map((g) => (
                  <Column key={g.key} label={g.label} cards={g.cards} onCard={removeCard} disabled={locked} />
                ))}
              </div>
            )}
          </section>

          <section className="zone side-zone">
            <div className="zone-head">
              <h2>
                Sideboard <span className="count">{sideCards.length}</span>
              </h2>
              <div className="filters">
                <div className="color-filter" role="group" aria-label="Show cards castable with">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`pip-toggle ${filter.has(c) ? 'on' : ''}`}
                      aria-pressed={filter.has(c)}
                      title={`${filter.has(c) ? 'Hide' : 'Show'} ${COLOR_NAMES[c]}`}
                      onClick={() => {
                        const next = new Set(filter);
                        if (next.has(c)) next.delete(c);
                        else next.add(c);
                        setFilter(next);
                      }}
                    >
                      <span className={`pip ${c}`} />
                    </button>
                  ))}
                  {filter.size > 0 && (
                    <button type="button" className="link" onClick={() => setFilter(new Set())}>
                      all colors
                    </button>
                  )}
                </div>
                <input type="search" placeholder="Search name, type, text" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)} aria-label="Group by">
                  <option value="color">By color</option>
                  <option value="cmc">By mana value</option>
                  <option value="type">By type</option>
                </select>
              </div>
            </div>
            {filter.size > 0 && (
              <p className="muted small filter-note">
                Showing cards castable with {[...filter].map((c) => COLOR_NAMES[c]).join(' + ')} (plus colorless and lands) ·{' '}
                {sideCards.length - visibleSide.length} hidden
              </p>
            )}
            <div className="columns">
              {sideColumns.map((g) => (
                <Column key={g.key} label={g.label} cards={g.cards} onCard={addCard} disabled={locked} />
              ))}
            </div>
          </section>
        </div>

        <aside className="sidebar">
          <section className="panel">
            <h3>Curve</h3>
            <Curve curve={curve} creatures={creatureCurve} />
            <CurveLegend />
            <dl className="stats">
              <div><dt>Creatures</dt><dd>{creatures}</dd></div>
              <div><dt>Other spells</dt><dd>{spells.length - creatures}</dd></div>
              <div><dt>Avg. mana value</dt><dd>{avgCmc.toFixed(2)}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Basic lands</h3>
              {!locked && (
                <button
                  className="btn small"
                  type="button"
                  disabled={spells.length === 0}
                  onClick={() => update({ basics: suggestBasics(mainCards, Math.max(15, Math.min(18, 40 - spells.length))) })}
                  title="Fill basics in proportion to your colored mana symbols"
                >
                  Auto-fill
                </button>
              )}
            </div>
            <ul className="basics">
              {COLORS.map((c) => {
                const share = pipSum ? pipTotals[c] / pipSum : 0;
                return (
                  <li key={c}>
                    <span className="pip-label">
                      <ColorDots colors={[c]} /> {BASIC_NAMES[c]}
                    </span>
                    <span className="pip-share" title={`${Math.round(share * 100)}% of your colored mana symbols`}>
                      {share ? `${Math.round(share * 100)}%` : ''}
                    </span>
                    <span className="stepper">
                      <button type="button" disabled={locked || deck.basics[c] === 0} onClick={() => setBasic(c, deck.basics[c] - 1)} aria-label={`Remove ${BASIC_NAMES[c]}`}>
                        −
                      </button>
                      <span className="n">{deck.basics[c]}</span>
                      <button type="button" disabled={locked} onClick={() => setBasic(c, deck.basics[c] + 1)} aria-label={`Add ${BASIC_NAMES[c]}`}>
                        +
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">Percentages show each color’s share of the mana symbols in your deck.</p>
          </section>

          <section className="panel">
            <h3>Notes</h3>
            <textarea
              value={deck.notes}
              disabled={locked}
              maxLength={2000}
              rows={4}
              placeholder="Why this build? Shared with the others once everyone can compare."
              onChange={(e) => update({ notes: e.target.value })}
            />
          </section>
        </aside>
      </div>
    </main>
  );
}
