#!/bin/sh
# Create the app DB user as root, then start the API without root credentials.
set -eu

if [ -n "${MONGODB_ROOT_URI:-}" ]; then
    pnpm --filter @cinderfall/api provision
fi

unset MONGODB_ROOT_URI MONGO_INITDB_ROOT_USERNAME MONGO_INITDB_ROOT_PASSWORD \
    MONGO_APP_USER MONGO_APP_PASSWORD MONGO_DB_NAME

exec pnpm --filter @cinderfall/api start
