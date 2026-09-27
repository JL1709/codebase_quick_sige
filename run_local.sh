#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REQUIRED_NODE_MAJOR_VERSION=24
readonly LOCAL_URL="http://localhost:4173"

fail() {
  printf 'QuickSiGe could not start: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js ${REQUIRED_NODE_MAJOR_VERSION} is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

node_major_version="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ ! "$node_major_version" =~ ^[0-9]+$ ]] || (( node_major_version < REQUIRED_NODE_MAJOR_VERSION )); then
  fail "Node.js ${REQUIRED_NODE_MAJOR_VERSION} or newer is required; found $(node --version)."
fi

cd "$PROJECT_DIRECTORY"

if [[ ! -d node_modules ]] || [[ ! -f node_modules/.package-lock.json ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
  printf 'Installing project dependencies...\n'
  npm ci
fi

printf 'Starting QuickSiGe at %s\n' "$LOCAL_URL"
printf 'Press Ctrl+C to stop.\n\n'

exec npm run dev -- --strictPort
