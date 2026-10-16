#!/usr/bin/env node
/**
 * Re-runnable assertions for the frontend side of set types / CSV export.
 * Bundles the real src modules with esbuild (alias @ -> src), then runs them.
 *
 * Run: node scripts/test_set_types.mjs
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = `
import assert from 'node:assert/strict';
import { baseType, markPatch, currentMark } from '@/utils/setTypes';
import { updateProgressionState } from '@/utils/programProgression';
import { csvCell, toCsv, CSV_BOM } from '@/utils/workoutCsv';

const S = (weight, reps, set_type, extra = {}) => ({ weight, reps, rir: 2, completed: true, set_type, ...extra });
const ex = { name: 'Bench Press', rep_target: '5', rir_target: 2 };
const weightAfter = (sets) => updateProgressionState({}, ex, sets)['Bench Press']?.working_weight ?? null;

// baseType looks through a mark
assert.equal(baseType({ set_type: 'failure', set_type_base: 'top_set' }), 'top_set');
assert.equal(baseType({ set_type: 'top_set' }), 'top_set');
const marked = { set_type: 'top_set', ...markPatch({ set_type: 'top_set' }, 'drop') };
assert.equal(marked.set_type, 'drop'); assert.equal(baseType(marked), 'top_set');
const un = { ...marked, ...markPatch(marked, 'working') };
assert.equal(un.set_type, 'top_set');

// Progression: unmarked behaviour unchanged
assert.equal(weightAfter([S(200, 5, 'working')]), 200);
assert.equal(weightAfter([S(200, 5, 'daily_max')]), 200);
assert.equal(weightAfter([S(250, 3, 'top_set')]), null);
assert.equal(weightAfter([S(150, 5, 'daily_min')]), null);
assert.equal(weightAfter([S(150, 5, 'backoff')]), null);
// Marks: failure on a working set still feeds; on top_set/backoff/daily_min it must not
assert.equal(weightAfter([S(205, 5, 'failure', { set_type_base: 'working' })]), 205);
assert.equal(weightAfter([S(250, 3, 'failure', { set_type_base: 'top_set' })]), null);
assert.equal(weightAfter([S(150, 5, 'failure', { set_type_base: 'daily_min' })]), null);
assert.equal(weightAfter([S(150, 5, 'failure', { set_type_base: 'backoff' })]), null);
// warm-up / drop never feed, even over a working base
assert.equal(weightAfter([S(300, 1, 'warmup', { set_type_base: 'working' })]), null);
assert.equal(weightAfter([S(100, 12, 'drop', { set_type_base: 'working' })]), null);
assert.equal(weightAfter([S(300, 1, 'warmup', { set_type_base: 'working' }), S(200, 5, 'working')]), 200);

// CSV formula guard + BOM
assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
assert.equal(csvCell('+1'), '+1'); // numeric string stays numeric
assert.equal(csvCell('-5'), '-5');
assert.equal(csvCell('-abc'), "'-abc");
assert.equal(csvCell('@cmd'), "'@cmd");
assert.equal(csvCell('\\tx'), "'\\tx");
assert.equal(csvCell(-12.5), '-12.5');
assert.equal(csvCell(null), '');
assert.equal(csvCell('Bench, "Press"'), '"Bench, ""Press"""');
assert.equal(csvCell('=1,2'), '"\\'=1,2"');
assert.ok(toCsv([['a']]).startsWith(CSV_BOM));
console.log('test_set_types.mjs: ok');
`;

const out = await build({
  stdin: { contents: entry, resolveDir: root, loader: "js" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "error",
  alias: { "@": path.join(root, "src") },
});
const code = out.outputFiles[0].text;
await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
