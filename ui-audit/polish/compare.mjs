// Regression gate: no screen may get worse on any deterministic probe check.
// Usage: node ui-audit/polish/compare.mjs <before-summary.json> <after-summary.json>
// Exits non-zero and prints every (screen, check) that regressed if any
// per-screen count increased. Exits 0 (silent on stdout beyond "OK") if clean.
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('usage: node compare.mjs <before-summary.json> <after-summary.json>');
  process.exit(2);
}
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

let regressions = [];
for (const [screenId, beforeCounts] of Object.entries(before.perScreen)) {
  const afterCounts = after.perScreen[screenId];
  if (!afterCounts) { regressions.push({ screenId, check: '(missing)', before: 'present', after: 'missing from after-run' }); continue; }
  for (const [check, bVal] of Object.entries(beforeCounts)) {
    const aVal = afterCounts[check] ?? 0;
    if (aVal > bVal) regressions.push({ screenId, check, before: bVal, after: aVal });
  }
}

if (regressions.length) {
  console.error(`REGRESSION GATE FAILED: ${regressions.length} regression(s)`);
  for (const r of regressions) console.error(`  ${r.screenId} :: ${r.check}  ${r.before} -> ${r.after}`);
  process.exit(1);
} else {
  console.log(`OK: no regressions across ${Object.keys(before.perScreen).length} screens`);
  process.exit(0);
}
