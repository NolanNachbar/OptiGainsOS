#!/usr/bin/env bash
# Push gate: everything here must pass before `git push origin ui-polish:main`.
# The real-data invariants (ui-audit/journey/invariants.sql) run separately
# through the Supabase MCP, since this script never touches the service key.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:pages
# Pure tier only: the placeholder forces smoke.py's LIVE tier to skip.
SUPABASE_SERVICE_ROLE_KEY=placeholder python3 scripts/smoke.py
npx playwright test -c e2e/playwright.config.mjs
