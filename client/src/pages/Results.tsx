import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, type Deck, type Pool, type PoolCard, type PoolWithDecks } from '../../../shared/types.ts';
import { basicCard } from '../../../shared/layout.ts';
import { comparePool, headToHead, type CardConsensus, type DeckAnalysis } from '../../../shared/analytics.ts';
import { CURVE_LABELS, curveBucket, isLand, GUILDS, MONO } from '../../../shared/cards.ts';
import { CardName, CardTile } from '../components/Card.tsx';
import { ColorDots, ManaCost } from '../components/Mana.tsx';
import { Curve, CurveLegend } from '../components/Curve.tsx';

/** A submitted deck laid out in piles by mana value, then lands and basics. */
function DeckView({ a, pool }: { a: DeckAnalysis; pool: Pool }) {
  const basics = COLORS.flatMap((c) => Array.from({ length: a.deck.basics[c] }, (_, i) => basicCard(pool, `basic-${c}-${i + 1}`)));
  const cols = [
    ...CURVE_LABELS.map((l, i) => ({ label: `${l} mana`, cards: a.spells.filter((c) => curveBucket(c.cmc) === i + 1) })),
    { label: 'Lands', cards: [...a.cards.filter(isLand).sort((x, y) => x.name.localeCompare(y.name)), ...basics] },
  ].filter((c) => c.cards.length);
  return (
    <div className="deck-view">
      <div className="columns">
        {cols.map((col) => (
          <div className="column" key={col.label}>
            <div className="column-head">
              {col.label} <span className="muted">{col.cards.length}</span>
            </div>
            <div className="stack">
              {(col.label === 'Lands' ? col.cards : [...col.cards].sort((x, y) => x.cmc - y.cmc || x.name.localeCompare(y.name))).map((c) => (
                <CardTile key={c.uid} card={c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stats box shown to the left of each deck. */
function DeckInfo({ a, isMe, curveMax }: { a: DeckAnalysis; isMe: boolean; curveMax: number }) {
  return (
    <div className="deck-info">
      <header>
        <h3>
          {a.deck.playerName}
          {isMe && <span className="you">you</span>}
        </h3>
        <div className="archetype">
          <ColorDots colors={a.mainColors} splash={a.splashColors} /> {a.archetype}
        </div>
      </header>
      <Curve curve={a.curve} creatures={a.creatureCurve} max={curveMax} height={56} />
      <dl className="stats compact">
        <div><dt>Creatures</dt><dd>{a.creatures}</dd></div>
        <div><dt>Spells</dt><dd>{a.noncreatureSpells}</dd></div>
        <div><dt>Lands</dt><dd>{a.lands}</dd></div>
        <div><dt>Avg MV</dt><dd>{a.avgCmc.toFixed(2)}</dd></div>
      </dl>
      {a.deck.notes && <blockquote className="notes">{a.deck.notes}</blockquote>}
      {a.total !== 40 && <p className="small muted">{a.total}-card deck</p>}
    </div>
  );
}

function HeadToHead({ analyses, meIdx }: { analyses: DeckAnalysis[]; meIdx: number }) {
  const [ai, setAi] = useState(Math.max(0, meIdx));
  const [bi, setBi] = useState(meIdx === 0 || meIdx < 0 ? 1 : 0);
  const a = analyses[ai];
  const b = analyses[bi];
  const h = useMemo(() => headToHead(a, b), [a, b]);
  const list = (cards: PoolCard[]) =>
    cards.length ? (
      <ul className="card-list">
        {cards.map((c, i) => (
          <li key={c.uid + i}>
            <CardName card={c} />
            <ManaCost cost={c.manaCost} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted small">None</p>
    );
  const pick = (v: number, set: (n: number) => void, label: string) => (
    <select value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label}>
      {analyses.map((x, i) => (
        <option key={x.deck.id} value={i}>{x.deck.playerName}</option>
      ))}
    </select>
  );
  return (
    <div>
      <div className="h2h-pickers">
        {pick(ai, setAi, 'First player')} <span className="muted">vs</span> {pick(bi, setBi, 'Second player')}
      </div>
      {ai === bi ? (
        <p className="muted">Pick two different players.</p>
      ) : (
        <div className="h2h">
          <div>
            <h4>Only {a.deck.playerName} <span className="muted">{h.onlyA.length}</span></h4>
            {list(h.onlyA)}
          </div>
          <div>
            <h4>Both <span className="muted">{h.both.length}</span></h4>
            {list(h.both)}
          </div>
          <div>
            <h4>Only {b.deck.playerName} <span className="muted">{h.onlyB.length}</span></h4>
            {list(h.onlyB)}
          </div>
        </div>
      )}
    </div>
  );
}

function Highlight({ title, hint, items }: { title: string; hint: string; items: CardConsensus[] }) {
  return (
    <div className="highlight panel">
      <h3>{title}</h3>
      <p className="muted small">{hint}</p>
      {items.length ? (
        <ul className="card-list">
          {items.slice(0, 8).map((c) => (
            <li key={c.name}>
              <CardName card={c.card} />
              <span className="muted small">{c.players.map((p) => p.playerName).join(', ')}</span>
            </li>
          ))}
          {items.length > 8 && <li className="muted small">+{items.length - 8} more</li>}
        </ul>
      ) : (
        <p className="muted small">None</p>
      )}
    </div>
  );
}

export default function Results() {
  const { poolId = '' } = useParams();
  const me = getIdentity(poolId);
  const [data, setData] = useState<{ pool: PoolWithDecks; decks: Deck[] } | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    api
      .results(poolId, me.token)
      .then(setData)
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e.message }));
  }, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmp = useMemo(() => (data ? comparePool(data.pool, data.decks) : null), [data]);

  if (!me || error?.status === 403)
    return (
      <main className="page">
        <div className="locked panel">
          <h1>Results are locked</h1>
          <p>{error?.message ?? 'Build and submit a deck for this pool to see how everyone else built it.'}</p>
          <Link className="btn primary" to={me ? `/p/${poolId}/build` : `/p/${poolId}`}>
            {me ? 'Back to my deck' : 'Join this pool'}
          </Link>
        </div>
      </main>
    );
  if (error) return <main className="page"><div className="error">{error.message}</div></main>;
  if (!data || !cmp) return <main className="page"><p className="muted">Crunching decks…</p></main>;

  const { pool } = data;
  const n = cmp.analyses.length;
  // Put me first so my deck is easy to find.
  const ordered = [...cmp.analyses].sort((x, y) => Number(y.deck.id === me.deckId) - Number(x.deck.id === me.deckId));
  const meIdx = cmp.analyses.findIndex((a) => a.deck.id === me.deckId);
  const curveMax = Math.max(...cmp.analyses.flatMap((a) => a.curve));
  const pending = pool.decks.filter((d) => !d.submittedAt);
  const pairCounts = new Map<string, number>();
  for (const a of cmp.analyses) {
    const k = a.mainColors.join('');
    pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
  }
  const [topPair] = [...pairCounts.entries()].sort((x, y) => y[1] - x[1]);
  const topPairName = topPair ? (topPair[0].length === 1 ? MONO[topPair[0] as keyof typeof MONO] : GUILDS[topPair[0]] ?? topPair[0]) : '—';

  return (
    <main className="page results">
      <div className="results-head">
        <div>
          <Link to="/?tab=past" className="back">← Past pools</Link>
          <h1>How everyone built {pool.setName}</h1>
          {pending.length > 0 && (
            <p className="muted">
              Still building: {pending.map((d) => d.playerName).join(', ')}. Refresh later to see their decks.
            </p>
          )}
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><span className="tile-n">{n}</span><span className="tile-l">decks submitted</span></div>
        <div className="tile">
          <span className="tile-n">{topPairName}</span>
          <span className="tile-l">{topPair && topPair[1] > 1 ? `most popular (${topPair[1]} decks)` : 'most popular colors'}</span>
        </div>
      </div>

      {n === 1 && <div className="callout">You’re the first to submit. As others finish, their decks and the comparisons will show up here.</div>}

      <section>
        <div className="section-head">
          <h2>The decks</h2>
          <CurveLegend />
        </div>
        <div className="deck-rows">
          {ordered.map((a) => (
            <article key={a.deck.id} className="deck-row panel">
              <DeckInfo a={a} isMe={a.deck.id === me.deckId} curveMax={curveMax} />
              <DeckView a={a} pool={pool} />
            </article>
          ))}
        </div>
      </section>

      {cmp.divisive.length > 0 && (
        <section className="highlights">
          <Highlight title="Most divisive" hint="Cards closest to a 50/50 split." items={cmp.divisive} />
        </section>
      )}

      {n > 1 && (
        <section className="panel">
          <h2>Head to head</h2>
          <HeadToHead analyses={cmp.analyses} meIdx={meIdx} />
        </section>
      )}

      <p className="muted small">
        A color counts as “main” when it has at least 5 of a deck’s spells (fewer for small decks); anything less is a splash.
        Hybrid cards that a deck can cast with one of its main colors don’t count as a splash.
      </p>
    </main>
  );
}
