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
  // Serve the built web app (from `npm run build`) when it exists. During `npm run dev` the
  // site is served by Vite on port 5173 instead, so this is harmless there.
  staticDir: path.resolve('dist'),
});

app.listen(port, () => console.log(`Scrapheap Sealed API listening on http://localhost:${port}`));
