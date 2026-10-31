#!/usr/bin/env sh
# Dump the self-hosted MongoDB container. Keeps the last 7 archives.
# Put the backups somewhere off the VPS too.
set -eu
cd "$(dirname "$0")"
mkdir -p backups

stamp=$(date +%Y%m%d-%H%M%S)
docker compose exec -T mongo \
  sh -c 'mongodump --db "$MONGO_INITDB_DATABASE" --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  > "backups/cinderfall-$stamp.archive.gz"

ls -1t backups/*.archive.gz | tail -n +8 | xargs -r rm --
echo "backup written: backups/cinderfall-$stamp.archive.gz"
