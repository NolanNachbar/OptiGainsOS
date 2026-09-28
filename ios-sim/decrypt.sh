#!/usr/bin/env bash
# Decrypts a downloaded ios-sim artifact into ios-sim/results/<run>/.
# Key lives in ~/.config/optigains/sim-artifact.key (same value as the SIM_ARTIFACT_KEY secret).
set -euo pipefail
enc=${1:-ios-sim.tar.gz.enc}
dest=${2:-$(dirname "$0")/results/$(date +%Y%m%d-%H%M%S)}
mkdir -p "$dest"
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:"$HOME/.config/optigains/sim-artifact.key" -in "$enc" | tar xzf - -C "$dest" --strip-components=1
echo "$dest"
