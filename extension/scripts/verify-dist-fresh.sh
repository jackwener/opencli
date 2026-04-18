#!/usr/bin/env bash
# Verify the committed extension/dist/ matches a fresh rebuild from src/,
# AND that manifest.json's service_worker entry still points into dist/.
# Run after `npm run build` inside extension/.
#
# Without the manifest assertion, an attacker could change manifest.json
# to load a different committed JS file (outside dist/) and bypass the
# rebuild check entirely. The runtime entry must be under the audited
# build output.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

EXPECTED_SW="dist/background.js"
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

echo "✅ manifest service_worker = $EXPECTED_SW and dist/ matches a fresh rebuild"
