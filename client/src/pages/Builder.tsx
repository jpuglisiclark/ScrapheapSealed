import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, COLOR_NAMES, type Color, type Layout, type PoolCard, type PoolWithDecks } from '../../../shared/types.ts';
import { BASIC_NAMES, basicsCount, cardColors, curveBucket, exportDecklist, isCreature, isLand, totalPips } from '../../../shared/cards.ts';
import {
  basicCard,
  basicColor,
  basicsFromLayout,
  isBasicId,
  mainFromLayout,
  moveCard,
  nextBasicId,
  placeCard,
  reconcileLayout,
  removeCard,
  sortedColumns,
  type DropTarget,
  type SortMode,
  type Zone,
} from '../../../shared/layout.ts';
import { CardTile } from '../components/Card.tsx';
import { ColorDots } from '../components/Mana.tsx';
import { Curve, CurveLegend } from '../components/Curve.tsx';
import { CopyButton } from './Lobby.tsx';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';
interface DeckMeta {
  playerName: string;
  notes: string;
  submittedAt: string | null;
}
/** Where a dragged card would land, plus where to draw the insertion line. */
type DropHint = DropTarget & { lineTop?: number };

const sameHint = (a: DropHint | null, b: DropHint | null) => JSON.stringify(a) === JSON.stringify(b);

interface PileProps {
  zone: Zone;
  col: number;
  visible: string[];
  getCard: (uid: string) => PoolCard;
  locked: boolean;
  dragging: string | null;
  hint: DropHint | null;
  onCardClick: (c: PoolCard) => void;
  onDragPointerDown: (uid: string, e: React.PointerEvent) => void;
}

function Pile({ zone, col, visible, getCard, locked, dragging, hint, onCardClick, onDragPointerDown }: PileProps) {
  const active = hint && 'col' in hint && hint.zone === zone && hint.col === col;
  return (
    <div className={`column pile ${active ? 'drop-active' : ''}`} data-drop="pile" data-zone={zone} data-col={col}>
      <div className="column-head">
        {visible.length} {visible.length === 1 ? 'card' : 'cards'}
      </div>
      <div className="stack">
        {visible.map((u) => {
          const c = getCard(u);
          return (
            <CardTile
              key={u}
              card={c}
              onClick={locked ? undefined : () => onCardClick(c)}
              onDragPointerDown={locked ? undefined : (e) => onDragPointerDown(u, e)}
              dragging={dragging === u}
            />
          );
        })}
        {active && hint.lineTop !== undefined && <div className="drop-line" style={{ top: hint.lineTop }} />}
      </div>
    </div>
  );
}

function NewPile({ zone, at, dragging, hint, big }: { zone: Zone; at: number; dragging: string | null; hint: DropHint | null; big?: boolean }) {
  const active = hint && 'newCol' in hint && hint.zone === zone;
  if (!dragging && !big) return null;
  return (
    <div className={`column new-pile ${active ? 'drop-active' : ''} ${big ? 'big' : ''}`} data-drop="new" data-zone={zone} data-newcol={at}>
      {big ? 'Click cards in your pool to add them, or drag them here.' : '+ New pile'}
    </div>
  );
}

/** Where on screen a dragged card would land, worked out from the piles under the pointer. */
function hitTest(x: number, y: number, layout: Layout): DropHint | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null;
  if (!el) return null;
  const zone = el.dataset.zone as Zone;
  if (el.dataset.drop === 'new') return { zone, newCol: Number(el.dataset.newcol) };
  const col = Number(el.dataset.col);
  const tiles = [...el.querySelectorAll<HTMLElement>('.stack > .card-tile')];
  let vi = 0;
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    const nextTop = i + 1 < tiles.length ? tiles[i + 1].getBoundingClientRect().top : r.bottom;
    if (y > (r.top + nextTop) / 2) vi = i + 1;
  }
  const lineTop =
    tiles.length === 0 ? 0 : vi < tiles.length ? tiles[vi].offsetTop - 4 : tiles[tiles.length - 1].offsetTop + tiles[tiles.length - 1].offsetHeight + 2;
  // Map the visible slot back to a position in the full pile (the sideboard may have filtered cards hidden).
  const full = layout[zone][col] ?? [];
  const visible = tiles.map((t) => t.dataset.uid!);
  const index = vi < visible.length ? full.indexOf(visible[vi]) : visible.length ? full.indexOf(visible[visible.length - 1]) + 1 : full.length;
  return { zone, col, index, lineTop };
}

/** Card width the zone heights are sized for; bigger cards scroll inside the zones instead of growing them. */
const BASE_CARD_W = typeof window !== 'undefined' && window.innerWidth < 640 ? 96 : 128;
const MAX_CARD_W = 240;
function readCardSize() {
  try {
    const v = Number(localStorage.getItem('st:cardW'));
    if (v >= BASE_CARD_W && v <= MAX_CARD_W) return v;
  } catch {
    /* storage unavailable */
  }
  return BASE_CARD_W;
}
/** Height a row of piles needs at the base card size. */
function zoneHeight(pileSizes: number[], minimum: number) {
  const w = BASE_CARD_W;
  const pile = (n: number) => 24 + w * 1.3934 + Math.max(0, n - 1) * w * 0.2004 + 4;
  return Math.ceil(Math.max(minimum, ...pileSizes.map(pile))) + 22;
}

/** The deck area grows with its tallest pile, but only up to this many cards. */
const DECK_MAX_PILE = 8;

function readHeights(): Record<Zone, number | null> {
  try {
    const v = JSON.parse(localStorage.getItem('st:zoneHeights') ?? '{}');
    return { deck: typeof v.deck === 'number' ? v.deck : null, side: typeof v.side === 'number' ? v.side : null };
  } catch {
    return { deck: null, side: null };
  }
}

/** Bar under a zone: drag to set its height, double-click to go back to automatic. */
function ResizeHandle({ target, onResize }: { target: React.RefObject<HTMLElement>; onResize: (h: number | null) => void }) {
  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to resize. Double-click to reset."
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => onResize(null)}
      onPointerDown={(e) => {
        if (e.button !== 0 || !target.current) return;
        e.preventDefault();
        const startY = e.clientY;
        const startH = target.current.getBoundingClientRect().height;
        document.body.classList.add('resizing-zone');
        const move = (ev: PointerEvent) => onResize(Math.round(Math.max(120, Math.min(3000, startH + ev.clientY - startY))));
        const up = () => {
          document.body.classList.remove('resizing-zone');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }}
    >
      <span />
    </div>
  );
}

interface DragState {
  uid: string;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  x: number;
  y: number;
  active: boolean;
}

/** A "Sort by…" menu that re-sorts every time an option is picked (even the same one again). */
function SortSelect({ label, options, onSort }: { label: string; options: [SortMode, string][]; onSort: (m: SortMode) => void }) {
  return (
    <select
      className="sort-select"
      value=""
      aria-label={label}
      onChange={(e) => {
        if (e.target.value) onSort(e.target.value as SortMode);
      }}
    >
      <option value="" disabled>
        Sort by…
      </option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export default function Builder() {
  const { poolId = '' } = useParams();
  const me = getIdentity(poolId);
  const [pool, setPool] = useState<PoolWithDecks | null>(null);
  const [meta, setMeta] = useState<DeckMeta | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState('');
  const [save, setSave] = useState<SaveState>('saved');
  const [sideMode, setSideMode] = useState<SortMode>('color');
  const [filter, setFilter] = useState<Set<Color>>(new Set());
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const drag = useRef<DragState | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const hintRef = useRef<DropHint | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const suppressClick = useRef(false);
  layoutRef.current = layout;
  const [deckMode, setDeckMode] = useState<SortMode>('cmc');
  const [cardW, setCardW] = useState(readCardSize);
  const [heights, setHeights] = useState(readHeights);
  const deckAreaRef = useRef<HTMLDivElement>(null);
  const sideAreaRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!me) return;
    Promise.all([api.pool(poolId), api.deck(me.deckId, me.token)])
      .then(([p, d]) => {
        setPool(p);
        setMeta({ playerName: d.playerName, notes: d.notes, submittedAt: d.submittedAt });
        setLayout(reconcileLayout(p, d.main, d.basics, d.layout));
      })
      .catch((e) => setError(e.message));
  }, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byUid = useMemo(() => new Map(pool?.cards.map((c) => [c.uid, c])), [pool]);
  const getCard = useMemo(() => (u: string) => (isBasicId(u) && pool ? basicCard(pool, u) : byUid.get(u)!), [pool, byUid]);

  // Debounced autosave of layout and notes.
  useEffect(() => {
    if (!layout || !meta || !me) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (meta.submittedAt) return;
    setSave('pending');
    const t = setTimeout(() => {
      setSave('saving');
      api
        .saveDeck(me.deckId, me.token, { main: mainFromLayout(layout), basics: basicsFromLayout(layout), layout, notes: meta.notes })
        .then(() => setSave('saved'))
        .catch(() => setSave('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [layout, meta?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  if (!me) return <Navigate to={`/p/${poolId}`} replace />;
  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!pool || !meta || !layout) return <main className="page"><p className="muted">Loading your pool…</p></main>;

  const locked = !!meta.submittedAt;
  const deckUids = layout.deck.flat();
  const mainCards = mainFromLayout(layout).map(getCard);
  const basics = basicsFromLayout(layout);
  const sideCards = layout.side.flat().map(getCard);
  const spells = mainCards.filter((c) => !isLand(c));
  const nonbasicLands = mainCards.length - spells.length;
  const basicTotal = basicsCount(basics);
  const total = deckUids.length;
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

  const q = search.trim().toLowerCase();
  const shownInSide = (u: string) => {
    const c = getCard(u);
    if (q && !`${c.name} ${c.typeLine} ${c.oracleText}`.toLowerCase().includes(q)) return false;
    return filter.size === 0 || cardColors(c).every((col) => filter.has(col));
  };
  const hiddenCount = sideCards.length - layout.side.flat().filter(shownInSide).length;

  /**
   * Dragging uses pointer events (not the browser's native drag and drop, which is unreliable
   * across browsers). A press only turns into a drag after the mouse moves a few pixels,
   * so plain clicks still move cards between deck and sideboard.
   */
  function onDragPointerDown(uid: string, e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { uid, startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, x: e.clientX, y: e.clientY, active: false };
    let raf = 0;

    const updateHint = () => {
      const d = drag.current;
      if (!d || !layoutRef.current) return;
      const next = hitTest(d.x, d.y, layoutRef.current);
      if (!sameHint(hintRef.current, next)) {
        hintRef.current = next;
        setHint(next);
      }
    };
    // Scroll the page when dragging near the top or bottom edge.
    const autoScroll = () => {
      const d = drag.current;
      if (!d?.active) return;
      const edge = 70;
      const dy = d.y < edge ? -(edge - d.y) / 3 : d.y > window.innerHeight - edge ? (d.y - (window.innerHeight - edge)) / 3 : 0;
      if (dy) {
        window.scrollBy(0, dy);
        updateHint();
      }
      // Also scroll a deck/sideboard area when the pointer nears its edges (cards may be larger than the area).
      const sc = document.elementFromPoint(d.x, d.y)?.closest('.columns') as HTMLElement | null;
      if (sc) {
        const r = sc.getBoundingClientRect();
        const inner = 40;
        const sy = d.y < r.top + inner ? -6 : d.y > r.bottom - inner ? 6 : 0;
        const sx = d.x < r.left + inner ? -6 : d.x > r.right - inner ? 6 : 0;
        if (sx || sy) {
          sc.scrollBy(sx, sy);
          updateHint();
        }
      }
      raf = requestAnimationFrame(autoScroll);
    };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.x = ev.clientX;
      d.y = ev.clientY;
      if (!d.active) {
        if (Math.hypot(d.x - d.startX, d.y - d.startY) < 6) return;
        d.active = true;
        document.body.classList.add('dragging-cards');
        setDragging(d.uid);
        raf = requestAnimationFrame(autoScroll);
      }
      ev.preventDefault();
      if (ghost.current) ghost.current.style.transform = `translate(${d.x - d.offX}px, ${d.y - d.offY}px) rotate(2deg)`;
      updateHint();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf);
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      document.body.classList.remove('dragging-cards');
      // The click that follows a drag must not also move the card.
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const target = hintRef.current;
      if (target && layoutRef.current) setLayout(moveCard(layoutRef.current, d.uid, target));
      hintRef.current = null;
      setHint(null);
      setDragging(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const clickDeckCard = (c: PoolCard) => {
    if (suppressClick.current) return;
    setLayout(isBasicId(c.uid) ? removeCard(layout, c.uid) : placeCard(layout, 'side', c, sideMode, getCard));
  };
  const clickSideCard = (c: PoolCard) => {
    if (suppressClick.current) return;
    setLayout(placeCard(layout, 'deck', c, deckMode, getCard));
  };
  const addBasic = (col: Color) => setLayout(placeCard(layout, 'deck', basicCard(pool, nextBasicId(layout, col)), deckMode, getCard));
  const clearDeck = () => {
    if (!confirm(`Move all ${total} cards in your deck back to the sideboard? Basic lands will be removed.`)) return;
    let next: Layout = { deck: [], side: layout.side };
    for (const u of deckUids) if (!isBasicId(u)) next = placeCard(next, 'side', getCard(u), sideMode, getCard);
    setLayout(next);
  };
  const changeCardSize = (w: number) => {
    setCardW(w);
    try {
      localStorage.setItem('st:cardW', String(w));
    } catch {
      /* storage unavailable */
    }
  };
  const sidePiles = layout.side.map((col) => col.filter(shownInSide));
  const resizeZone = (zone: Zone) => (h: number | null) => {
    setHeights((prev) => {
      const next = { ...prev, [zone]: h };
      try {
        localStorage.setItem('st:zoneHeights', JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  const deckHeight = heights.deck ?? zoneHeight(layout.deck.map((c) => Math.min(c.length, DECK_MAX_PILE)), 150);
  const sideHeight = heights.side ?? zoneHeight(sidePiles.map((c) => c.length), 150);
  const removeBasic = (col: Color) => {
    const last = [...deckUids].reverse().find((u) => basicColor(u) === col);
    if (last) setLayout(removeCard(layout, last));
  };

  const pileProps = { getCard, locked, dragging, hint, onDragPointerDown };
  const ghostCard = dragging ? getCard(dragging) : null;

  async function setSubmitted(submitted: boolean) {
    if (!me || !layout || !meta) return;
    if (submitted && total !== 40 && !confirm(`Your deck has ${total} cards (40 is standard). Submit anyway?`)) return;
    setSave('saving');
    try {
      const d = await api.saveDeck(
        me.deckId,
        me.token,
        submitted ? { main: mainFromLayout(layout), basics: basicsFromLayout(layout), layout, notes: meta.notes, submitted } : { submitted },
      );
      loaded.current = false;
      setMeta({ playerName: d.playerName, notes: d.notes, submittedAt: d.submittedAt });
      setLayout({ ...layout });
      setSave('saved');
    } catch (e: any) {
      setSave('error');
      alert(e.message);
    }
  }

  const decklist = exportDecklist(
    [...mainCards].sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name)),
    basics,
    sideCards,
  );
  const saveLabel = { saved: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed — retrying on next change' }[save];
  const poolUrl = `${location.origin}/p/${poolId}`;

  return (
    <main className={`builder ${dragging ? 'is-dragging' : ''}`} style={{ '--card-w': `${cardW}px` } as React.CSSProperties}>
      {ghostCard && (
        <div
          className="drag-ghost"
          ref={ghost}
          aria-hidden
          style={drag.current ? { transform: `translate(${drag.current.x - drag.current.offX}px, ${drag.current.y - drag.current.offY}px) rotate(2deg)` } : undefined}
        >
          {ghostCard.image ? <img src={ghostCard.image} alt="" /> : <div className="text-card">{ghostCard.name}</div>}
        </div>
      )}
      <div className="builder-bar">
        <div className="bar-left">
          <Link to="/?tab=past" className="back">← Pools</Link>
          <span className="muted">
            {pool.setName} · building as <b>{meta.playerName}</b>
          </span>
          <CopyButton text={poolUrl} label="Copy pool link" className="btn" />
          <label className="size-slider">
            Card size
            <input type="range" min={BASE_CARD_W} max={MAX_CARD_W} step={4} value={cardW} onChange={(e) => changeCardSize(Number(e.target.value))} />
          </label>
        </div>
        <div className="bar-right">
          <span className={`save-state ${save}`}>{locked ? 'Submitted' : saveLabel}</span>
          <CopyButton text={decklist} label="Copy decklist" />
          {locked ? (
            <>
              <button className="btn" onClick={() => setSubmitted(false)}>Edit</button>
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
          Your deck is submitted and visible to others who’ve submitted. Choosing Edit hides it from the comparison until you submit again.
        </div>
      )}

      <div className="builder-body">
        <div className="zones">
          <section className="zone deck-zone">
            <div className="zone-head">
              <h2>
                Deck <span className={`count ${total === 40 ? 'ok' : ''}`}>{total}/40</span>
              </h2>
              <span className="muted small">
                {spells.length} spells · {nonbasicLands + basicTotal} lands
              </span>
              {!locked && deckUids.length > 0 && (
                <div className="zone-actions">
                  <SortSelect
                    label="Sort deck"
                    options={[['cmc', 'Mana value'], ['color', 'Color']]}
                    onSort={(mode) => {
                      setDeckMode(mode);
                      setLayout({ ...layout, deck: sortedColumns(deckUids.map(getCard), mode) });
                    }}
                  />
                  <button className="btn small" type="button" onClick={clearDeck}>
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="columns" ref={deckAreaRef} style={{ height: deckHeight }}>
              {layout.deck.map((col, i) => (
                <Pile key={i} zone="deck" col={i} visible={col} onCardClick={clickDeckCard} {...pileProps} />
              ))}
              <NewPile zone="deck" at={layout.deck.length} dragging={dragging} hint={hint} big={layout.deck.length === 0} />
            </div>
            <ResizeHandle target={deckAreaRef} onResize={resizeZone('deck')} />
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
                {!locked && (
                  <SortSelect
                    label="Sort sideboard"
                    options={[['color', 'Color'], ['cmc', 'Mana value']]}
                    onSort={(mode) => {
                      setSideMode(mode);
                      setLayout({ ...layout, side: sortedColumns(sideCards, mode) });
                    }}
                  />
                )}
              </div>
            </div>
            {(filter.size > 0 || q) && (
              <p className="muted small filter-note">
                {filter.size > 0 && `Showing cards castable with ${[...filter].map((c) => COLOR_NAMES[c]).join(' + ')} (plus colorless and lands) · `}
                {hiddenCount} hidden
              </p>
            )}
            <div className="columns" ref={sideAreaRef} style={{ height: sideHeight }}>
              {layout.side.map((col, i) => {
                const visible = sidePiles[i];
                return visible.length ? <Pile key={i} zone="side" col={i} visible={visible} onCardClick={clickSideCard} {...pileProps} /> : null;
              })}
              <NewPile zone="side" at={layout.side.length} dragging={dragging} hint={hint} />
            </div>
            <ResizeHandle target={sideAreaRef} onResize={resizeZone('side')} />
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
            <h3>Basic lands</h3>
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
                      <button type="button" disabled={locked || basics[c] === 0} onClick={() => removeBasic(c)} aria-label={`Remove a ${BASIC_NAMES[c]}`}>
                        −
                      </button>
                      <span className="n">{basics[c]}</span>
                      <button type="button" disabled={locked} onClick={() => addBasic(c)} aria-label={`Add a ${BASIC_NAMES[c]}`}>
                        +
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">Percentages show each color’s share of the mana symbols in your deck. Click a basic in your deck to remove it.</p>
          </section>

          <section className="panel">
            <h3>Notes</h3>
            <textarea
              value={meta.notes}
              disabled={locked}
              maxLength={2000}
              rows={4}
              placeholder="Why this build? Shared with the others once everyone can compare."
              onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
            />
          </section>
        </aside>
      </div>
    </main>
  );
}
