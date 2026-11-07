#!/usr/bin/env bash
# Proves the database setup from scratch, using only Docker:
#
#   1. Starts a throwaway Supabase Postgres container with no published ports.
#   2. Applies every migration in order.
#   3. Applies the seed twice and checks that the second run changes nothing.
#   4. Runs the pgTAP suites in supabase/tests.
#
# The container is always removed afterwards and never touches a configured
# Supabase project or a local Supabase stack.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${SUPABASE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.139}"
CONTAINER="ifit-verify-db-$$"
SEEDED_TABLES="exercises exercise_alternatives routine_templates routine_template_exercises"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_psql() {
  docker exec -i -e PGPASSWORD=verify "$CONTAINER" \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -d postgres "$@"
}

seed_fingerprint() {
  for table in $SEEDED_TABLES; do
    run_psql -At -c "select '$table', count(*), md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.$table t"
  done
}

echo "Starting $IMAGE"
docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=verify "$IMAGE" >/dev/null

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

shopt -s nullglob

for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  run_psql < "$migration"
done

echo 'Applying seed'
run_psql < supabase/seed.sql
first="$(seed_fingerprint)"
run_psql < supabase/seed.sql
second="$(seed_fingerprint)"

if [ "$first" != "$second" ]; then
  echo 'Seed is not idempotent:'
  diff <(echo "$first") <(echo "$second") || true
  exit 1
fi
echo 'Seed is idempotent:'
echo "$first" | cut -d'|' -f1,2 | sed 's/^/  /'

failed=0
for suite in supabase/tests/*.sql; do
  echo "Running $suite"
  output="$(run_psql -At < "$suite" 2>&1)" || { echo "$output"; failed=1; continue; }
  passed="$(grep -c '^ok ' <<<"$output" || true)"
  planned="$(sed -n 's/^1\.\.\([0-9]*\)$/\1/p' <<<"$output" | head -1)"
  # pgTAP only prints comment lines for failures, including the database error.
  if grep -E '^not ok|^#' <<<"$output"; then
    failed=1
  fi
  if [ "$passed" != "$planned" ]; then
    echo "  planned ${planned:-?}, passed $passed"
    failed=1
  else
    echo "  $passed/$planned passed"
  fi
done

exit "$failed"
