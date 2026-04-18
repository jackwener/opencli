#!/usr/bin/env bash
# Verify the committed extension/dist/ matches a fresh rebuild from src/.
# Run after `npm run build` inside extension/. The script must execute from
# the repo root so the git-diff path matches the committed tree layout.
#
# manifest.json's service_worker entry points at extension/dist/background.js;
# whatever is committed there is what users actually load when they
# `Load unpacked extension/`. Without this guard, a malicious or stale dist/
# could ship undetected.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if git diff --exit-code -- extension/dist/; then
  echo "✅ committed extension/dist/ matches a fresh rebuild"
  exit 0
fi

cat <<'EOF'

::error::extension/dist/ is out of sync with extension/src/.
::error::manifest.json's service_worker points at extension/dist/background.js,
::error::so users load whatever is committed there. Run
::error::    cd extension && npm run build
::error::and commit the rebuilt dist/, or remove dist/ from git and require a build step.
EOF

exit 1
