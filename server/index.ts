import path from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import fs from 'node:fs';
import { parseCollation } from '../shared/collation.ts';
import * as scryfall from './scryfall.ts';

const port = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? path.resolve('data/sealed.db'));
const setCode = process.env.SET_CODE ?? 'trk';
// An exact booster collation for the set, if one is provided in server/collations/<set>.txt.
const collationFile = path.resolve('server/collations', `${setCode}.txt`);
const collation = fs.existsSync(collationFile) ? parseCollation(fs.readFileSync(collationFile, 'utf8')) : undefined;
if (collation) console.log(`Using booster collation: ${collation.name}`);

const app = createApp({
  db,
  cards: scryfall,
  setCode,
  collation,
  staticDir: process.env.NODE_ENV === 'production' ? path.resolve('dist') : undefined,
});

app.listen(port, () => console.log(`Scrapheap Sealed API listening on http://localhost:${port}`));
