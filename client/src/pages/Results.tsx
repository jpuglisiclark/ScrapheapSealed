import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { getIdentity } from '../identity.ts';
import { COLORS, COLOR_NAMES, type Deck, type Pool, type PoolCard, type PoolWithDecks } from '../../../shared/types.ts';
import { basicCard } from '../../../shared/layout.ts';
import { comparePool, headToHead, type CardConsensus, type DeckAnalysis } from '../../../shared/analytics.ts';
import { CURVE_LABELS, curveBucket, isLand, GUILDS, MONO } from '../../../shared/cards.ts';
import { CardName, CardTile } from '../components/Card.tsx';
import { ColorDots, ManaCost } from '../components/Mana.tsx';
import { Curve, CurveLegend } from '../components/Curve.tsx';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function DeckView({ a, pool }: { a: DeckAnalysis; pool: Pool }) {
  const basics = COLORS.flatMap((c) => Array.from({ length: a.deck.basics[c] }, (_, i) => basicCard(pool, `basic-${c}-${i + 1}`)));
  const cols = [
    ...CURVE_LABELS.map((l, i) => ({ label: `${l} mana`, cards: a.spells.filter((c) => curveBucket(c.cmc) === i + 1) })),
    { label: 'Lands', cards: a.cards.filter(isLand) },
    { label: 'Basics', cards: basics },
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
              {(col.label === 'Basics' ? col.cards : [...col.cards].sort((x, y) => x.cmc - y.cmc || x.name.localeCompare(y.name))).map((c) => (
                <CardTile key={c.uid} card={c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ a, isMe, curveMax, open, onToggle }: { a: DeckAnalysis; isMe: boolean; curveMax: number; open: boolean; onToggle: () => void }) {
  return (
    <article className={`player-card panel ${open ? 'open' : ''}`}>
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
      {a.rares.length > 0 && (
        <p className="small">
          <span className="muted">Rares played: </span>
          {a.rares.map((r, i) => (
            <span key={r.uid}>
              {i > 0 && ', '}
              <CardName card={r} />
            </span>
          ))}
        </p>
      )}
      {a.deck.notes && <blockquote className="notes">{a.deck.notes}</blockquote>}
      {a.total !== 40 && <p className="small warn">{a.total}-card deck</p>}
      <button className="btn small" onClick={onToggle} aria-expanded={open}>
        {open ? 'Hide deck' : 'View deck'}
      </button>
    </article>
  );
}

function ColorChoices({ data, n }: { data: ReturnType<typeof comparePool>['colors']; n: number }) {
  return (
    <div className="color-chart">
      <div className="legend">
        <span><i className="sw main" /> Main color</span>
        <span><i className="sw splash" /> Splash</span>
      </div>
      {data.map((d) => (
        <div className="color-row" key={d.color} title={`${COLOR_NAMES[d.color]}: main color in ${d.main} deck(s), splashed in ${d.splash}`}>
          <span className="color-row-label">
            <ColorDots colors={[d.color]} /> {COLOR_NAMES[d.color]}
          </span>
          <div className="color-track">
            {d.main > 0 && <div className={`color-fill main c-${d.color}`} style={{ width: `${(d.main / n) * 100}%` }} />}
            {d.splash > 0 && <div className={`color-fill splash c-${d.color}`} style={{ width: `${(d.splash / n) * 100}%` }} />}
          </div>
          <span className="color-row-value">
            {d.main}
            {d.splash ? ` + ${d.splash}` : ''} / {n}
          </span>
        </div>
      ))}
    </div>
  );
}

function Matrix({ analyses, matrix }: { analyses: DeckAnalysis[]; matrix: number[][] }) {
  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th />
            {analyses.map((a) => (
              <th key={a.deck.id} scope="col">{a.deck.playerName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analyses.map((a, i) => (
            <tr key={a.deck.id}>
              <th scope="row">{a.deck.playerName}</th>
              {analyses.map((b, j) => {
                const v = matrix[i][j];
                return i === j ? (
                  <td key={b.deck.id} className="diag">—</td>
                ) : (
                  <td
                    key={b.deck.id}
                    style={{ '--v': v } as React.CSSProperties}
                    className={v > 0.55 ? 'strong' : ''}
                    title={`${a.deck.playerName} & ${b.deck.playerName} share ${pct(v)} of their nonbasic cards`}
                  >
                    {pct(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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

type ConsensusFilter = 'all' | 'played' | 'split' | 'unplayed';

function ConsensusTable({ rows, n }: { rows: CardConsensus[]; n: number }) {
  const [f, setF] = useState<ConsensusFilter>('played');
  const shown = rows.filter((r) =>
    f === 'all' ? true : f === 'played' ? r.players.length > 0 : f === 'split' ? r.players.length > 0 && r.players.length < n : r.players.length === 0,
  );
  const tabs: [ConsensusFilter, string][] = [
    ['played', 'Played by anyone'],
    ['split', 'Split decisions'],
    ['unplayed', 'Nobody played'],
    ['all', 'Whole pool'],
  ];
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="consensus">
          <thead>
            <tr>
              <th>Card</th>
              <th className="hide-sm">Cost</th>
              <th>Played by</th>
              <th className="hide-sm">Who</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <td>
                  <CardName card={r.card} />
                  {r.copiesInPool > 1 && <span className="muted small"> ×{r.copiesInPool}</span>}
                  <span className={`rarity-dot ${r.card.rarity}`} title={r.card.rarity} />
                </td>
                <td className="hide-sm"><ManaCost cost={r.card.manaCost} /></td>
                <td>
                  <div className="incl" title={`${r.players.length} of ${n} decks`}>
                    <div className="incl-track"><div className="incl-fill" style={{ width: `${r.rate * 100}%` }} /></div>
                    <span>{r.players.length}/{n}</span>
                  </div>
                </td>
                <td className="hide-sm who">
                  {r.players.map((p) => (
                    <span key={p.deckId} className="chip">
                      {p.playerName}
                      {p.count > 1 ? ` ×${p.count}` : ''}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted">No cards here.</p>}
      </div>
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
  const [openDeck, setOpenDeck] = useState<string | null>(null);

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
  const opened = cmp.analyses.find((a) => a.deck.id === openDeck);

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
        {n > 1 && (
          <div className="tile" title="Average share of nonbasic cards any two decks have in common">
            <span className="tile-n">{pct(cmp.agreement)}</span>
            <span className="tile-l">average overlap between decks</span>
          </div>
        )}
        <div className="tile">
          <span className="tile-n">{topPairName}</span>
          <span className="tile-l">{topPair && topPair[1] > 1 ? `most popular (${topPair[1]} decks)` : 'most popular colors'}</span>
        </div>
        <div className="tile">
          <span className="tile-n">{cmp.consensus.filter((c) => c.players.length === 0 && !isLand(c.card)).length}</span>
          <span className="tile-l">spells nobody played</span>
        </div>
      </div>

      {n === 1 && <div className="callout">You’re the first to submit. As others finish, their decks and the comparisons will show up here.</div>}

      <section>
        <div className="section-head">
          <h2>The decks</h2>
          <CurveLegend />
        </div>
        <div className="player-grid">
          {ordered.map((a) => (
            <PlayerCard
              key={a.deck.id}
              a={a}
              isMe={a.deck.id === me.deckId}
              curveMax={curveMax}
              open={openDeck === a.deck.id}
              onToggle={() => setOpenDeck(openDeck === a.deck.id ? null : a.deck.id)}
            />
          ))}
        </div>
        {opened && (
          <div className="panel opened-deck">
            <div className="panel-head">
              <h3>{opened.deck.playerName}’s deck — {opened.archetype}</h3>
              <button className="btn small" onClick={() => setOpenDeck(null)}>Close</button>
            </div>
            <DeckView a={opened} pool={pool} />
          </div>
        )}
      </section>

      {n > 1 && (
        <section className="highlights">
          <Highlight title="Everyone played" hint="Cards that made every deck." items={cmp.unanimous} />
          {cmp.divisive.length > 0 && <Highlight title="Most divisive" hint="Cards closest to a 50/50 split." items={cmp.divisive} />}
          <Highlight title="Unique picks" hint="Cards only one builder played." items={cmp.uniquePicks} />
          <Highlight title="Benched rares" hint="Rares and mythics nobody played." items={cmp.benchedRares} />
        </section>
      )}

      <div className="two-col">
        <section className="panel">
          <h2>Color choices</h2>
          <ColorChoices data={cmp.colors} n={n} />
        </section>
        {n > 1 && (
          <section className="panel">
            <h2>Deck overlap</h2>
            <p className="muted small">Share of nonbasic cards each pair of decks has in common.</p>
            <Matrix analyses={cmp.analyses} matrix={cmp.matrix} />
          </section>
        )}
      </div>

      {n > 1 && (
        <section className="panel">
          <h2>Head to head</h2>
          <HeadToHead analyses={cmp.analyses} meIdx={meIdx} />
        </section>
      )}

      <section className="panel">
        <h2>Card by card</h2>
        <ConsensusTable rows={cmp.consensus} n={n} />
      </section>

      <p className="muted small">
        Basic lands are excluded from overlap and card stats. A color counts as “main” when it has at least 5 of a deck’s spells
        (fewer for small decks); anything less is a splash.
      </p>
    </main>
  );
}
