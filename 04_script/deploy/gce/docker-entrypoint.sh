#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "WARN: DATABASE_URL is empty — API will fail DB calls until set." >&2
fi

exec "$@"
