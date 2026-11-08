#!/usr/bin/env bash
# Runs every lint, type, test and build check that CI runs, from the repo root.
# Activate the Python virtual environment first (see README). The database
# checks need Docker and run separately: scripts/verify-database.sh
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$1"; }

step "Backend lint (ruff)"
python -m ruff check backend

step "Backend types (mypy)"
python -m mypy backend/app

step "Backend tests (pytest)"
python -m pytest backend/tests -q

cd frontend
if [ ! -d node_modules ]; then
  step "Frontend install (npm ci)"
  npm ci
fi

step "Frontend lint (eslint)"
npm run lint

step "Frontend types (tsc)"
npm run typecheck

step "Frontend tests (vitest)"
npm test

step "Frontend build (next build)"
npm run build

printf '\nAll checks passed.\n'
