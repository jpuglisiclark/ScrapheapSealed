import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, COLOR_NAMES, type Color, type Layout, type PoolCard, type PoolWithDecks } from '../../../shared/types.ts';
import { BASIC_NAMES, basicsCount, cardColors, curveBucket, exportDecklist, isCreature, isLand } from '../../../shared/cards.ts';
import {
  basicCard,
  basicColor,
  basicsFromLayout,
  isBasicId,
  layoutOrder,
  mainFromLayout,
  moveCards,
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
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { RaresDialog } from '../components/RaresDialog.tsx';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';
interface DeckMeta {
  playerName: string;
  notes: string;
  submittedAt: string | null;
}
/** Where dragged cards would land, plus where to draw the insertion line. */
type DropHint = DropTarget & { lineTop?: number };
const sameHint = (a: DropHint | null, b: DropHint | null) => JSON.stringify(a) === JSON.stringify(b);

const MIN_CARD_W = typeof window !== 'undefined' && window.innerWidth < 640 ? 96 : 128;
const MAX_CARD_W = 240;
const DEFAULT_SPLIT = 0.45;
const MIN_DECK = 40;

/** Whether this browser has already shown a deck's rares popup (storage may be unavailable). */
function raresSeen(deckId: string) {
  try {
    return localStorage.getItem(`st:raresSeen:${deckId}`) === '1';
  } catch {
    return false;
  }
}
function markRaresSeen(deckId: string) {
  try {
    localStorage.setItem(`st:raresSeen:${deckId}`, '1');
  } catch {
    /* storage unavailable */
  }
}

/** Per-browser view preferences; storage can be unavailable, so every access is guarded. */
function readNumber(key: string, ok: (v: number) => boolean, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    const v = Number(raw);
    if (raw !== null && ok(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}
function writeValue(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage unavailable */
  }
}

interface PileProps {
  zone: Zone;
  col: number;
  visible: string[];
  getCard: (uid: string) => PoolCard;
  locked: boolean;
  draggingSet: Set<string>;
  selected: Set<string>;
  hint: DropHint | null;
  onCardClick: (c: PoolCard, e: React.MouseEvent) => void;
  onDragPointerDown: (uid: string, e: React.PointerEvent) => void;
  onPileDragPointerDown: (uids: string[], e: React.PointerEvent) => void;
}

function Pile({ zone, col, visible, getCard, locked, draggingSet, selected, hint, onCardClick, onDragPointerDown, onPileDragPointerDown }: PileProps) {
  // Empty slots get no highlight or line: dropping there simply puts the cards in that slot.
  const active = visible.length > 0 && hint && 'col' in hint && hint.zone === zone && hint.col === col;
  return (
    <div className={`column pile ${active ? 'drop-active' : ''} ${visible.length ? '' : 'empty'}`} data-drop="pile" data-zone={zone} data-col={col}>
      <div
        className={`column-head ${visible.length && !locked ? 'can-drag' : ''}`}
        title={visible.length && !locked ? 'Drag to move this whole pile' : undefined}
        onPointerDown={visible.length && !locked ? (e) => onPileDragPointerDown(visible, e) : undefined}
      >
        {visible.length ? `${visible.length} ${visible.length === 1 ? 'card' : 'cards'}` : '\u00a0'}
      </div>
      <div className="stack">
        {visible.map((u) => {
          const c = getCard(u);
          return (
            <CardTile
              key={u}
              card={c}
              onClick={locked ? undefined : (e) => onCardClick(c, e)}
              onDragPointerDown={locked ? undefined : (e) => onDragPointerDown(u, e)}
              dragging={draggingSet.has(u)}
              selected={selected.has(u)}
            />
          );
        })}
        {active && hint.lineTop !== undefined && <div className="drop-line" style={{ top: hint.lineTop }} />}
      </div>
    </div>
  );
}

/** Width of an element, kept up to date as it resizes. */
function useWidth(ref: React.RefObject<HTMLElement>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  });
  return w;
}

/** Where on screen dragged cards would land, worked out from the piles under the pointer. */
function hitTest(x: number, y: number, layout: Layout): DropHint | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null;
  if (!el) return null;
  const zone = el.dataset.zone as Zone;
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

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const normBox = (b: Box) => ({ left: Math.min(b.x1, b.x2), top: Math.min(b.y1, b.y2), right: Math.max(b.x1, b.x2), bottom: Math.max(b.y1, b.y2) });

/** Cards whose visible part (not the part covered by the next card in the pile) overlaps the box. */
function cardsInBox(root: HTMLElement, box: Box): string[] {
  const b = normBox(box);
  const hits: string[] = [];
  for (const area of root.querySelectorAll<HTMLElement>('.columns')) {
    const clip = area.getBoundingClientRect();
    for (const stack of area.querySelectorAll<HTMLElement>('.stack')) {
      const tiles = [...stack.querySelectorAll<HTMLElement>(':scope > .card-tile')];
      tiles.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const top = Math.max(r.top, clip.top);
        const bottom = Math.min(i + 1 < tiles.length ? tiles[i + 1].getBoundingClientRect().top : r.bottom, clip.bottom);
        const left = Math.max(r.left, clip.left);
        const right = Math.min(r.right, clip.right);
        if (bottom > top && right > left && left < b.right && right > b.left && top < b.bottom && bottom > b.top) hits.push(t.dataset.uid!);
      });
    }
  }
  return hits;
}

interface DragState {
  uids: string[];
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
  const [deckMode, setDeckMode] = useState<SortMode>('cmc');
  const [cardW, setCardW] = useState(() => readNumber('st:cardW', (v) => v >= MIN_CARD_W && v <= MAX_CARD_W, MIN_CARD_W));
  const [split, setSplit] = useState(() => readNumber('st:split', (v) => v >= 0.1 && v <= 0.9, DEFAULT_SPLIT));
  const [filter, setFilter] = useState<Set<Color>>(new Set());
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<string[] | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<DragState | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const hintRef = useRef<DropHint | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const deckAreaRef = useRef<HTMLDivElement>(null);
  const sideAreaRef = useRef<HTMLDivElement>(null);
  const deckAreaW = useWidth(deckAreaRef);
  const sideAreaW = useWidth(sideAreaRef);
  const suppressClick = useRef(false);
  const loaded = useRef(false);
  const [dialog, confirmInApp] = useConfirm();
  const [showRares, setShowRares] = useState(false);
  layoutRef.current = layout;

  useEffect(() => {
    if (!me) return;
    Promise.all([api.pool(poolId), api.deck(me.deckId, me.token)])
      .then(([p, d]) => {
        setPool(p);
        setMeta({ playerName: d.playerName, notes: d.notes, submittedAt: d.submittedAt });
        setLayout(reconcileLayout(p, d.main, d.basics, d.layout));
        // First time this player opens their pool: a deck nobody has arranged or added to yet.
        if (!raresSeen(d.id) && !d.layout && d.main.length === 0 && !d.submittedAt) setShowRares(true);
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

  // Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const avgCmc = spells.length ? spells.reduce((s, c) => s + c.cmc, 0) / spells.length : 0;

  const q = search.trim().toLowerCase();
  const shownInSide = (u: string) => {
    const c = getCard(u);
    if (q && !`${c.name} ${c.typeLine} ${c.oracleText}`.toLowerCase().includes(q)) return false;
    return filter.size === 0 || cardColors(c).every((col) => filter.has(col));
  };
  const sidePiles = layout.side.map((col) => col.filter(shownInSide));
  const hiddenCount = sideCards.length - sidePiles.flat().length;
  const inDeck = new Set(deckUids);

  /**
   * Dragging uses pointer events (not the browser's native drag and drop, which is unreliable
   * across browsers). A press only turns into a drag after the mouse moves a few pixels,
   * so plain clicks still work. Dragging a selected card moves the whole selection.
   */
  function onDragPointerDown(uid: string, e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const keep = selected.has(uid);
    startDrag(keep ? layoutOrder(layoutRef.current!).filter((u) => selected.has(u)) : [uid], keep, e);
  }
  /** Dragging a pile's "N cards" label moves the whole pile. */
  function onPileDragPointerDown(uids: string[], e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    startDrag(uids, false, e);
  }

  function startDrag(group: string[], keepSelection: boolean, e: React.PointerEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { uids: group, startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, x: e.clientX, y: e.clientY, active: false };
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
    // Scroll the page, and the deck/sideboard area under the pointer, when dragging near their edges.
    const autoScroll = () => {
      const d = drag.current;
      if (!d?.active) return;
      const edge = 70;
      const dy = d.y < edge ? -(edge - d.y) / 3 : d.y > window.innerHeight - edge ? (d.y - (window.innerHeight - edge)) / 3 : 0;
      if (dy) {
        window.scrollBy(0, dy);
        updateHint();
      }
      const sc = document.elementFromPoint(d.x, d.y)?.closest('.columns') as HTMLElement | null;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const inner = 40;
        const sy = d.y < rect.top + inner ? -6 : d.y > rect.bottom - inner ? 6 : 0;
        const sx = d.x < rect.left + inner ? -6 : d.x > rect.right - inner ? 6 : 0;
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
        if (!keepSelection) setSelected(new Set());
        setDragging(d.uids);
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
      if (target && layoutRef.current) setLayout(moveCards(layoutRef.current, d.uids, target));
      hintRef.current = null;
      setHint(null);
      setDragging(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Press on empty space in the deck or sideboard and drag to draw a selection box. */
  function onAreaPointerDown(e: React.PointerEvent) {
    if (locked || e.button !== 0 || e.pointerType === 'touch') return;
    if ((e.target as HTMLElement).closest('.card-tile')) return;
    const root = tableRef.current;
    if (!root) return;
    e.preventDefault();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? new Set(selected) : new Set<string>();
    const b: Box = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
    let moved = false;
    document.body.classList.add('selecting-cards');
    const move = (ev: PointerEvent) => {
      b.x2 = ev.clientX;
      b.y2 = ev.clientY;
      if (!moved && Math.hypot(b.x2 - b.x1, b.y2 - b.y1) < 4) return;
      moved = true;
      setBox({ ...b });
      setSelected(new Set([...base, ...cardsInBox(root, b)]));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('selecting-cards');
      setBox(null);
      if (!moved && !additive) setSelected(new Set());
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Drag the line between deck and sideboard; the window's total height stays the same. */
  function onDividerPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || !tableRef.current) return;
    e.preventDefault();
    // Panes share the window's height minus the divider; follow the mouse's movement exactly.
    const usable = tableRef.current.getBoundingClientRect().height - 12;
    const startY = e.clientY;
    const startSplit = split;
    document.body.classList.add('resizing-split');
    let last = split;
    const move = (ev: PointerEvent) => {
      last = Math.max(0.1, Math.min(0.9, startSplit + (ev.clientY - startY) / usable));
      setSplit(last);
    };
    const up = () => {
      document.body.classList.remove('resizing-split');
      writeValue('st:split', last);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Send cards to the other zone, each into the pile it naturally belongs in. */
  function sendAcross(uids: string[]) {
    let next = layout!;
    for (const u of uids) {
      if (inDeck.has(u)) next = isBasicId(u) ? removeCard(next, u) : placeCard(next, 'side', getCard(u), sideMode, getCard);
      else next = placeCard(next, 'deck', getCard(u), deckMode, getCard);
    }
    setLayout(next);
  }
  const onCardClick = (c: PoolCard, e: React.MouseEvent) => {
    if (suppressClick.current) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Modifier-click adds or removes a card from the selection.
      const next = new Set(selected);
      if (next.has(c.uid)) next.delete(c.uid);
      else next.add(c.uid);
      setSelected(next);
      return;
    }
    if (selected.has(c.uid) && selected.size > 1) sendAcross(layoutOrder(layout).filter((u) => selected.has(u)));
    else sendAcross([c.uid]);
    setSelected(new Set());
  };
  const addBasic = (col: Color) => setLayout(placeCard(layout, 'deck', basicCard(pool, nextBasicId(layout, col)), deckMode, getCard));
  const removeBasic = (col: Color) => {
    const last = [...deckUids].reverse().find((u) => basicColor(u) === col);
    if (last) setLayout(removeCard(layout, last));
  };
  const clearDeck = async () => {
    const ok = await confirmInApp({
      title: 'Clear your deck?',
      message: `All ${total} cards in your deck will go back to the sideboard. Basic lands will be removed.`,
      confirmLabel: 'Clear deck',
    });
    if (!ok) return;
    let next: Layout = { deck: [], side: layout.side };
    for (const u of deckUids) if (!isBasicId(u)) next = placeCard(next, 'side', getCard(u), sideMode, getCard);
    setLayout(next);
    setSelected(new Set());
  };
  const changeCardSize = (w: number) => {
    setCardW(w);
    writeValue('st:cardW', w);
  };

  const draggingSet = new Set(dragging ?? []);
  const pileProps = { getCard, locked, draggingSet, selected, hint, onDragPointerDown, onPileDragPointerDown, onCardClick };
  const ghostCard = dragging ? getCard(dragging[0]) : null;
  // Show enough slots to fill the visible width, plus one spare so there's always room to the right.
  // As many slots as fit the visible width exactly, so there's no sideways scrolling unless
  // piles have been placed further right than fits (e.g. after making cards bigger).
  const GAP = 16; // keep in sync with .columns gap in styles.css
  const fit = (areaW: number) => Math.max(1, Math.floor((areaW - 4 + GAP) / (cardW + GAP)));
  const slotCount = (piles: number, areaW: number) => Math.max(piles, fit(areaW));
  const deckSlots = Array.from({ length: slotCount(layout.deck.length, deckAreaW) }, (_, i) => layout.deck[i] ?? []);
  const sideSlots = Array.from({ length: slotCount(layout.side.length, sideAreaW) }, (_, i) => sidePiles[i] ?? []);

  async function setSubmitted(submitted: boolean) {
    if (!me || !layout || !meta) return;
    if (submitted && total < MIN_DECK) {
      await confirmInApp({
        title: 'Deck too small',
        message: `Your deck must have a minimum of ${MIN_DECK} cards in it.`,
        confirmLabel: 'OK',
        alertOnly: true,
      });
      return;
    }
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
      setSelected(new Set());
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
  const nb = box && normBox(box);

  return (
    <main className={`builder ${dragging ? 'is-dragging' : ''}`} style={{ '--card-w': `${cardW}px` } as React.CSSProperties}>
      {dialog}
      {showRares && (
        <RaresDialog
          cards={pool.cards}
          onClose={() => {
            markRaresSeen(me.deckId);
            setShowRares(false);
          }}
        />
      )}
      {ghostCard && (
        <div
          className="drag-ghost"
          ref={ghost}
          aria-hidden
          style={drag.current ? { transform: `translate(${drag.current.x - drag.current.offX}px, ${drag.current.y - drag.current.offY}px) rotate(2deg)` } : undefined}
        >
          {ghostCard.image ? <img src={ghostCard.image} alt="" /> : <div className="text-card">{ghostCard.name}</div>}
          {dragging!.length > 1 && <span className="ghost-count">{dragging!.length}</span>}
        </div>
      )}
      {nb && <div className="marquee" style={{ left: nb.left, top: nb.top, width: nb.right - nb.left, height: nb.bottom - nb.top }} />}

      <div className="builder-bar">
        <div className="bar-left">
          <Link to="/?tab=past" className="back">← Pools</Link>
          <span className="muted">
            {pool.setName} · building as <b>{meta.playerName}</b>
          </span>
          <CopyButton text={poolUrl} label="Copy pool link" className="btn" />
          <label className="size-slider">
            Card size
            <input type="range" min={MIN_CARD_W} max={MAX_CARD_W} step={4} value={cardW} onChange={(e) => changeCardSize(Number(e.target.value))} />
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
        <div className="table" ref={tableRef}>
          <section className="pane deck-pane" style={{ height: `calc((100% - 12px) * ${split})` }}>
            <div className="pane-head">
              <h2>
                Deck <span className={`count ${total === 40 ? 'ok' : ''}`}>{total}/40</span>
              </h2>
              <span className="muted small">
                {spells.length} spells · {nonbasicLands + basicTotal} lands
                {selected.size > 0 && ` · ${selected.size} selected`}
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
            <div className={`columns ${layout.deck.length > fit(deckAreaW) ? '' : 'no-x-scroll'}`} ref={deckAreaRef} onPointerDown={onAreaPointerDown}>
              {deckSlots.map((col, i) => (
                <Pile key={i} zone="deck" col={i} visible={col} {...pileProps} />
              ))}
              {deckUids.length === 0 && <p className="empty-hint">Click cards in your sideboard to add them, or drag them here.</p>}
            </div>
          </section>

          <div
            className="divider"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to change how much space the deck and sideboard get. Double-click to reset."
            title="Drag to resize · double-click to reset"
            onPointerDown={onDividerPointerDown}
            onDoubleClick={() => {
              setSplit(DEFAULT_SPLIT);
              writeValue('st:split', DEFAULT_SPLIT);
            }}
          >
            <span />
          </div>

          <section className="pane side-pane">
            <div className="pane-head">
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
            <div className={`columns ${layout.side.length > fit(sideAreaW) ? '' : 'no-x-scroll'}`} ref={sideAreaRef} onPointerDown={onAreaPointerDown}>
              {sideSlots.map((col, i) => (
                <Pile key={i} zone="side" col={i} visible={col} {...pileProps} />
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
            <h3>Basic lands</h3>
            <ul className="basics">
              {COLORS.map((c) => (
                <li key={c}>
                  <span className="pip-label">
                    <ColorDots colors={[c]} /> {BASIC_NAMES[c]}
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
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>Notes</h3>
            <textarea
              value={meta.notes}
              disabled={locked}
              maxLength={2000}
              rows={4}
              placeholder="Why this build?"
              onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
            />
          </section>
        </aside>
      </div>
    </main>
  );
}
