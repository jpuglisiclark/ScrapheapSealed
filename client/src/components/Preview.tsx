import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PoolCard } from '../../../shared/types.ts';

interface PreviewState {
  card: PoolCard;
  x: number;
  y: number;
}
interface PreviewApi {
  show: (card: PoolCard, e: React.PointerEvent | React.MouseEvent) => void;
  hide: () => void;
}

const Ctx = createContext<PreviewApi>({ show: () => {}, hide: () => {} });
export const usePreview = () => useContext(Ctx);

const W = 250;
const H = 349;
/** How long the mouse has to rest on a card before its preview appears. */
export const PREVIEW_DELAY_MS = 500;

/**
 * Floating large-card preview that follows the mouse (desktop only).
 * It appears only once the mouse has stayed on the same card for PREVIEW_DELAY_MS.
 */
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState | null>(null);
  const pending = useRef<PreviewState | null>(null);
  const shownCard = useRef<PoolCard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((card: PoolCard, e: React.PointerEvent | React.MouseEvent) => {
    if ('pointerType' in e && e.pointerType !== 'mouse') return;
    const next = { card, x: e.clientX, y: e.clientY };
    if (shownCard.current?.uid === card.uid) {
      setState(next); // already showing this card: just follow the mouse
      return;
    }
    if (pending.current?.card.uid !== card.uid) {
      // Moved onto a different card: hide any preview and start waiting again.
      if (timer.current) clearTimeout(timer.current);
      if (shownCard.current) {
        shownCard.current = null;
        setState(null);
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!pending.current) return;
        shownCard.current = pending.current.card;
        setState(pending.current);
      }, PREVIEW_DELAY_MS);
    }
    pending.current = next;
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    shownCard.current = null;
    setState(null);
  }, []);
  useEffect(() => hide, [hide]);

  let style: React.CSSProperties | undefined;
  if (state) {
    const left = state.x + 24 + W > window.innerWidth ? state.x - 24 - W : state.x + 24;
    const top = Math.max(8, Math.min(window.innerHeight - H - 8, state.y - H / 2));
    style = { left, top, width: W };
  }
  const c = state?.card;
  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      {c && (
        <div className="preview" style={style} aria-hidden>
          {c.image ? (
            <div className="preview-faces">
              <img src={c.image} alt="" className={c.foil ? 'foil' : ''} />
              {c.imageBack && <img src={c.imageBack} alt="" />}
            </div>
          ) : (
            <TextCard card={c} large />
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function TextCard({ card, large }: { card: PoolCard; large?: boolean }) {
  return (
    <div className={`text-card ${large ? 'large' : ''}`}>
      <div className="tc-head">
        <span className="tc-name">{card.name}</span>
        <span className="tc-cost">{card.manaCost}</span>
      </div>
      <div className="tc-type">{card.typeLine}</div>
      {large && <div className="tc-text">{card.oracleText}</div>}
      {card.power != null && <div className="tc-pt">{card.power}/{card.toughness}</div>}
    </div>
  );
}
