import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Asks the player to rate the pool 1–10 before their deck is submitted.
 * `const [dialog, askRating] = useRating();` then `const r = await askRating(previous)`
 * resolves to the rating, or null if they cancel.
 */
export function useRating() {
  const [ask, setAsk] = useState<{ initial: number | null; resolve: (r: number | null) => void } | null>(null);
  const askRating = useCallback((initial: number | null) => new Promise<number | null>((resolve) => setAsk({ initial, resolve })), []);
  const close = (r: number | null) => {
    ask?.resolve(r);
    setAsk(null);
  };
  const dialog = ask ? <RatingDialog initial={ask.initial} onClose={close} /> : null;
  return [dialog, askRating] as const;
}

function RatingDialog({ initial, onClose }: { initial: number | null; onClose: (r: number | null) => void }) {
  const [rating, setRating] = useState<number | null>(initial);
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rating-title">
        <h2 id="rating-title">Rate this pool</h2>
        <p>How good was the pool you built from, out of 10? Everyone sees your rating next to your deck.</p>
        <div className="rating-scale" role="radiogroup" aria-label="Pool rating out of 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              className={`rating-btn ${rating === n ? 'on' : ''}`}
              ref={n === 1 ? firstRef : undefined}
              onClick={() => setRating(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="rating-ends muted small">
          <span>1 · weak pool</span>
          <span>10 · amazing pool</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={rating === null} onClick={() => onClose(rating)}>
            Submit &amp; see results
          </button>
        </div>
      </div>
    </div>
  );
}
