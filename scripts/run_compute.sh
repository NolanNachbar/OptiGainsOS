#!/usr/bin/env bash
# run_compute.sh — wrapper for compute_athlete_state.py
# Cron: 0 11 * * * /home/nolan/projects/OptiGains/scripts/run_compute.sh >> /var/log/athlete_state.log 2>&1
# (11am UTC = 4am MT during MDT; 5am MT during MST. Adjust second hour to 12 in winter.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/athlete_state.log"

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') starting compute_athlete_state ==="

# Load .env from project root
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.env"
    set +a
fi

# Activate venv if present, otherwise use system python
VENV="$PROJECT_DIR/.venv"
if [ -d "$VENV" ]; then
    # shellcheck source=/dev/null
    source "$VENV/bin/activate"
fi

python3 "$SCRIPT_DIR/compute_athlete_state.py"

echo "=== done $(date '+%H:%M:%S') ==="
