import { useEffect, useRef } from 'react';
import type { PoolCard } from '../../../shared/types.ts';
import { RARITY_ORDER } from '../../../shared/cards.ts';
import { CardTile } from './Card.tsx';

/** Shown the first time a player opens their pool: the rares and mythics they opened. */
export function RaresDialog({ cards, onClose }: { cards: PoolCard[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = cards
    .filter((c) => c.rarity === 'rare' || c.rarity === 'mythic')
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.pack - b.pack);
  const mythics = shown.filter((c) => c.rarity === 'mythic').length;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="rares-title">
        <h2 id="rares-title">Your rares &amp; mythics</h2>
        <p>
          {shown.length - mythics} {shown.length - mythics === 1 ? 'rare' : 'rares'} and {mythics} {mythics === 1 ? 'mythic' : 'mythics'} in your pool.
        </p>
        <div className="rares-grid">
          {shown.map((c) => (
            <div key={c.uid} className="rare-item">
              <CardTile card={c} />
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary" ref={closeRef} onClick={onClose}>
            Start building
          </button>
        </div>
      </div>
    </div>
  );
}
