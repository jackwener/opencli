#!/usr/bin/env bash
# Verify the extension's runtime entrypoints are all under the audited
# surface, and that committed extension/dist/ matches a fresh rebuild.
#
# Three checks, each blocking:
#   1. service_worker still points at dist/background.js (the rebuild guard)
#   2. every other manifest entrypoint (popup, content_scripts, options_page,
#      devtools_page, sandbox.pages, web_accessible_resources, action.default_popup)
#      matches a fixed allowlist of audited paths — adding a new entrypoint
#      requires updating this script in the same PR
#   3. extension/dist/ matches `cd extension && npm run build` output
#
# Without (2), an attacker could swap manifest's default_popup to a new
# committed file and bypass the rebuild check entirely.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

EXPECTED_SW="dist/background.js"

# Allowlist of manifest-referenced runtime files. Each entry is a path
# relative to extension/. Anything the manifest references that isn't in
# this list will fail the audit. To add a new entrypoint:
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

# Enumerate every runtime file the manifest references. Walks the JSON
# fields that can carry executable JS, HTML, or asset paths. Returns one
# path per line on stdout.
MANIFEST_REFS=$(node <<'NODE'
const m = require('./extension/manifest.json');
const out = new Set();
const push = v => { if (typeof v === 'string' && v) out.add(v); };

if (m.background) push(m.background.service_worker);
if (m.action) push(m.action.default_popup);
if (m.options_page) push(m.options_page);
if (m.options_ui) push(m.options_ui.page);
if (m.devtools_page) push(m.devtools_page);
if (m.chrome_url_overrides) for (const v of Object.values(m.chrome_url_overrides)) push(v);
if (m.sandbox && Array.isArray(m.sandbox.pages)) for (const p of m.sandbox.pages) push(p);
if (Array.isArray(m.content_scripts)) {
  for (const cs of m.content_scripts) {
    for (const f of (cs.js || [])) push(f);
    for (const f of (cs.css || [])) push(f);
  }
}
if (Array.isArray(m.web_accessible_resources)) {
  for (const w of m.web_accessible_resources) {
    for (const f of (w.resources || [])) push(f);
  }
}
process.stdout.write([...out].join('\n'));
NODE
)

EXTRA_REFS=()
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  # Skip glob patterns and icons (icons handled separately).
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
  echo "::error::extension/manifest.json references runtime paths not in the allowlist:"
  for r in "${EXTRA_REFS[@]}"; do echo "::error::  $r"; done
  echo "::error::Add them to ALLOWED_RUNTIME_PATHS in extension/scripts/verify-dist-fresh.sh"
  echo "::error::in the SAME PR so the addition is reviewed alongside the manifest change."
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

echo "✅ manifest entrypoints in allowlist + dist/ matches a fresh rebuild"
