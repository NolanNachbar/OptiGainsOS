#!/usr/bin/env bash
# run_weekly.sh — wrapper for generate_weekly_program.py (the weekly allocator +
# learners that program the upcoming week).
#
# Cron (Sunday, after compute+prescriber so it runs off fresh athlete_state):
#   10 10 * * 0 /home/nolan/projects/OptiGains/scripts/run_weekly.sh >> /home/nolan/scripts/sync.log 2>&1
#   (10:10am UTC = 4:10am MT during MDT / 3:10am MST in winter — same UTC offset
#    convention as run_compute.sh. Day-of-week 0 = Sunday.)
#
# LOCAL job: requires the computer to be on Sunday morning. The cloud daily brief
# and task push still run with the laptop off; this Python engine does not.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') starting generate_weekly_program ==="

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

python3 "$SCRIPT_DIR/generate_weekly_program.py"

echo "=== done $(date '+%H:%M:%S') ==="
