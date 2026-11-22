import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity, getLastName, setIdentity, setLastName } from '../identity.ts';
import type { PoolWithDecks } from '../../../shared/types.ts';

export function CopyButton({ text, label = 'Copy', className = 'btn' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          prompt('Copy this:', text);
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

/** Where a shared pool link lands: pick a name, then go straight to building. */
export default function Join() {
  const { poolId = '' } = useParams();
  const nav = useNavigate();
  const me = getIdentity(poolId);
  const [pool, setPool] = useState<PoolWithDecks | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(getLastName());
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!me) api.pool(poolId).then(setPool).catch((e) => setError(e.message));
  }, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me) return <Navigate to={`/p/${poolId}/build`} replace />;
  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!pool) return <main className="page"><p className="muted">Loading pool…</p></main>;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    try {
      const n = name.trim();
      setLastName(n);
      setIdentity(poolId, await api.join(poolId, n));
      nav(`/p/${poolId}/build`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <main className="page join-page">
      <form onSubmit={join} className="panel join">
        <p className="eyebrow">{pool.setName} sealed pool</p>
        <h1>{pool.createdBy} invited you to build this pool</h1>
        <p className="muted">
          {pool.packCount} play boosters · {pool.cards.length} cards
          {pool.decks.length > 0 && ` · ${pool.decks.map((d) => d.playerName).join(', ')} building`}
        </p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
        </label>
        <button className="btn primary big" disabled={joining || !name.trim()}>
          Start building
        </button>
        <p className="muted small">Everyone’s decks stay hidden until you submit your own.</p>
      </form>
    </main>
  );
}
