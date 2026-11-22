# Sealed Together

Collaborative Magic: The Gathering sealed deck building.

1. **Open** a sealed pool from any set (play or draft boosters, 1–12 packs).
2. **Share** the link. No accounts — each builder just enters a name.
3. **Build** asynchronously. Click cards between pool and deck, set basics (or auto-fill them from your mana symbols), leave notes, and submit.
4. **Compare.** Submitting unlocks everyone else's decks: archetypes, curves, color choices, a deck-overlap matrix, head-to-head diffs, and a card-by-card table of who played what (unanimous picks, split decisions, unique picks, benched rares).

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

Environment variables: `PORT`, `DB_PATH` (default `data/sealed.db`).
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

**Collation** is an approximation. Draft boosters: 1 rare/mythic (mythic 1 in 8), 3 uncommons, 10 commons. Play boosters: 1 rare/mythic (~1 in 7 mythic), 3 uncommons, 7 commons, 1 any-rarity wildcard, 1 foil wildcard, and a common nonbasic land when the set has them. Special-guest and bonus-sheet cards aren't included.

Card data and images © Wizards of the Coast, served via Scryfall. Not affiliated with Wizards of the Coast.
