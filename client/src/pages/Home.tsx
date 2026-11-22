import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { getIdentity, getLastName, setIdentity, setLastName } from '../identity.ts';
import type { PoolListItem, SetInfo } from '../../../shared/types.ts';

type Tab = 'new' | 'past';

function NewPool() {
  const nav = useNavigate();
  const [set, setSet] = useState<SetInfo | null>(null);
  const [name, setName] = useState(getLastName());
  const [packCount, setPackCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.config().then((c) => setSet(c.set)).catch((e) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const n = name.trim();
      setLastName(n);
      const { id } = await api.createPool({ packCount, createdBy: n });
      setIdentity(id, await api.join(id, n));
      nav(`/p/${id}/build`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="panel create-form" onSubmit={create}>
      <p className="set-line">
        {set ? (
          <>
            <b>{set.name}</b> <span className="muted">({set.code.toUpperCase()}) · Play Boosters</span>
          </>
        ) : (
          <span className="muted">Loading set…</span>
        )}
      </p>
      <div className="row">
        <label className="grow">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="e.g. Jess" />
        </label>
        <label className="packs">
          Packs
          <input type="number" min={1} max={12} value={packCount} onChange={(e) => setPackCount(Number(e.target.value))} />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn primary big" disabled={busy || !set || !name.trim()}>
        {busy ? 'Opening packs…' : 'Open pool'}
      </button>
    </form>
  );
}

function PastPools() {
  const [pools, setPools] = useState<PoolListItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.pools().then(setPools).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="error">{error}</div>;
  if (!pools) return <p className="muted">Loading pools…</p>;
  if (pools.length === 0) return <p className="muted panel">No pools yet. Open one from the New Sealed Pool tab.</p>;
  return (
    <ul className="past-pools">
      {pools.map((p) => {
        const me = getIdentity(p.id);
        const mine = me && p.players.find((x) => x.deckId === me.deckId);
        const submitted = p.players.filter((x) => x.submitted).length;
        return (
          <li key={p.id} className="panel past-pool">
            <div className="pp-main">
              <h3>
                {p.setName} <span className="muted">· opened by {p.createdBy}</span>
              </h3>
              <p className="muted small">
                {new Date(p.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {submitted}/{p.players.length} decks
                submitted
              </p>
              <div className="who">
                {p.players.map((x) => (
                  <span key={x.deckId} className={`chip ${x.submitted ? 'done' : ''}`} title={x.submitted ? 'Submitted' : 'Still building'}>
                    {x.submitted ? '✓ ' : ''}
                    {x.playerName}
                  </span>
                ))}
              </div>
            </div>
            <div className="pp-actions">
              {mine?.submitted ? (
                <Link className="btn primary" to={`/p/${p.id}/results`}>View analytics</Link>
              ) : mine ? (
                <>
                  <Link className="btn primary" to={`/p/${p.id}/build`}>Continue building</Link>
                  <span className="muted small">Submit to unlock analytics</span>
                </>
              ) : (
                <>
                  <Link className="btn" to={`/p/${p.id}`}>Build this pool</Link>
                  <span className="muted small">Submit a deck to unlock analytics</span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'past' ? 'past' : 'new';
  const tabs: [Tab, string][] = [
    ['new', 'New Sealed Pool'],
    ['past', 'Past Sealed Pools'],
  ];
  return (
    <main className="page home">
      <div className="tabs page-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className={tab === k ? 'on' : ''}
            onClick={() => setParams(k === 'new' ? {} : { tab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'new' ? <NewPool /> : <PastPools />}
      </div>
      <footer className="fineprint">
        Card data and images from Scryfall. Booster collation is an approximation. Not affiliated with Wizards of the Coast.
      </footer>
    </main>
  );
}
