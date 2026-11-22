import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity, getLastName, rememberPool, resumeUrl, setIdentity, setLastName } from '../identity.ts';
import type { PoolWithDecks } from '../../../shared/types.ts';
import { CardTile } from '../components/Card.tsx';
import { RARITY_ORDER } from '../../../shared/cards.ts';

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
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

export default function Lobby() {
  const { poolId = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pool, setPool] = useState<PoolWithDecks | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(getLastName());
  const [joining, setJoining] = useState(false);
  const me = getIdentity(poolId);

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .pool(poolId)
        .then((p) => {
          if (!live) return;
          setPool(p);
          rememberPool({ id: p.id, setName: p.setName, setCode: p.setCode });
        })
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [poolId]);

  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!pool) return <main className="page"><p className="muted">Loading pool…</p></main>;

  const shareUrl = `${location.origin}/p/${pool.id}`;
  const myDeck = me ? pool.decks.find((d) => d.id === me.deckId) : undefined;
  const submitted = pool.decks.filter((d) => d.submittedAt).length;
  const highlights = pool.cards
    .filter((c) => c.rarity === 'rare' || c.rarity === 'mythic')
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name));

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    try {
      const n = name.trim();
      setLastName(n);
      const id = await api.join(poolId, n);
      setIdentity(poolId, id);
      nav(`/p/${poolId}/build`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <main className="page lobby">
      <div className="lobby-head">
        <div>
          <p className="eyebrow">Sealed pool · {pool.setCode.toUpperCase()}</p>
          <h1>{pool.setName}</h1>
          <p className="muted">
            {pool.packCount} {pool.boosterType} boosters · {pool.cards.length} cards · opened by {pool.createdBy} {timeAgo(pool.createdAt)}
          </p>
        </div>
      </div>

      {params.get('new') && (
        <div className="callout">
          <b>Your pool is ready.</b> Send the link below to everyone who should build it — they don’t need an account.
        </div>
      )}

      <div className="lobby-grid">
        <section className="panel">
          <h2>Invite builders</h2>
          <div className="share">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Share link" />
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
          <p className="muted small">Decks stay hidden until you submit your own — no peeking.</p>
        </section>

        <section className="panel">
          <h2>Your deck</h2>
          {me && myDeck ? (
            <>
              <p>
                Building as <b>{me.playerName}</b> —{' '}
                {myDeck.submittedAt ? <span className="ok">submitted</span> : `${myDeck.mainCount} cards so far`}
              </p>
              <div className="actions">
                <Link className="btn primary" to={`/p/${poolId}/build`}>
                  {myDeck.submittedAt ? 'View my deck' : myDeck.mainCount ? 'Continue building' : 'Start building'}
                </Link>
                {myDeck.submittedAt && (
                  <Link className="btn" to={`/p/${poolId}/results`}>
                    Compare decks →
                  </Link>
                )}
              </div>
              <details className="resume">
                <summary>Continue on another device</summary>
                <p className="muted small">This private link restores your deck anywhere. Don’t share it — it lets anyone edit your deck.</p>
                <CopyButton text={resumeUrl(poolId, me)} label="Copy private link" />
              </details>
            </>
          ) : (
            <form onSubmit={join} className="join">
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
              </label>
              <button className="btn primary" disabled={joining || !name.trim()}>
                Start building
              </button>
            </form>
          )}
        </section>

        <section className="panel players">
          <h2>
            Builders <span className="muted">· {submitted}/{pool.decks.length} submitted</span>
          </h2>
          {pool.decks.length === 0 ? (
            <p className="muted">Nobody has started yet.</p>
          ) : (
            <ul>
              {pool.decks.map((d) => (
                <li key={d.id}>
                  <span className="player-name">
                    {d.playerName}
                    {d.id === me?.deckId && <span className="you">you</span>}
                  </span>
                  {d.submittedAt ? (
                    <span className="status ok">✓ Submitted {timeAgo(d.submittedAt)}</span>
                  ) : (
                    <span className="status">Building · {d.mainCount} cards</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2>Rares & mythics in this pool</h2>
        <div className="card-row">
          {highlights.map((c) => (
            <CardTile key={c.uid} card={c} />
          ))}
        </div>
      </section>
    </main>
  );
}
