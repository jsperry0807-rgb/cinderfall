#!/bin/sh
# Creates the least-privilege application user on first boot.
# Passwords must be URL/shell-safe (use: openssl rand -hex 24).
set -eu

DB="${MONGO_INITDB_DATABASE:-cinderfall}"
APP_USER="${MONGO_APP_USER:-cinderfall}"
APP_PASS="${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"

create_user() {
    mongosh --quiet "$@" --eval "
        const target = db.getSiblingDB('${DB}');
        if (!target.getUser('${APP_USER}')) {
            target.createUser({
                user: '${APP_USER}',
                pwd: '${APP_PASS}',
                roles: [{ role: 'readWrite', db: '${DB}' }],
            });
        }
    "
}

# Depending on the image version, init scripts run with or without auth.
if create_user \
    --username "${MONGO_INITDB_ROOT_USERNAME}" \
    --password "${MONGO_INITDB_ROOT_PASSWORD}" \
    --authenticationDatabase admin 2>/dev/null; then
    exit 0
fi

create_user
