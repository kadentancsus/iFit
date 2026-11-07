#!/usr/bin/env bash
# Tests the real API against real Postgres and PostgREST, using only Docker:
#
#   1. Starts a throwaway Supabase Postgres and PostgREST on a private network.
#   2. Applies every migration and the seed, and creates two test accounts.
#   3. Runs backend/tests/integration.
#
# PostgREST is published on a random loopback port for the tests. Everything is
# removed afterwards, and no configured Supabase project is ever touched.
set -euo pipefail

cd "$(dirname "$0")/.."

POSTGRES_IMAGE="${SUPABASE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.139}"
POSTGREST_IMAGE="${SUPABASE_POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.13}"
PYTHON="${PYTHON:-python}"
DATABASE="ifit-verify-api-db-$$"
REST="ifit-verify-api-rest-$$"
NETWORK="ifit-verify-api-$$"
# Throwaway credentials that exist only inside these containers.
JWT_SECRET="ifit-local-test-secret-not-used-anywhere-else"

cleanup() {
  docker rm -f "$REST" "$DATABASE" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_psql() {
  docker exec -i -e PGPASSWORD=verify "$DATABASE" \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -d postgres "$@"
}

docker network create "$NETWORK" >/dev/null
echo "Starting $POSTGRES_IMAGE"
docker run -d --rm --name "$DATABASE" --network "$NETWORK" \
  -e POSTGRES_PASSWORD=verify "$POSTGRES_IMAGE" >/dev/null

# The image restarts Postgres during first boot, so wait for a stable connection.
ready=0
for _ in $(seq 1 60); do
  if run_psql -At -c 'select 1' >/dev/null 2>&1; then
    ready=$((ready + 1))
    [ "$ready" -ge 3 ] && break
  else
    ready=0
  fi
  sleep 1
done
[ "$ready" -ge 3 ] || { echo 'Postgres did not become ready'; exit 1; }

for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  run_psql < "$migration"
done
run_psql < supabase/seed.sql
# Needs the image's superuser. authenticator is a reserved role, and the image's
# auth.uid() predates request.jwt.claims: on a real project the Auth service's
# migrations install this version, but no Auth service runs here.
docker exec -i -e PGPASSWORD=verify "$DATABASE" psql -X -q -v ON_ERROR_STOP=1 \
  -U supabase_admin -h 127.0.0.1 -d postgres <<'SQL'
alter role authenticator with password 'verify';
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
SQL
run_psql <<'SQL'
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000f001', 'alex@ifit.test'),
  ('bbbbbbbb-0000-4000-8000-00000000f001', 'bailey@ifit.test');
SQL

echo "Starting $POSTGREST_IMAGE"
docker run -d --rm --name "$REST" --network "$NETWORK" -p 127.0.0.1::3000 \
  -e PGRST_DB_URI="postgres://authenticator:verify@$DATABASE:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  "$POSTGREST_IMAGE" >/dev/null

url="http://$(docker port "$REST" 3000/tcp | head -1)"
for _ in $(seq 1 30); do
  curl -fsS "$url/exercises?limit=1" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "$url/exercises?limit=1" >/dev/null || {
  echo 'PostgREST did not become ready'
  docker logs "$REST" 2>&1 | tail -20
  exit 1
}

IFIT_TEST_POSTGREST_URL="$url" IFIT_TEST_JWT_SECRET="$JWT_SECRET" \
  "$PYTHON" -m pytest backend/tests/integration "$@"
