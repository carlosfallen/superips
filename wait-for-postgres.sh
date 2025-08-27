#!/bin/sh
set -e

host="$1"
port="$2"
shift 2
until pg_isready -h "$host" -p "$port" -U "$DB_USER" -d "$DB_NAME"; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 2
done

>&2 echo "Postgres is up - executing command"
exec "$@"
