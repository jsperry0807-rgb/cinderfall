#!/bin/sh
# One-shot: create the least-privilege application user after Mongo is healthy.
# Passwords must be hex (openssl rand -hex 24).
set -eu

DB="${MONGO_INITDB_DATABASE:-cinderfall}"
APP_USER="${MONGO_APP_USER:-cinderfall}"
APP_PASS="${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"
HOST="${MONGO_HOST:-127.0.0.1}"

case "$APP_PASS" in
    *[!0-9A-Fa-f]*)
        echo "MONGO_APP_PASSWORD must be hex; run: openssl rand -hex 24" >&2
        exit 1
        ;;
esac

mongosh --quiet --host "$HOST" \
    --username "${MONGO_INITDB_ROOT_USERNAME}" \
    --password "${MONGO_INITDB_ROOT_PASSWORD}" \
    --authenticationDatabase admin \
    --eval "
        const target = db.getSiblingDB('${DB}');
        if (!target.getUser('${APP_USER}')) {
            target.createUser({
                user: '${APP_USER}',
                pwd: '${APP_PASS}',
                roles: [{ role: 'readWrite', db: '${DB}' }],
            });
        }
    "
