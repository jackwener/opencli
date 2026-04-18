#!/usr/bin/env bash
# Verify the extension's runtime entrypoints are all under the audited
# surface, and that committed extension/dist/ matches a fresh rebuild.
#
# Three checks, each blocking:
#   1. service_worker still points at dist/background.js (the rebuild guard)
#   2. every other manifest entrypoint AND every src/href referenced from
#      allowlisted HTML pages must match a fixed allowlist of audited
#      paths. Without HTML walking a PR could keep popup.html in the
#      allowlist and rewrite its <script src> to load a new evil.js.
#   3. extension/dist/ matches `cd extension && npm run build` output

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

EXPECTED_SW="dist/background.js"

# Allowlist of manifest-referenced runtime files (and HTML transitive refs).
# Each entry is a path relative to extension/. Anything reachable from
# manifest.json that isn't in this list will fail the audit. To add a new
# entrypoint or HTML-loaded asset:
#   1. Add it here (in this PR)
#   2. Make sure it is either inside dist/ (covered by rebuild check)
#      or an explicitly-reviewed source file
ALLOWED_RUNTIME_PATHS=(
  "dist/background.js"
  "popup.html"
  "popup.js"
)

ACTUAL_SW=$(node -e "process.stdout.write(require('./extension/manifest.json').background.service_worker || '')")

if [ "$ACTUAL_SW" != "$EXPECTED_SW" ]; then
  cat <<EOF
::error::extension/manifest.json background.service_worker is "$ACTUAL_SW"
::error::but the verify-dist-fresh guard only audits "$EXPECTED_SW".
::error::Either restore the manifest entry to "$EXPECTED_SW" or extend this
::error::script to audit the new entrypoint.
EOF
  exit 1
fi

# Enumerate every runtime file the manifest references — including
# resources transitively loaded by allowlisted HTML pages (e.g. popup.html
# pulls popup.js via a script tag). Returns one path per line on stdout.
MANIFEST_REFS=$(node extension/scripts/enumerate-runtime-refs.mjs)

EXTRA_REFS=()
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  case "$ref" in
    icons/*) continue;;
  esac
  found=0
  for allowed in "${ALLOWED_RUNTIME_PATHS[@]}"; do
    if [ "$ref" = "$allowed" ]; then found=1; break; fi
  done
  if [ $found -eq 0 ]; then EXTRA_REFS+=("$ref"); fi
done <<< "$MANIFEST_REFS"

if [ ${#EXTRA_REFS[@]} -gt 0 ]; then
  echo "::error::extension/manifest.json (or HTML it loads) references runtime paths not in the allowlist:"
  for r in "${EXTRA_REFS[@]}"; do echo "::error::  $r"; done
  echo "::error::Add them to ALLOWED_RUNTIME_PATHS in extension/scripts/verify-dist-fresh.sh"
  echo "::error::in the SAME PR so the addition is reviewed alongside the manifest/HTML change."
  exit 1
fi

if ! git diff --exit-code -- extension/dist/; then
  cat <<'EOF'

::error::extension/dist/ is out of sync with extension/src/.
::error::manifest.json's service_worker points at extension/dist/background.js,
::error::so users load whatever is committed there. Run
::error::    cd extension && npm run build
::error::and commit the rebuilt dist/, or remove dist/ from git and require a build step.
EOF
  exit 1
fi

echo "manifest entrypoints + HTML refs in allowlist; dist/ matches a fresh rebuild"
