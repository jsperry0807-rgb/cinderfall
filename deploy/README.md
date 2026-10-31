# Deploying Cinderfall on a Hostinger VPS (Docker)

Three containers:

- **mongo** — MongoDB 8, internal network only, persistent volume.
- **app** — one image serving the API and the built SPA, connects as an
  unprivileged database user.
- **caddy** — automatic TLS/HTTP3, proxies everything to the app.

No Atlas account is required.

## Prerequisites

- VPS with Docker Engine and Compose v2 (2 GB RAM minimum; 4 GB comfortable).
- A domain whose A/AAAA record points at the VPS.
- Ports 80 and 443 open (Hostinger firewall / VPS firewall).
- A Resend account with a verified sending domain (for verification/reset mail).

## 1. Configure

```sh
cd deploy
cp .env.example .env
chmod 600 .env
```

Generate the secrets and paste them into `.env`:

```sh
openssl rand -hex 24       # MONGO_ROOT_PASSWORD
openssl rand -hex 24       # MONGO_APP_PASSWORD
openssl rand -base64 48    # SESSION_SECRET
```

Set `DOMAIN` and `PUBLIC_ORIGIN` (the latter must be `https://` + the same
domain), plus `RESEND_API_KEY` and `MAIL_FROM`. The app's `MONGODB_URI` is
built by Compose from `MONGO_APP_USER` / `MONGO_APP_PASSWORD`; you do not paste
it by hand.

Use **hex** passwords for Mongo: they are safe in a URI and in the init script.

## 2. Run

```sh
./deploy.sh
docker compose logs -f mongo
docker compose logs -f app
```

On the first boot `mongo-init.sh` creates the `cinderfall` app user with
`readWrite` on the `cinderfall` database. The app waits for Mongo's healthcheck
before starting, and Caddy waits for the app's healthcheck.

Check:

```sh
docker compose ps
curl https://YOUR_DOMAIN/healthz
curl https://YOUR_DOMAIN/readyz
```

Open the site, create an account and follow the verification email.

## Data and updates

The database lives in the `cinderfall_mongo_data` volume. `docker compose down`
keeps it; **`docker compose down -v` deletes it**. Back up first.

```sh
git pull
cd deploy
./deploy.sh
```

Mongo image updates:

```sh
docker compose pull mongo
docker compose up -d
```

Read the MongoDB release notes first, and take a backup before a major upgrade.

## Backups

```sh
cd deploy
./backup.sh
```

This writes `backups/cinderfall-<timestamp>.archive.gz` (last 7 kept). Archives
contain player data; copy them off the VPS and keep them access-controlled or
encrypted. Schedule it:

```cron
15 3 * * * cd /path/to/new/deploy && ./backup.sh
```

Restore:

```sh
./restore.sh backups/cinderfall-YYYYMMDD-HHMMSS.archive.gz
```

`restore.sh` uses `--drop`; it replaces the current data.

## Changing the app database password

The app user is created only on an empty data volume. If you change
`MONGO_APP_PASSWORD` later, update the user in MongoDB too, or the app will fail
to connect:

```sh
docker compose exec mongo mongosh --username root --authenticationDatabase admin
# in mongosh:
use cinderfall
db.changeUserPassword("cinderfall", "NEW_HEX_PASSWORD")
```

Use your `MONGO_ROOT_USER` if it is not `root`. Then update
`MONGO_APP_PASSWORD` in `.env` and run `docker compose up -d app`.

## Troubleshooting

- **Mongo unhealthy**: `docker compose logs mongo`. The init script runs only on
  a fresh data volume; check the log for the app-user creation.
- **App can't connect**: the app URI uses `MONGO_APP_USER`/`MONGO_APP_PASSWORD`.
  They must match the database user. Hex passwords, no URL encoding.
- **Caddy has no certificate**: DNS must point at the VPS and ports 80/443 must
  be reachable. `docker compose logs caddy`.
- **Memory**: the Mongo cache is capped at 0.5 GB in `compose.yaml`; adjust to
  roughly 25% of RAM if the VPS is larger.
- **Docker Manager**: point Hostinger's Docker UI at `deploy/compose.yaml`; the
  build context is the repository root (`..`).

## What is already handled

- TLS/HTTP3 and certificate renewal: Caddy (`caddy_data` volume).
- Mongo is not published; only Caddy is reachable from outside.
- Root credentials are used only for first-boot user creation and backups; the
  healthcheck and the app use the `readWrite` user.
- CSP, HSTS and security headers: Helmet in production.
- `__Host-` + `Secure` + `SameSite=Lax` session cookies behind Caddy.
- SPA + API on one origin, so cookies stay first-party.
- Hashed assets and fonts cached immutably; `index.html` is `no-cache`.
- Healthchecks (`/healthz`, `/readyz`), graceful shutdown, and index creation at
  boot (no migration step).
- The dev mailbox is never registered in production.

## Using Atlas instead

Self-hosted Mongo is the default. If you later switch to Atlas, remove the
`mongo` service and the app's `depends_on` from `compose.yaml`, add
`MONGODB_URI` to the app's `environment` (Atlas URI, app user, `retryWrites`),
and allowlist the VPS IP in Atlas. Keep `backup.sh` out of that path; Atlas
handles backups.
