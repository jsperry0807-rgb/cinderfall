# Cinderfall — Full-stack Plan (v2)

Status: implemented. The repository root is the application.
The original static build was retired after the M0 extraction and lives outside
this repo.

---

## 0. Decisions recorded

| Question | Answer |
| --- | --- |
| Where to build | Repository root; the legacy build is retired |
| V1 features | Accounts + sessions, cloud saves, email verification + password reset, account export + deletion |
| Leaderboard | **None** in v1 |
| Backend | TypeScript, Fastify, MongoDB |
| Sign-in | Email + password (Google OAuth deferred) |
| Client | Vite + React, full rewrite, Zustand |
| Visual design | Free to redesign |
| Live simulation | **Hybrid** (recommended): client simulates while open, server computes the away period |
| Offline progress | Server-computed |
| Guest play | Guest first, claim account later |
| Email delivery | Dev mailer now (console), provider pluggable later |
| Legacy saves | No import; everyone starts fresh |
| Monetisation | None |
| Hosting | **Hostinger VPS + Docker Compose + Caddy** |
| Domain / server | Hostinger VPS; point the domain at it |
| MongoDB | **Self-hosted MongoDB 8 in Docker** (Atlas optional; dev/tests in-memory) |
| Scale | Unknown; keep horizontally scalable, run one instance |

**Unresolved:** production credentials (domain/DNS, Mongo passwords, Resend key).

### Progress

| Phase | Status | Notes |
| --- | --- | --- |
| M0 Workspace + sim | **Done (2026-10-30)** | `packages/sim` extracted, 22 tests passing |
| M1 API + guests | **Done (2026-10-30)** | 35 tests passing |
| M2 React shell | **Done (2026-10-30)** | 56 tests passing; browser-verified |
| M3 Accounts | **Done (2026-10-30)** | 75 tests; browser-verified |
| M4 Sync + offline | **Done (2026-10-30)** | 94 tests; browser-verified |
| M5 Email + polish | **Done (2026-10-30)** | 108 tests; browser-verified |
| M6 Production | **Done (2026-10-30)** | Hostinger Docker + Caddy; 106 tests |

Counts are the suite size at each milestone. The M0 parity harness was retired
with the legacy build; the current suite is **106 tests**.

M6 delivered (Hostinger/Docker path):

- Multi-stage `deploy/Dockerfile`: builds the SPA, serves it from Fastify
  (`WEB_DIST`), runs as the `node` user, with a container healthcheck.
- `deploy/compose.yaml`: app + Caddy, health-gated start, persistent Caddy
  data/config volumes; Caddy handles TLS/HTTP3 and proxies to the app.
- Self-hosted Pirata One + Spectral woff2 fonts (no Google Fonts); production
  enables a strict CSP (`script-src 'self'`, `font-src 'self'`, inline styles
  allowed for React) via Helmet.
- Hashed assets/fonts cached immutably, `index.html` no-cache, SPA fallback for
  client routes, JSON 404s under `/api`, `/healthz` + `/readyz`.
- Self-hosted MongoDB 8 in Compose (default), internal network only, persistent
  volumes, root/app user separation, entrypoint provisioning, healthcheck, and a
  `backup.sh` / `restore.sh` pair (7-day rotation). Atlas is an optional
  external alternative.
- `deploy/deploy.sh`, `deploy/.env.example`, and `deploy/README.md` with DNS,
  secrets, backups/restore, Resend, Hostinger firewall and update steps.
- No migrations: `ensureIndexes` runs at boot.
- Tests: 3 static-serving/CSP tests (108 → 111); a production-mode smoke served
  the built SPA, fonts, CSP and readiness endpoint.
- Deferred: CI/CD automation and Prometheus metrics (optional at this scale).

M5 delivered:

- Mailer abstraction: `console` (dev inbox + log) and `resend` (HTTP API,
  requires `RESEND_API_KEY` + `MAIL_FROM`). Production with the console mailer
  uses a no-op mailer, so tokens are never written to production logs.
- One-time, hashed tokens (`tokens` collection, TTL index): 24 h verification,
  1 h reset, single use, newest link invalidates the previous one.
- `POST /api/auth/verify`, `POST /api/auth/verify/request` (auth + CSRF),
  `POST /api/auth/password/request` (always 200, no enumeration),
  `POST /api/auth/password/reset` (revokes all sessions, common-password check).
- Signup sends a verification email; the account page can resend it when email
  delivery is configured.
- `GET /api/config` exposes `emailEnabled`; in production with the console
  mailer the reset/verify UI is hidden. `GET /api/dev/mail` exists only outside
  production and only with the console mailer.
- Client: `/forgot`, `/reset?token=...`, `/verify?token=...`, a forgot link on
  login, resend button on the account page, and success/error states.
- Tests: 7 email API tests + 7 email UI tests (94 → 108). Browser: signup →
  inbox → verify → resend gone; forgot → inbox → reset → login with the new
  password, no console errors.

M4 delivered:

- `GET /api/game/state`: loads the save, advances it for the absence
  (`advance` + `offlineStep`, capped by `OFFLINE_CAP_HOURS`, default 8 h),
  persists the result with a revision bump, and returns an `away` summary.
  Gaps under 30 s do not trigger catch-up.
- `PUT /api/game/state`: CSRF-protected push with `expectedRevision`, monotonic
  clock checks (`clock_behind` → 409, `clock_ahead` → 400) and `normalizeState`
  as the trust boundary (items, affixes, ranks, hp, sizes).
- Client `stores/sync.ts`: pulls on boot (migrating a local preview if the
  server save is pristine), pushes every 5 s, adopts the canonical state on
  409, flushes with `keepalive` on hide/unload, and pauses while hidden.
- Away modal with stages/kills/levels/drops/gold/shards and a death notice;
  top-bar sync pill (`Saved` / `Saving…` / `Offline` / `Synced`).
- `normalizeState` hardened: drops malformed items/affixes, dedupes ids, caps
  the bag, clamps ranks to node maxima, repairs fresh hp, advances `nid`.
- Tests: 10 game API tests + 4 sync UI tests (90 → 94); browser verified a
  cache wipe restoring the run from the server and a second device pulling the
  same save.
- Fixed: fresh server saves had `hp: 0`, so offline catch-up killed the player
  before earning anything. Saves now start from `createGame` (full hp + enemy),
  and normalisation revives a non-dead save with 0 hp.

M3 delivered:

- `packages/contracts` with shared Zod schemas for signup, login, profile and
  deletion.
- Argon2id passwords (`@node-rs/argon2`, OWASP baseline), a timing-equalising
  dummy verify for unknown emails, and a common-password denylist.
- `POST /api/auth/signup` claims the current guest **in place**: same user id,
  same save, `isGuest` flipped, old session revoked, new session issued.
- `POST /api/auth/login` rotates the session and discards a guest session after
  successful credentials (signup is the path that keeps the run).
- `GET/PATCH /api/me`, `GET /api/me/export` (JSON attachment, no secrets),
  `DELETE /api/me` (password required for registered users, guest allowed),
  `GET /api/me/sessions`, revoke one / revoke others.
- Client: `/signup`, `/login`, account page with profile editing, session list,
  export download, two-step delete, guest CTA. `@cinderfall/contracts` validates
  forms client-side.
- Tests: 13 account API tests (69 → 75 total) and 6 account UI tests.
- Browser: guest → signup keeps level/gold → export downloads → logout → login
  → delete → fresh guest.

M2 delivered:

- `apps/web`: Vite + React 19 + React Router + Zustand, full UI rewrite.
  Top bar, hero/equipment/stat sheet, arena, skills, combat log, all four side
  tabs, item comparison, death modal, toasts, boss warning, account page.
- Engine bridge: singleton owns `SimState`, fixed 10 Hz loop, publishes cached
  immutable snapshots; FX (floating numbers, bursts, shake) bypass React.
- `apply()` in the sim now covers purchases, equip/sell/reroll/equip-best and
  auto-sell, so the UI has no duplicated rules.
- Guest-first boot: session lookup, automatic guest creation, offline fallback,
  sign-out resets the local preview save.
- Local `localStorage` cache as a fast-start/offline fallback; the server save is
  canonical and the local run is migrated once if the server is pristine.
- Tests: 7 jsdom UI tests (56 total). Browser-verified with Playwright:
  strike → level-up → autosave → reload → account → logout → fresh guest.

M1 delivered:

- Fastify factory (`buildServer`) with `inject`-friendly tests, Zod env
  validation, pino redaction, Helmet, global + per-route rate limits.
- MongoDB client, idempotent `ensureIndexes`, in-memory Mongo for dev/test.
- Guest accounts: `POST /api/auth/guest` creates user + save + session.
- Sessions: hashed tokens, `__Host-` cookie in production, sliding + absolute
  expiry, CSRF via HMAC, origin guard.
- `GET /api/auth/session`, `POST /api/auth/logout`, `/healthz`, `/readyz`.
- 11 API integration tests against `mongodb-memory-server` (35 total).

M0 delivered:

- pnpm workspace, strict TS base config, Vitest, `@cinderfall/sim`.
- Typed ports of `data/*`, `state`, `format`, `stats`, `loot`, `combat`.
- `mulberry32`/`hashSeed` RNG, `createGame`, `tick`, `advance`, `offlineStep`.
- Events instead of UI calls (`hit`, `kill`, `drop`, `levelup`, `death`, ...).
- Tests: 24 h invariant replay, determinism, offline step selection, death/
  rebirth, normalisation, affix rolls, and **formula parity against the original
  static build during extraction** (the harness was retired with it).

Deliberate behaviour changes:

- `rollAffixes` no longer caps at three prefixes/suffixes. The old cap made any
  Mythic+ drop (7+ affixes) spin forever — a latent freeze in the original build,
  now fixed.
- The enemy attack timer carries its remainder (`t -= spd`) so coarse offline
  steps do not silently reduce enemy DPS. At 0.1 s steps this is imperceptible.
- `die()` clamps HP to 0, and `dead` is persisted. Offline catch-up passes
  `autoRebirth` so an absence resumes after each death instead of stopping on
  the first one.

Not in M0: `apply(state, action)` (purchases/equip/sell), save validation with
Zod, and wiring the original build to the package. The legacy build is retired.

---

## 1. Shape of the product

- The game is playable **immediately** as a guest. An anonymous account and save are
  created on first load; a banner offers to claim the account with an email.
- The save lives **on the server** and is playable from any device.
- While the tab is open, the client runs the simulation (no per-click latency).
- While the tab is closed, the **server** advances the save using the same
  simulation package, capped at 8 hours, and returns a "while you were away"
  summary.
- There is no leaderboard, so saves are user-owned and cheatability is accepted
  by design. Server-side validation protects against corruption and abuse, not
  against a player editing their own progress.

Why hybrid instead of full server authority: a clicker needs an immediate response
to a click; a round trip per strike is a product regression. Because the shared
simulation package is required for server-side offline progress anyway, switching
to full authority later is a protocol change (`engine.mode`), not a rewrite.

---

## 2. Architecture

```
                       ┌────────────────────────────────┐
 browser ──HTTPS──────▶│ Caddy (TLS, HSTS, CSP, gzip)   │
                       └───────────────┬────────────────┘
                                       │
                       ┌───────────────▼────────────────┐
                       │ Fastify (Node 24 LTS, TS)      │
                       │  /api/auth/*  /api/game/*      │
                       │  /api/me/*    static SPA dist  │
                       └──────┬────────────────┬────────┘
                              │                │
                   ┌──────────▼─────┐   ┌──────▼─────────────┐
                   │ MongoDB 8      │   │ packages/sim       │
                   │ (or in-memory) │   │ pure TS simulation │
                   └────────────────┘   └────────────────────┘
```

Rules:

1. **One simulation, two consumers.** `packages/sim` has no React, DOM, `fetch`,
   or Mongo. The web client uses it live; the API uses it for offline catch-up.
2. **One deployable.** Fastify serves the built SPA and the API on the same
   origin, so session cookies are first-party and no CORS is needed.
3. **The store is not the simulation.** Zustand holds the snapshot components
   render; the engine owns the mutable simulation state and publishes to the
   store. This keeps 10 Hz ticks out of React's reconciliation path.

### Monorepo layout

```
.
├── package.json                  # pnpm workspaces + scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── server.ts         # Fastify factory (testable, no listen)
│   │   │   ├── main.ts           # listen + graceful shutdown
│   │   │   ├── env.ts            # Zod-validated env
│   │   │   ├── db/               # mongo client, indexes, repositories
│   │   │   ├── auth/             # routes, sessions, passwords, tokens, mailer
│   │   │   ├── game/             # state routes, offline progression service
│   │   │   ├── account/          # me, export, delete
│   │   │   └── lib/              # errors, logger, rate-limit, csrf
│   │   └── test/
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── app/              # router, providers, layouts
│           ├── pages/            # Play, Login, Signup, Forgot, Reset, Verify, Account
│           ├── game/             # engine, store, selectors, events
│           ├── components/       # arena/, hero/, sidebar/, modals/, ui/
│           ├── lib/              # api client, sync, formatting
│           └── styles/           # tokens + CSS modules
├── packages/
│   ├── sim/                      # pure simulation + data
│   └── contracts/                # Zod schemas + API types
├── deploy/                       # Dockerfile, compose, Caddyfile, backup
└── docs/
```

---

## 3. Simulation package

Extract from the original static build (mechanical, with two behavioural changes):

| From | To | Change |
| --- | --- | --- |
| `js/data/*` | `sim/src/data/*` | none |
| `js/core/format.js` | `sim/src/format.ts` | drop the `S` import; pass state |
| `js/core/stats.js` | `sim/src/stats.ts` | `calc(state)`, `rollCrit(rng)` |
| `js/game/loot.js` | `sim/src/loot.ts` | inject `rng`, return events |
| `js/game/combat.js` | `sim/src/combat.ts` | inject `rng`, return events, no DOM |

New public API:

```ts
export function createState(seed: number): SimState;          // fresh save
export function calc(state: SimState): Stats;                 // derived
export function tick(state: SimState, dt: number, rng: Rng): SimEvent[];
export function advance(state: SimState, seconds: number, rng: Rng): SimEvent[];
export function apply(state: SimState, action: Action, rng: Rng): SimEvent[];
```

- `Rng` is `() => number`; `mulberry32` seeded from `(userId, simClock)` on the
  server and from `crypto.getRandomValues` on the client.
- `SimEvent` replaces every UI call: `hit`, `kill`, `drop`, `levelup`, `death`,
  `milestone`, `skill`, `warn`.
- `dt` must be a parameter (today `logicTick` hardcodes `LOGIC_DT = 0.1`).

Offline catch-up runs `advance` at a coarse step:

| Gap | Step | Max steps |
| --- | --- | --- |
| ≤ 15 min | 0.1 s | 9,000 |
| ≤ 2 h | 0.5 s | 14,400 |
| > 2 h (cap 8 h) | 1 s | 28,800 |

Catch-up simulates through deaths with `autoRebirth`: each death is recovered
and the remaining absence still counts. The summary reports the death count and
the progress made across runs. The result is cached immediately
(`lastSimAt = now`) so the cost is paid once per absence.

**Exit criteria:** a deterministic 24 h replay test passes invariants
(`0 ≤ hp ≤ maxHp`, gold/xp/shards finite and non-negative, stage monotonic,
unique item ids, inventory ≤ 30), and the same seed produces the same event
stream.

---

## 4. Data model (MongoDB)

Four collections; no Mongoose, official `mongodb` driver only.

```ts
// users
{
  _id: string,          // UUIDv7, app-generated
  email: string | null,            // null for guests
  emailLower: string | null,       // unique sparse index
  passwordHash: string | null,     // null for guests
  displayName: string,
  isGuest: boolean,
  emailVerifiedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
  lastSeenAt: Date,
}

// sessions
{
  _id: string,          // UUIDv7, app-generated
  userId: string,
  tokenHash: Buffer,               // sha256 of the cookie token; never the token
  createdAt: Date,
  lastUsedAt: Date,
  expiresAt: Date,                 // TTL index (sliding)
  absoluteExpiresAt: Date,         // hard cap
  ip: string | null,
  userAgent: string | null,
}

// saves  (_id === userId)
{
  _id: string,          // UUIDv7, app-generated
  schemaVersion: 1,
  state: SimState,                 // the old G object, validated with Zod
  simClock: number,                // seconds of simulated game time
  lastSimAt: Date,                 // wall clock of the last simulation
  revision: number,                // optimistic concurrency
  updatedAt: Date,
}

// tokens  (email verification / password reset)
{
  _id: string,          // UUIDv7, app-generated
  userId: string,
  purpose: "verify" | "reset",
  tokenHash: Buffer,
  expiresAt: Date,                 // TTL index (sliding)
  absoluteExpiresAt: Date,         // hard cap
  usedAt: Date | null,
}
```

Indexes created idempotently at boot (or a `db:indexes` script):

- `users.emailLower` unique, partial on `{ emailLower: { $type: "string" } }`
- `users.displayNameLower` unique (civil check, see below)
- `users { isGuest: 1, lastSeenAt: 1 }` for guest cleanup
- `sessions.tokenHash` unique, `sessions.userId`, TTL on `expiresAt`
- `tokens.tokenHash` unique, TTL on `expiresAt`

Notes:

- Emails are stored lowercased in `emailLower`; the original casing is kept for
  display. Avoids depending on `citext` (which Mongo doesn't have anyway).
- `displayName` uniqueness is a product decision; if collisions are acceptable,
  drop the index and append `#1234` on signup.
- Guest purge: delete users with `isGuest && lastSeenAt < now - 30d`, cascading to
  saves/sessions/tokens.
- Save writes are single-document `findOneAndUpdate` with
  `{ _id, revision: expected }`; no transactions needed.

---

## 5. Auth

### Sessions

- 32 random bytes → base64url cookie value; store only `sha256(token)`.
- Cookie: `__Host-cf_session` when `COOKIE_SECURE=true`, otherwise `cf_session`
  (the `__Host-` prefix requires `Secure`, which browsers reject over plain
  `http://localhost`).
  Flags: `HttpOnly; Secure (prod); SameSite=Lax; Path=/`.
- TTL: 30-day sliding (refresh `expiresAt` at most once per day), 90-day absolute.
- Rotate the token on login, signup/claim, password change; revoke all other
  sessions on password reset.
- TTL index handles expiry; `used_at`/`last_used_at` let the UI list and revoke
  sessions later.

### Passwords

- Argon2id via `@node-rs/argon2`: `m=19456 KiB, t=2, p=1` (OWASP baseline).
- Min 10 chars, max 128; reject the top-1k common passwords (small bundled list).
- Generic errors everywhere; constant-time token comparison via `crypto.timingSafeEqual`.

### Guest accounts

- `POST /api/auth/guest` creates `{ isGuest: true, displayName: "Wanderer-<4>" }`
  and a session, plus an empty save. Rate-limited per IP (e.g. 10/day).
- Claim: `POST /api/auth/signup` while holding a guest session **upgrades the same
  user row** (email, password, `isGuest: false`, `emailVerifiedAt: null`), keeping
  the save, then rotates the session.
- If the email is taken: `409`; the UI offers "log in instead", which discards the
  guest save after an explicit confirmation.
- Cleanup job deletes inactive guests after 30 days.

### Email flows (dev mailer now)

`Mailer` interface with two implementations:

- `console` (default): writes the verification/reset link to the API log. Local
  dev and tests use this.
- `resend`: enabled by `MAILER=resend` + `RESEND_API_KEY` + `MAIL_FROM`.

Behaviour:

- Verification is **not** required to play or to use any v1 feature (no
  leaderboard). It is a badge + an "verify email" action in account settings.
- Password reset: the "forgot password" link is shown only when the mailer is not
  `console` in production. With no provider, users can change their password while
  signed in; account recovery is manual.
- Tokens: 32 random bytes, hashed at rest, single use, 1 h expiry (reset) / 24 h
  (verify). Both endpoints return 200 regardless of whether the account exists.

### CSRF / origin

- `SameSite=Lax` + an `Origin`/`Host` check on every mutating request.
- `GET /api/auth/session` also returns a CSRF token for a double-submit header on
  mutations (defence in depth; cheap).

---

## 6. API

All JSON. Errors: `{ error: { code, message, details? } }`. Validation with Zod in
`packages/contracts`, shared by client and server.

```
POST   /api/auth/guest              -> { user, csrf }
POST   /api/auth/signup             { email, password, displayName }   (claims guest if present)
POST   /api/auth/login              { email, password }
POST   /api/auth/logout
GET    /api/auth/session            -> { user, csrf } | 204
POST   /api/auth/verify             { token }
POST   /api/auth/password/request   { email }
POST   /api/auth/password/reset     { token, password }

GET    /api/game/state              -> { state, stats, away, revision, simClock }
PUT    /api/game/state              { state, simClock, expectedRevision }
                                    -> { revision, updatedAt } | 409 { state, revision }

GET    /api/me                      -> profile
PATCH  /api/me                      { displayName }
GET    /api/me/export               -> attachment (profile + save)
DELETE /api/me                      { password } (guests: no password)
```

`away` is `null` for short gaps, otherwise
`{ seconds, stages, kills, gold, xp, levels, drops, died }`.

Server-side rules:

- `PUT /api/game/state` validates shape, bounds and size (≤ 64 KB), clamps
  numeric fields, and rejects unknown top-level keys.
- `expectedRevision` mismatch → `409` with the canonical save; the client adopts
  it (rare: two tabs, or a sync race).
- `GET` catches the save up, persists it, and returns the summary. A read after a
  gap is therefore a write; it is rate-limited per player.
- `PATCH /api/me` re-validates display names: 3–20 chars, letters/digits/spaces/
  `_-`, no HTML, unique (or `#1234` suffix if we choose non-unique).
- Export includes `schemaVersion`, profile, save and `simClock`; no sessions.
- Delete removes sessions, tokens, save and the user; it does not wait for
  backups to age out (document the retention window).

---

## 7. Client (React + Zustand)

### Routes

```
/            Play (guest session auto-created if needed)
/login       Sign in (discards guest save after confirmation)
/signup      Claim guest, or create a fresh account
/forgot      Request reset (hidden without a mailer)
/reset       Consume reset token
/verify      Consume verification token
/account     Profile, sessions, export, delete
```

### Separation of concerns

```
packages/sim ──▶ GameEngine (mutable state, rAF, 10 Hz ticks)
                     │  publishes snapshots + discrete events
                     ▼
                useGameStore (Zustand)  ──▶ components (selectors)
                     ▲
                     └── actions: strike, cast, buy, equip, sell, reroll…
```

- **Engine** (`game/engine.ts`): owns the `SimState`, runs the fixed-step loop,
  applies actions, collects `SimEvent[]`. It is a singleton created on the Play
  page and stopped on unmount.
- **Zustand stores**:
  - `useGameStore`: snapshot (state/stats/enemy/inventory), log, toasts,
    selection, active tab.
  - `useAuth`: `user`, `csrf`, status, logout.
  - `useSync`: revision, last-saved time, sync status and the away summary;
    drives the top-bar pill and the offline modal.
- Snapshot publishing is throttled to 10 Hz; selectors keep re-renders small
  (`useGameStore(s => s.enemy.hp)`, `useShallow` for grouped fields).
- **Floating numbers and particles never go through React state.** The engine
  emits hit/kill events to an `FxLayer` that appends DOM nodes with refs and
  removes them on `animationend` (the old `float`/`burst` logic, reused).
- The log keeps the last 6 entries; toasts are transient and capped.

### Components

```
app/
  AppLayout          header + 3-column main + mobile tabs
  TopBar             level, XP bar, shards, gold, sync indicator, guest banner
pages/
  PlayPage           engine boot, offline summary modal, death modal
  LoginPage / SignupPage / ForgotPage / ResetPage / VerifyPage / AccountPage
components/
  arena/  Arena, EnemyCard, PowerBar, SkillBar, CombatLog, Tips, FxLayer, BossWarning
  hero/   HeroPanel, EquipmentGrid, SlotButton, StatSheet
  side/   SidePanel, GearTab, BagGrid, ItemCard, AutoSellRow, SkillsTab, NodeButton,
          ForgeTab, ForgeRow, SoulsTab, SoulRow
  modals/ DeathModal, OfflineModal, ConfirmModal, AccountModal
  ui/     Button, Bar, Panel, Tabs, Tooltip, Toaster
```

Visual direction (free to redesign): the ember/soul palette and display serif are
kept, rebuilt as a token-driven design system. The Tailwind CDN is gone. M2 uses
one semantic global stylesheet (`src/styles/app.css`, ~1.1k lines); split it into
CSS Modules if the component count grows.

### Sync

- `useSaveSync`: marks the store dirty on tick/action, debounces a `PUT` (5 s),
  and forces a flush on `visibilitychange → hidden` and `pagehide`
  (`fetch(..., { keepalive: true })`).
- On boot: `GET /api/game/state`; hydrate engine; if `away` is present, show the
  offline summary modal.
- On `409`: replace local state with the canonical save and show a small "save
  updated elsewhere" toast.
- Sync indicator in the top bar: `saved 3s ago` / `saving…` / `offline`.
- If the network fails, keep playing and retry with backoff; the save is
  reconciled on the next successful `PUT` (last write wins).

### Guest UX

- First visit: `POST /api/auth/guest` → play immediately.
- Persistent, dismissible banner: "Playing as a guest — create an account to keep
  this save."
- Signup from guest claims the save in place; no progress is lost.
- Login while a guest: confirm "Your guest progress will be discarded" before
  switching.

---

## 8. Production

Delivered for Hostinger + Docker Compose; the artefacts stay portable.

- **Image:** multi-stage `node:24-alpine` → `node:24-slim`, non-root, `tini`,
  `NODE_ENV=production`. One image runs the API and serves `apps/web/dist`.
- **Compose (delivered):** `caddy` (TLS/HTTP3) → `app` (API + SPA) → `mongo`
  (internal, persistent volumes). Only Caddy is published; the app uses an
  unprivileged database user.
- **Env:** `MONGODB_URI`, `PUBLIC_ORIGIN`, `PORT`, `COOKIE_SECURE`, `MAILER`,
  `RESEND_API_KEY`, `MAIL_FROM`, `LOG_LEVEL`, `OFFLINE_CAP_HOURS`.
  Validated by Zod at boot; missing required values fail fast.
- **Migrations:** none (MongoDB). `ensureIndexes()` runs idempotently before
  listen, or as a one-shot `db:indexes` step in the deploy script.
- **Health:** `/healthz` (process) and `/readyz` (`ping` + index check);
  `/metrics` (prom-client) for request latency, offline catch-up duration, save
  conflicts, guest signups.
- **Logs:** pino JSON with request id and user id (never email/password).
  Redact the `Authorization`/`Cookie` headers.
- **Backups:** `backup.sh` dumps the Mongo container (7-day rotation); copy the
  archives off the VPS and restore with `restore.sh`. Atlas, if used, handles
  its own backups.
- **Deploy (delivered):** `deploy/` contains the Dockerfile, Compose + Caddy,
  deploy/backup scripts and a Hostinger walkthrough. CI automation is optional
  and deferred.
- **Front end:** hashed assets, self-hosted fonts, strict CSP
  (`default-src 'self'`; no third-party scripts). This removes both the Tailwind
  CDN and Google Fonts.
- **Scale:** stateless API + sessions in Mongo → add instances behind Caddy when
  needed. Rate limits move to Redis only if multiple instances.

---

## 9. Security checklist

- [ ] Argon2id parameters pinned; hashes never logged.
- [ ] Session tokens hashed at rest; rotation on auth events; revoke-all on reset.
- [ ] `SameSite=Lax`, `Origin` check, CSRF header on mutations.
- [ ] Rate limits: guest creation, login, signup, reset, `GET /api/game/state`,
      `PUT /api/game/state`.
- [ ] Zod validation on every input; save size and depth limits; no prototype
      pollution (`Object.create(null)` for maps when parsing).
- [ ] **No `dangerouslySetInnerHTML`** in React; display names and item names as
      text. The old build's `innerHTML` paths are a known XSS hazard and must not
      survive the rewrite.
- [ ] CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
      `Permissions-Policy`, `frame-ancestors 'none'`.
- [ ] Secrets from env only; `.env` gitignored; `.env.example` documents keys.
- [ ] Account export/delete; privacy policy placeholder; minimal analytics.
- [ ] Guest purge job; session TTL; token TTL.
- [ ] Dependency audit + image scan in CI.

---

## 10. Testing

- **sim:** Vitest; property/invariant tests; deterministic seeded replay;
  24 h snapshot; offline step-size consistency (0.1 s vs 1 s within tolerance).
- **api:** Vitest + `fastify.inject()` + `mongodb-memory-server`; auth flows,
  guest claim, session rotation, CSRF/origin rejection, rate limits, save
  validation, revision conflict, offline summary, export/delete.
- **web:** React Testing Library for components and store; engine tests with a
  fake clock; sync tests with a mocked `fetch`.
- **e2e:** Playwright against `pnpm preview` + in-memory Mongo (CI only; this
  machine lacks Playwright's system libs — `libnspr4` is missing).
- **CI:** typecheck, lint, unit, API integration, web build, image scan on PR;
  deploy staging on `main`; production on tag with approval.

Local development without Docker or a cluster:

- `mongodb-memory-server` for `pnpm dev` and tests (downloads a `mongod` binary
  on first run; needs network).
- `MONGODB_URI` points at the Compose Mongo container in production (or an external cluster).
- Vite dev server proxies `/api` to Fastify, so cookies stay first-party.

---

## 11. Roadmap

Estimates are solo working days and assume the React rewrite proceeds page by page.

| Phase | Deliverable | Exit criteria | Est. |
| --- | --- | --- | --- |
| **M0** Workspace + sim | ✅ pnpm workspace, TS config, `packages/sim` extracted, RNG/events, 24 h replay (+ extraction parity) | sim tests green; formulas matched the original build | **done** |
| **M1** API + guests | Fastify factory, env, Mongo (in-memory dev), indexes, guest sessions, rate limits, `/healthz` | guest cookie round-trip; API integration tests green | 3–4 d |
| **M2** React shell | ✅ Vite + React + router + stores + design tokens; Play page, all panels, engine bridge | playable in React with local state; 56 tests | **done** |
| **M3** Accounts | ✅ signup/claim, login/logout, sessions, role-free profile, export/delete | guest → account keeps save; delete purges data; 75 tests | **done** |
| **M4** Sync + offline | ✅ `GET/PUT /api/game/state`, revisions, server catch-up, away summary, sync pill | cache wipe restores from server; 2 devices agree; 94 tests | **done** |
| **M5** Email + polish | ✅ console/Resend mailer, verify/reset/resend, dev inbox, client pages | full loop browser-verified; 108 tests | **done** |
| **M6** Production | ✅ Dockerfile, Compose + Caddy, SPA from Fastify, CSP, self-hosted fonts, backups, Hostinger guide | image/compose ready; production smoke; 106 tests | **done** |

Total ≈ **23–31 working days**. The playable React build lands at M2 (~week 2);
accounts at M3; the "real product" milestone is M4.

If the schedule needs compressing, the cheapest cuts are: defer email flows (M5),
start with a single desktop layout, and skip the offline summary modal (still
compute the catch-up, just show the new state).

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Full React rewrite takes longer than the sim work | Port against the retired build (kept outside the repo) as the visual reference; reuse CSS tokens and keyframes. |
| Sim drift between client and server | One package, one test suite; assert live vs offline step-size equivalence. |
| 10 Hz ticks cause React re-render storms | Engine publishes snapshots; fine-grained selectors; FX bypass React entirely. |
| Offline catch-up CPU | Coarse steps, 8 h cap, cache `lastSimAt`, metric the duration. |
| Guest abuse / storage growth | Per-IP guest creation limit, 30-day purge, no leaderboard to game. |
| No email provider in production | Reset UI hidden unless a mailer is configured; document the limitation. |
| No local Docker/Mongo | `mongodb-memory-server` for tests; production runs the Compose Mongo container. |
| Save corruption from a bad client | Zod + bounds + size limit; keep the last good revision in the audit log. |

---

## 13. Open items

1. **Production credentials** — domain/DNS, Mongo root/app passwords and the
   Resend key live in `deploy/.env` (see `deploy/README.md`).
2. **Display names** — free-form (implemented; no uniqueness index).
3. **Retention window** for deleted accounts in backups (default: document 30 days).
