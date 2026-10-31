# Cinderfall

A full-stack browser idle RPG: Fastify + MongoDB API, React + Zustand client,
server-owned saves with offline progress, email accounts, and a Docker/Caddy
deployment. See `PLAN.md` for the design and `deploy/README.md` for production.

## Requirements

- Node 24+ (Node 26 LTS also works)
- pnpm

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build            # production SPA bundle
```

Both apps run with no external services (in-memory MongoDB):

```sh
pnpm dev              # API on :8787 + Vite on :5173
# or separately:
pnpm dev:api
pnpm --filter @cinderfall/web dev
```

Open http://localhost:5173. Vite proxies `/api` to the API, so cookies are
first-party and the `Origin` header matches `PUBLIC_ORIGIN`.

**Saves:** the server owns the save. The browser keeps a `localStorage` copy as
a fast-start/offline cache; if the server save is still pristine on first sync,
the local run is migrated once. Signing out wipes the local cache so progress
does not leak between accounts.

`GET /api/game/state` may take tens to a few hundred ms when returning after a
long absence: that is the server simulating the away period.

## Packages

| Path | Purpose |
| --- | --- |
| `packages/sim` | Pure TypeScript game simulation: data, stats, loot, combat, RNG, actions. No DOM, no framework, no I/O. |
| `packages/contracts` | Zod schemas shared by the API and the web forms (signup, login, profile, delete). |
| `apps/api` | Fastify API: guest sessions, CSRF, rate limits, Mongo repositories, health checks. |
| `apps/web` | Vite + React + Zustand client: full UI, engine bridge, guest bootstrap. |
| `deploy/` | Dockerfile, Compose + Caddy, optional Mongo overlay, backup/deploy scripts, Hostinger guide. |

`packages/sim` is consumed by both the API (offline progress) and the web client
(live play), so changes there affect both. Keep it side-effect free.

## Notes

- The simulation is deterministic given an `Rng`: `mulberry32(seed)`.
- `advance(state, seconds, rng, { autoRebirth })` is the offline path; it picks
  a coarse step for long gaps. With `autoRebirth` it keeps simulating through
  deaths so one bad run cannot waste an entire absence.
- Events are data; presentation lives in the apps.
- Dying no longer stalls the idle loop: the death screen auto-rebirths after a
  few seconds (the button still skips the wait).

## Web (M2)

- `src/game/engine.ts` owns the simulation and runs a fixed 10 Hz loop.
- `src/game/snapshot.ts` builds immutable snapshots, caching slices that only
  change on actions (inventory, stats, ranks) so ticks do not re-render the UI.
- `src/game/store.ts` (Zustand) holds the snapshot plus log/toasts/selection;
  `src/stores/auth.ts` holds the session.
- Combat effects (floating numbers, particles, shake) are emitted on an event
  bus and applied to the DOM directly, outside React.
- Styles are a single token-driven stylesheet (`src/styles/app.css`).

```sh
pnpm --filter @cinderfall/web build   # typecheck + production bundle
pnpm --filter @cinderfall/web preview
```

## Accounts (M3)

- `POST /api/auth/signup` claims the current guest when a session exists, keeping
  the same user id and save; otherwise it creates a new user + save.
- `POST /api/auth/login` verifies Argon2id and rotates the session. Logging in
  from a guest discards that guest (signup is the claim path).
- `GET/PATCH /api/me`, `GET /api/me/export`, `DELETE /api/me` (password required
  for registered users), and session listing/revocation under `/api/me/sessions`.
- `GET /api/game/state` pulls the save and advances it for the absence
  (capped by `OFFLINE_CAP_HOURS`, default 8 h), returning an `away` summary.
- `PUT /api/game/state` pushes `{ state, simClock, expectedRevision }`; a stale
  revision returns 409 with the canonical save. The client pushes every 5 s and
  flushes with `keepalive` when the tab hides.
- Email verification and password reset are live. `MAILER=console` (the dev
  default) logs links and keeps them at `GET /api/dev/mail`; `MAILER=resend`
  sends real email and requires `RESEND_API_KEY` + `MAIL_FROM`.
- `POST /api/auth/verify`, `POST /api/auth/verify/request`,
  `POST /api/auth/password/request`, `POST /api/auth/password/reset`.
  Reset revokes every session. Tokens are hashed, single-use and expire
  (24 h verify / 1 h reset).
- `GET /api/config` reports `emailEnabled`; production with the console mailer
  hides the reset/verify UI and uses a no-op mailer (tokens are never logged).
  The dev inbox is never registered in production.
- `@node-rs/argon2` ships prebuilt native binaries; the deployment image must
  target the same platform (linux-x64 glibc by default).

## Deploy (Docker / Hostinger)

One image serves the API and the built SPA; Caddy terminates TLS; MongoDB 8
runs in Compose with a dedicated app user, an internal-only network and a
persistent volume. See [`deploy/README.md`](deploy/README.md) for the Hostinger
VPS walkthrough (DNS, secrets, backups/restore, Resend, firewall).

```sh
cd deploy
cp .env.example .env
# edit DOMAIN, PUBLIC_ORIGIN, Mongo passwords, SESSION_SECRET, Resend keys
./deploy.sh
```

The production build self-hosts Pirata One and Spectral (no Google Fonts) and
enables a strict CSP. `WEB_DIST` points Fastify at `apps/web/dist`; hashed assets
and fonts are immutable, `index.html` is no-cache.

## API (M1)

| Route | Notes |
| --- | --- |
| `POST /api/auth/guest` | Creates a guest user + empty save + session cookie. Rate-limited per IP. |
| `GET /api/auth/session` | 200 with `{ user, csrf }`, or 204. |
| `POST /api/auth/logout` | Requires `x-csrf-token` when a session exists; always clears the cookie. |
| `GET /healthz` | Liveness. |
| `GET /readyz` | Mongo ping. |

Security defaults:

- Argon2id is not needed yet (no passwords until M3).
- Session cookie: `HttpOnly; SameSite=Lax; Path=/`, `__Host-` + `Secure` in production.
- Only a SHA-256 of the session token is stored; CSRF tokens are HMACs of the session id.
- Mutating requests with a foreign `Origin` are rejected; responses under `/api` are `no-store`.
- `MONGODB_URI=memory://` is rejected in production, as is a missing `SESSION_SECRET`.
