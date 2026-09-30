#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container_name="quicksige-contacts-migration-$$"

cleanup() {
  docker stop "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach --name "${container_name}" \
  --env POSTGRES_PASSWORD=quicksige-test \
  --volume "${repository_root}:/workspace:ro" \
  postgres:17-alpine >/dev/null

for _ in {1..30}; do
  if docker exec "${container_name}" pg_isready --username postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "${container_name}" pg_isready --username postgres >/dev/null

apply_sql() {
  local database_name="$1"
  local sql_path="$2"
  docker exec "${container_name}" psql --username postgres --dbname "${database_name}" --set ON_ERROR_STOP=1 --file "/workspace/${sql_path}"
}

# Empty-database application validates every forward migration without fixture assumptions.
apply_sql postgres supabase/tests/bootstrap.sql
apply_sql postgres supabase/migrations/202609260001_initial_schema.sql
apply_sql postgres supabase/migrations/202609280001_plan_creation_lifecycle.sql
apply_sql postgres supabase/migrations/202609290001_contacts_workspace.sql

# The second database proves backfill and RLS behavior from an Iteration 2-compatible state.
docker exec "${container_name}" createdb --username postgres quicksige_fixture
apply_sql quicksige_fixture supabase/tests/bootstrap.sql
apply_sql quicksige_fixture supabase/migrations/202609260001_initial_schema.sql
apply_sql quicksige_fixture supabase/migrations/202609280001_plan_creation_lifecycle.sql
apply_sql quicksige_fixture supabase/tests/contacts_pre_migration_fixture.sql
apply_sql quicksige_fixture supabase/migrations/202609290001_contacts_workspace.sql
apply_sql quicksige_fixture supabase/tests/contacts_rls.sql

echo "Contacts migrations and RLS checks passed."
