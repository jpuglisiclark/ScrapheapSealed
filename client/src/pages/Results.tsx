import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, COLOR_NAMES, type Color, type Deck, type Pool, type PoolWithDecks } from '../../../shared/types.ts';
import { basicCard, groupBasics } from '../../../shared/layout.ts';
import { comparePool, type DeckAnalysis } from '../../../shared/analytics.ts';
import { CURVE_LABELS, curveBucket, isLand } from '../../../shared/cards.ts';
import { CardTile } from '../components/Card.tsx';
import { ColorDots } from '../components/Mana.tsx';
import { Curve, CurveLegend } from '../components/Curve.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { CopyButton } from './Lobby.tsx';

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
              {col.label === 'Lands'
                ? // Basics of one color show once, with a count
                  groupBasics(col.cards.map((c) => c.uid)).map(({ uid, ids }) => (
                    <CardTile
                      key={uid}
                      card={col.cards.find((c) => c.uid === uid)!}
                      badge={ids.length > 1 ? <span className="count-badge">×{ids.length}</span> : undefined}
                    />
                  ))
                : [...col.cards].sort((x, y) => x.cmc - y.cmc || x.name.localeCompare(y.name)).map((c) => <CardTile key={c.uid} card={c} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stats box shown to the left of each deck. */
/** Bar chart: how many decks used each color (as a main color, or as a splash). */
function ColorBars({ title, counts, n }: { title: string; counts: { color: Color; count: number }[]; n: number }) {
  return (
    <section className="panel color-chart">
      <h2>{title}</h2>
      {counts.map(({ color, count }) => (
        <div className="color-row" key={color} title={`${COLOR_NAMES[color]}: ${count} of ${n} decks`}>
          <span className="color-row-label">
            <ColorDots colors={[color]} /> {COLOR_NAMES[color]}
          </span>
          <div className="color-track">{count > 0 && <div className={`color-fill main c-${color}`} style={{ width: `${(count / n) * 100}%` }} />}</div>
          <span className="color-row-value">
            {count} / {n}
          </span>
        </div>
      ))}
    </section>
  );
}

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
      {a.deck.rating !== null && (
        <p className="pool-rating" title={`${a.deck.playerName} rated the pool ${a.deck.rating} out of 10`}>
          Pool rating <b>{a.deck.rating}</b>
          <span className="muted">/10</span>
        </p>
      )}
      {a.deck.notes && <blockquote className="notes">{a.deck.notes}</blockquote>}
      {a.total !== 40 && <p className="small muted">{a.total}-card deck</p>}
    </div>
  );
}


export default function Results() {
  const { poolId = '' } = useParams();
  const me = getIdentity(poolId);
  const [data, setData] = useState<{ pool: PoolWithDecks; decks: Deck[] } | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [dialog, confirmInApp] = useConfirm();
  const [reopening, setReopening] = useState(false);
  const nav = useNavigate();

  /** Reopen my submitted deck for editing and go to the builder. */
  async function editMyDeck() {
    if (!me) return;
    const ok = await confirmInApp({
      title: 'Edit your deck?',
      message: 'Your deck will be hidden from the comparison until you submit it again.',
      confirmLabel: 'Edit deck',
    });
    if (!ok) return;
    setReopening(true);
    try {
      await api.saveDeck(me.deckId, me.token, { submitted: false });
      nav(`/p/${poolId}/build`);
    } catch (e: any) {
      setReopening(false);
      setError({ status: 0, message: e.message });
    }
  }

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
  const curveMax = Math.max(...cmp.analyses.flatMap((a) => a.curve));
  const pending = pool.decks.filter((d) => !d.submittedAt);
  const ratings = cmp.analyses.map((x) => x.deck.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((t, r) => t + r, 0) / ratings.length : 0;

  return (
    <main className="page results">
      {dialog}
      <div className="results-head">
        <div>
          <Link to="/?tab=past" className="back">← Past pools</Link>
          <h1>How everyone built this pool</h1>
          {pending.length > 0 && (
            <p className="muted">
              Still building: {pending.map((d) => d.playerName).join(', ')}. Refresh later to see their decks.
            </p>
          )}
        </div>
        <div className="results-actions">
          <CopyButton text={`${location.origin}/p/${poolId}`} label="Share pool" />
          <button type="button" className="btn primary" onClick={editMyDeck} disabled={reopening}>
            {reopening ? 'Opening…' : 'Edit my deck'}
          </button>
        </div>
      </div>

      <div className="results-summary">
        <p className="submitted-count">
          <b>{n}</b> {n === 1 ? 'deck' : 'decks'} submitted
        </p>
        {ratings.length > 0 && (
          <p className="avg-rating" title={`Average of ${ratings.length} ${ratings.length === 1 ? 'rating' : 'ratings'}: ${ratings.join(', ')}`}>
            Average pool rating <b>{avgRating.toFixed(1)}</b>
            <span className="muted">/10</span>
          </p>
        )}
      </div>

      <div className="color-charts">
        <ColorBars title="Main colors" counts={cmp.colors.map((c) => ({ color: c.color, count: c.main }))} n={n} />
        <ColorBars title="Splashed colors" counts={cmp.colors.map((c) => ({ color: c.color, count: c.splash }))} n={n} />
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

      <p className="muted small">
        A color counts as “main” when it has at least 5 of a deck’s spells (fewer for small decks); anything less is a splash.
        Hybrid cards that a deck can cast with one of its main colors don’t count as a splash.
      </p>
    </main>
  );
}
