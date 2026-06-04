#!/usr/bin/env bash
# run_prescriber.sh — wrapper for mpc_prescriber.py
# Cron: 5 11 * * * /home/nolan/projects/OptiGains/scripts/run_prescriber.sh >> /var/log/athlete_state.log 2>&1
# (11:05am UTC = 4:05am MT during MDT; adjust to 12:05 in winter.)
# Runs 5 minutes after compute_athlete_state to ensure engine_params is ready.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') starting mpc_prescriber ==="

if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.env"
    set +a
fi

VENV="$PROJECT_DIR/.venv"
if [ -d "$VENV" ]; then
    # shellcheck source=/dev/null
    source "$VENV/bin/activate"
fi

python3 "$SCRIPT_DIR/mpc_prescriber.py"

echo "=== done $(date '+%H:%M:%S') ==="
