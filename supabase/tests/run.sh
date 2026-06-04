#!/usr/bin/env bash
# Регрессионные тесты БД (RLS/RPC) в одноразовом Postgres через Docker.
# Запуск: bash supabase/tests/run.sh   (требуется Docker)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$DIR/../migrations"
NAME=bc_test_pg

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

echo "waiting for postgres..."
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

docker cp "$DIR/_shim.sql"        "$NAME":/_shim.sql
docker cp "$MIG/."                "$NAME":/m/
docker cp "$DIR/rls_rpc.test.sql" "$NAME":/t.sql

echo "applying shim + migrations..."
docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 \
  -f /_shim.sql \
  -f /m/0001_init_schema.sql \
  -f /m/0002_functions_and_triggers.sql \
  -f /m/0003_rls.sql \
  -f /m/0004_views_stats.sql \
  -f /m/0005_phase2_routes.sql \
  -f /m/0006_invite_fixes.sql

echo "running tests..."
set +e
docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /t.sql
code=$?
set -e

if [ "$code" -eq 0 ]; then echo "✅ DB TESTS: PASS"; else echo "❌ DB TESTS: FAIL (exit $code)"; fi
exit "$code"
