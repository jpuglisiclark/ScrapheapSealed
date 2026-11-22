import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { getLastName, getRecent, setIdentity, setLastName } from '../identity.ts';
import type { BoosterType, SetInfo } from '../../../shared/types.ts';

export default function Home() {
  const nav = useNavigate();
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState(getLastName());
  const [setCode, setSetCode] = useState('');
  const [boosterType, setBoosterType] = useState<BoosterType>('play');
  const [packCount, setPackCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recent = useMemo(getRecent, []);

  useEffect(() => {
    api
      .sets()
      .then((s) => {
        const sorted = [...s].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
        setSets(sorted);
        setSetCode((cur) => cur || sorted.find((x) => x.setType !== 'masters')?.code || sorted[0]?.code || '');
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const byYear = useMemo(() => {
    const m = new Map<string, SetInfo[]>();
    for (const s of sets ?? []) {
      const y = s.releasedAt.slice(0, 4);
      m.set(y, [...(m.get(y) ?? []), s]);
    }
    return [...m.entries()];
  }, [sets]);

  // Older sets are printed with draft boosters; play boosters started with Murders at Karlov Manor (2024).
  useEffect(() => {
    const s = sets?.find((x) => x.code === setCode);
    if (s) setBoosterType(s.releasedAt >= '2024-02-09' ? 'play' : 'draft');
  }, [setCode, sets]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const n = name.trim();
      setLastName(n);
      const { id } = await api.createPool({ setCode, boosterType, packCount, createdBy: n });
      const me = await api.join(id, n);
      setIdentity(id, me);
      nav(`/p/${id}?new=1`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="page home">
      <section className="hero">
        <h1>Build the same sealed pool. Compare notes.</h1>
        <p className="lede">
          Open six packs, share the link with friends, and everyone builds their own 40 from the identical pool — on their own time.
          When you submit, you unlock everyone else’s decks: what they played, what they cut, and how far apart you landed.
        </p>
        <ol className="steps">
          <li><b>Open</b> a pool from any set</li>
          <li><b>Share</b> the link</li>
          <li><b>Build</b> and submit your deck</li>
          <li><b>Compare</b> picks, colors and curves</li>
        </ol>
      </section>

      <form className="panel create-form" onSubmit={create}>
        <h2>Open a new pool</h2>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="e.g. Jess" />
        </label>
        <label>
          Set
          {loadError ? (
            <div className="error">Couldn’t load sets: {loadError}</div>
          ) : (
            <select value={setCode} onChange={(e) => setSetCode(e.target.value)} disabled={!sets} required>
              {!sets && <option>Loading sets…</option>}
              {byYear.map(([year, list]) => (
                <optgroup key={year} label={year}>
                  {list.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code.toUpperCase()})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </label>
        <div className="row">
          <fieldset className="seg-control">
            <legend>Boosters</legend>
            {(['play', 'draft'] as const).map((t) => (
              <label key={t} className={boosterType === t ? 'on' : ''}>
                <input type="radio" name="bt" value={t} checked={boosterType === t} onChange={() => setBoosterType(t)} />
                {t === 'play' ? 'Play (14)' : 'Draft (14)'}
              </label>
            ))}
          </fieldset>
          <label className="packs">
            Packs
            <input type="number" min={1} max={12} value={packCount} onChange={(e) => setPackCount(Number(e.target.value))} />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy || !sets || !setCode || !name.trim()}>
          {busy ? 'Opening packs…' : 'Open pool'}
        </button>
      </form>

      {recent.length > 0 && (
        <section className="recent">
          <h2>Your recent pools</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <Link to={`/p/${r.id}`}>{r.setName}</Link>
                <span className="muted"> · {new Date(r.visitedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="fineprint">
        Card data and images from Scryfall. Booster collation is an approximation. Not affiliated with Wizards of the Coast.
      </footer>
    </main>
  );
}
