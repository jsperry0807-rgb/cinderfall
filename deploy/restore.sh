#!/usr/bin/env sh
# Restore an archive created by backup.sh.
# Usage: ./restore.sh backups/cinderfall-YYYYMMDD-HHMMSS.archive.gz
set -eu
cd "$(dirname "$0")"
archive="${1:?usage: ./restore.sh backups/<file>.archive.gz}"
[ -f "$archive" ] || { echo "no such file: $archive" >&2; exit 1; }

docker compose exec -T mongo \
  sh -c 'mongorestore --archive --gzip --drop --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  < "$archive"
echo "restored: $archive"
