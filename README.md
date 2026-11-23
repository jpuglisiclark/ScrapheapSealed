# Sealed Together

Collaborative Magic: The Gathering sealed deck building.

1. **Open** a sealed pool of Star Trek (TRK) play boosters (6 packs by default) and go straight into building.
2. **Share** the pool link (the **Copy pool link** button in the builder). No accounts — each builder just enters a name.
3. **Build** asynchronously. Click cards between pool and deck, or drag them anywhere to arrange your own piles. Basic lands are added as real cards. Leave notes and submit.
4. **Compare.** The **Past Sealed Pools** tab on the home page lists every pool. Submitting unlocks everyone else's decks: archetypes, curves, color choices, a deck-overlap matrix, head-to-head diffs, and a card-by-card table of who played what (unanimous picks, split decisions, unique picks, benched rares).

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev        # API on :3001, Vite on :5173
```

Production:

```bash
npm run build
npm start          # serves API + built client on $PORT (default 3001)
```

Environment variables: `PORT`, `DB_PATH` (default `data/sealed.db`), `SET_CODE` (the one set pools are opened from, default `trk`).
If your server reaches the internet through an HTTP proxy, also set `NODE_USE_ENV_PROXY=1` so Node's `fetch` uses it.

```bash
npm test           # booster generation, analytics, API flow
npm run typecheck
```

## How it works

- `server/` — Express + SQLite. Set card lists are fetched from [Scryfall](https://scryfall.com/docs/api) and cached for 7 days.
- `shared/` — code used by both sides: booster collation (`booster.ts`), card helpers (`cards.ts`), and comparison analytics (`analytics.ts`).
- `client/` — React + Vite.

**Identity:** joining a pool returns a deck id + secret token, stored in the browser. The lobby offers a private "continue on another device" link. Editing a deck requires its token.

**No peeking:** `/api/pools/:id/results` only answers callers whose own deck in that pool is submitted. A submitted deck is locked; reopening it removes it from the comparison until it's resubmitted.

**Collation.** If `server/collations/<set>.txt` exists for the configured set, packs follow it exactly. It uses Draftmancer's custom card list format: weighted pack layouts, slots that pick a sheet by weight, and sheets of specific printings (`Name (set) collector_number`). Those printings are fetched from Scryfall and cached. TRK ships with `server/collations/trk.txt` (play boosters, primary art only, including the 1-in-25 Stardates pack). To change the odds or the card lists, edit that file and restart the server. Without a collation file the server falls back to an approximate play booster: 1 rare/mythic, 3 uncommons, 7 commons, a wildcard, a foil and a common land.

Card data and images © Wizards of the Coast, served via Scryfall. Not affiliated with Wizards of the Coast.
