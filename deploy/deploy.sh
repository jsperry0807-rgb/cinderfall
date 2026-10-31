#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

docker compose "$@" build app
docker compose "$@" up -d --remove-orphans
docker image prune -f
