import { useCallback, useEffect, useRef, useState } from 'react';

interface Ask {
  title: string;
  message: string;
  confirmLabel: string;
  /** Notice with a single button instead of a yes/no question. */
  alertOnly?: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * In-app replacement for window.confirm.
 * `const [dialog, confirmInApp] = useConfirm();` then render `{dialog}` and `await confirmInApp({...})`.
 */
export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirmInApp = useCallback(
    (o: { title: string; message: string; confirmLabel?: string; alertOnly?: boolean }) =>
      new Promise<boolean>((resolve) => setAsk({ confirmLabel: 'OK', ...o, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };
  const dialog = ask ? <ConfirmDialog {...ask} onClose={close} /> : null;
  return [dialog, confirmInApp] as const;
}

function ConfirmDialog({ title, message, confirmLabel, alertOnly, onClose }: Ask & { onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-msg">{message}</p>
        <div className="modal-actions">
          {!alertOnly && (
            <button type="button" className="btn" onClick={() => onClose(false)}>
              Cancel
            </button>
          )}
          <button type="button" className="btn primary" ref={confirmRef} onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
