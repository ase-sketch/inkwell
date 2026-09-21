#!/bin/sh
set -eu

if [ -z "${DATABASE_KIND:-}" ]; then
    if [ -n "${DATABASE_URL:-}" ]; then
        case "$DATABASE_URL" in
            file:*) DATABASE_KIND=sqlite ;;
            *) echo "DATABASE_URL must be a SQLite file: URL: $DATABASE_URL" >&2; exit 1 ;;
        esac
    else
        DATABASE_KIND=sqlite
    fi
fi

export DATABASE_KIND

if [ "$DATABASE_KIND" != "sqlite" ]; then
    echo "DATABASE_KIND must be sqlite." >&2
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="file:./workspace/.nbook/neuro-book.sqlite"
    export DATABASE_URL
fi

mkdir -p ./workspace/.nbook

if [ -z "${BUN_RUNTIME:-}" ]; then
    BUN_RUNTIME="bun"
fi

exec "$BUN_RUNTIME" --no-install --no-env-file .output/server/commands/product-command.mjs command start
