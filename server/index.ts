import path from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import * as scryfall from './scryfall.ts';

const port = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? path.resolve('data/sealed.db'));
const app = createApp({
  db,
  cards: scryfall,
  setCode: process.env.SET_CODE ?? 'trk',
  staticDir: process.env.NODE_ENV === 'production' ? path.resolve('dist') : undefined,
});

app.listen(port, () => console.log(`Sealed Together API listening on http://localhost:${port}`));
