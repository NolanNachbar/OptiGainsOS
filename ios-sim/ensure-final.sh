#!/bin/sh
S=/private/tmp/claude-501/-Users-nolan-NolanBrain/b37880e3-8018-4ae8-94fb-f540d3d2ba31/scratchpad/final
curl -s -m 3 localhost:4724/status >/dev/null 2>&1 || { (cd $S && nohup appium --port 4724 > appium-$(date +%s).log 2>&1 &); sleep 8; echo "restarted appium"; }
curl -s -m 3 -o /dev/null http://127.0.0.1:4179/ || { (cd $S && nohup npx --prefix /Users/nolan/projects/OptiGainsOS-wt-fixes vite preview --outDir $S/dist --port 4179 --host 127.0.0.1 > preview-$(date +%s).log 2>&1 &); sleep 5; echo "restarted preview"; }
