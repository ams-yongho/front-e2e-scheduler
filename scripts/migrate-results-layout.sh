#!/bin/bash
set -euo pipefail

RESULTS_DIR="${1:-}"
if [[ -z "$RESULTS_DIR" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RESULTS_DIR="$(dirname "$SCRIPT_DIR")/results"
fi

if [[ ! -d "$RESULTS_DIR" ]]; then
  echo "[migrate-results-layout] No results dir at $RESULTS_DIR, nothing to do."
  exit 0
fi

shopt -s nullglob

moved=0
for project_dir in "$RESULTS_DIR"/*/; do
  project_dir="${project_dir%/}"
  [[ -d "$project_dir" ]] || continue

  e2e_dir="$project_dir/e2e"
  for file in "$project_dir"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json; do
    [[ -f "$file" ]] || continue
    mkdir -p "$e2e_dir"
    base="$(basename "$file")"
    target="$e2e_dir/$base"
    if [[ -e "$target" ]]; then
      echo "[migrate-results-layout] Skip (already exists): $target"
      rm -f "$file"
    else
      mv "$file" "$target"
      moved=$((moved + 1))
    fi
  done
done

if [[ "$moved" -gt 0 ]]; then
  echo "[migrate-results-layout] Migrated $moved result file(s) into e2e/ subdirectories."
else
  echo "[migrate-results-layout] No legacy result files to migrate."
fi
