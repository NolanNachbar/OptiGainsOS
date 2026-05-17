#!/usr/bin/env bash
# Downloads a Stitch asset URL to a local file, following redirects.
set -euo pipefail
URL="$1"
OUTPUT="$2"
curl -sL --max-redirs 10 -o "$OUTPUT" "$URL"
echo "Saved to $OUTPUT ($(wc -c < "$OUTPUT") bytes)"
