import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.ts';
import { openDb } from '../server/db.ts';
import { card, fakeSet } from './fixtures.ts';

function setup() {
  let fetches = 0;
  const app = createApp({
    db: openDb(':memory:'),
    setCode: 'tst',
    cards: {
      fetchBasics: async () => ({ W: card({ name: 'Plains', typeLine: 'Basic Land — Plains', manaCost: '', cmc: 0 }) }),
      fetchSets: async () => [{ code: 'tst', name: 'Test Set', releasedAt: '2024-01-01', setType: 'expansion', iconSvg: '' }],
      fetchSetCards: async () => {
        fetches++;
        return fakeSet();
      },
    },
  });
  return { app, fetches: () => fetches };
}

describe('API', () => {
  it('runs the full flow: create pool, join, build, submit, compare', async () => {
    const { app, fetches } = setup();
    const config = (await request(app).get('/api/config').expect(200)).body;
    expect(config.set.code).toBe('tst');
    // Set and booster type are fixed by the server; whatever the client sends is ignored.
    const created = await request(app).post('/api/pools').send({ setCode: 'xyz', boosterType: 'draft', createdBy: 'Ann', packCount: 6 }).expect(201);
    const poolId = created.body.id;

    const pool = (await request(app).get(`/api/pools/${poolId}`).expect(200)).body;
    expect(pool.cards).toHaveLength(84);
    expect(pool.boosterType).toBe('play');
    expect(pool.basicLands.W.name).toBe('Plains');
    expect(pool.decks).toEqual([]);

    const ann = (await request(app).post(`/api/pools/${poolId}/decks`).send({ playerName: 'Ann' }).expect(201)).body;
    const bob = (await request(app).post(`/api/pools/${poolId}/decks`).send({ playerName: 'Bob' }).expect(201)).body;

    // Can't edit someone else's deck
    await request(app).put(`/api/decks/${ann.deckId}`).set('x-deck-token', bob.token).send({ main: [] }).expect(403);

    const uids = pool.cards.slice(0, 23).map((c: any) => c.uid);
    const saved = await request(app)
      .put(`/api/decks/${ann.deckId}`)
      .set('x-deck-token', ann.token)
      .send({ main: [...uids, 'bogus', uids[0]], basics: { W: 9, U: 8, B: -3 }, layout: { deck: [[uids[0], 'basic-W-1']], side: 'junk' } })
      .expect(200);
    expect(saved.body.layout).toEqual({ deck: [[uids[0], 'basic-W-1']], side: [] });
    expect(saved.body.main).toEqual(uids);
    expect(saved.body.basics).toEqual({ W: 9, U: 8, B: 0, R: 0, G: 0 });

    // Results are locked until you submit
    await request(app).get(`/api/pools/${poolId}/results`).expect(403);
    await request(app).get(`/api/pools/${poolId}/results`).set('x-deck-token', ann.token).expect(403);

    await request(app).put(`/api/decks/${ann.deckId}`).set('x-deck-token', ann.token).send({ submitted: true }).expect(200);
    // Submitted decks are locked against edits until reopened
    await request(app).put(`/api/decks/${ann.deckId}`).set('x-deck-token', ann.token).send({ main: [] }).expect(409);

    const results = (await request(app).get(`/api/pools/${poolId}/results`).set('x-deck-token', ann.token).expect(200)).body;
    expect(results.decks.map((d: any) => d.playerName)).toEqual(['Ann']); // Bob hasn't submitted

    const lobby = (await request(app).get(`/api/pools/${poolId}`).expect(200)).body;
    expect(lobby.decks.map((d: any) => [d.playerName, !!d.submittedAt, d.mainCount])).toEqual([
      ['Ann', true, 23],
      ['Bob', false, 0],
    ]);
    expect(JSON.stringify(lobby)).not.toContain(ann.token);

    // A second pool from the same set uses the cached card list
    await request(app).post('/api/pools').send({ createdBy: 'Cy' }).expect(201);
    expect(fetches()).toBe(1);

    const list = (await request(app).get('/api/pools').expect(200)).body;
    expect(list.map((p: any) => p.createdBy)).toEqual(['Cy', 'Ann']);
    expect(list[1].players.map((p: any) => [p.playerName, p.submitted])).toEqual([
      ['Ann', true],
      ['Bob', false],
    ]);
  });

  it('validates input', async () => {
    const { app } = setup();
    await request(app).post('/api/pools').send({}).expect(400);
    await request(app).post('/api/pools').send({ createdBy: 'A', packCount: 50 }).expect(400);
    await request(app).get('/api/pools/missing').expect(404);
  });
});
