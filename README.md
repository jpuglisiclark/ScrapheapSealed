# Scrapheap Sealed

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

## Deploy

The repo includes a `Dockerfile` that builds the web app and serves everything from one Node process on port 8080.

The app keeps pools and decks in a SQLite file, so the host **must provide a persistent volume mounted at `/data`**. Without one, every redeploy or restart wipes all pools.

Settings (all have defaults in the Dockerfile):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on (most hosts set this for you) |
| `DB_PATH` | `/data/sealed.db` | Where the database lives; keep it on the volume |
| `SET_CODE` | `trk` | Set to open pools from |

The server needs outbound HTTPS to `api.scryfall.com`, and players' browsers load card images from `cards.scryfall.io`.

### Your own computer + Cloudflare Tunnel (free)

The site runs on your computer and Cloudflare gives it a public HTTPS address. No router setup is needed. It's only up while your computer is on and `npm start` is running. Pools are stored in `data/sealed.db` in the project folder.

```bash
npm install
npm run build
npm start
```

That serves the whole site at http://localhost:3001. In a second terminal, install `cloudflared` (Windows: `winget install --id Cloudflare.cloudflared`), then either:

- **Quick tunnel (no account):** run `cloudflared tunnel --url http://localhost:3001` and share the `https://….trycloudflare.com` address it prints. The address changes every time you restart it, which breaks old pool links and makes players lose track of their decks, so this is best for trying things out.
- **Named tunnel (permanent address, needs a domain on Cloudflare):** in the Cloudflare dashboard go to Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared). Run the `cloudflared service install …` command it shows; that installs it as a Windows service that starts with your computer. Then add a public hostname (e.g. `sealed.yourdomain.com`) pointing to `http://localhost:3001`.

 (connects to this GitHub repo, redeploys on every push)

1. In Railway, create a **New Project → Deploy from GitHub repo** and pick this repo. Railway builds the `Dockerfile` automatically.
2. Open the service, then **Volumes → New Volume**, mounted at `/data`.
3. Under **Settings → Networking**, click **Generate Domain** to get a public URL.

### Fly.io

```bash
fly launch --no-deploy
fly volumes create data --size 1
```

Add this to the generated `fly.toml`, then run `fly deploy`:

```toml
[mounts]
  source = "data"
  destination = "/data"
```

Keep the app on a single machine: SQLite lives on one volume and can't be shared between machines.



- `server/` — Express + SQLite. Set card lists are fetched from [Scryfall](https://scryfall.com/docs/api) and cached for 7 days.
- `shared/` — code used by both sides: booster collation (`booster.ts`), card helpers (`cards.ts`), and comparison analytics (`analytics.ts`).
- `client/` — React + Vite.

**Identity:** joining a pool returns a deck id + secret token, stored in the browser. The lobby offers a private "continue on another device" link. Editing a deck requires its token.

**No peeking:** `/api/pools/:id/results` only answers callers whose own deck in that pool is submitted. A submitted deck is locked; reopening it removes it from the comparison until it's resubmitted.

**Collation.** If `server/collations/<set>.txt` exists for the configured set, packs follow it exactly. It uses Draftmancer's custom card list format: weighted pack layouts, slots that pick a sheet by weight, and sheets of specific printings (`Name (set) collector_number`). Those printings are fetched from Scryfall and cached. TRK ships with `server/collations/trk.txt` (play boosters, primary art only, including the 1-in-25 Stardates pack). To change the odds or the card lists, edit that file and restart the server. Without a collation file the server falls back to an approximate play booster: 1 rare/mythic, 3 uncommons, 7 commons, a wildcard, a foil and a common land.

Card data and images © Wizards of the Coast, served via Scryfall. Not affiliated with Wizards of the Coast.
