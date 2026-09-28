// train-programs-r1-09: WeekTemplateSwap's `touched` set (dates already
// logged/started) is loaded by a React Query keyed on [user, programId,
// first] with no invalidation hook for writes made outside its own
// mutations. If a workout gets logged (e.g. via testDb, simulating a write
// from elsewhere) AFTER that query has already resolved and cached, and the
// template is applied on the same page without a reload/refetch, `touched`
// is stale and today's already-logged day can get silently overwritten.
//
// Temporarily pauses the account's pre-existing active enrollment so our
// tagged program is unambiguously the one WeeklySchedule/WeekTemplateSwap
// operate on (multiple active enrollments -> `enrollments.find(active)` is
// order-dependent) -- restored in `finally` before the case's own cleanup.
import { start, log, cleanupCase, appendFinding, dismissKeyboard } from './_lib.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-09';
const NN = '09';
const TITLE = `OVN-train-programs-r1-${NN}`;
const today = new Date().toISOString().slice(0, 10);
const dates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});
// Use Wednesday (index 2, this week) as the "just logged" target instead of
// today: other attackers share this test account concurrently and today
// already has organic workout_sessions rows from unrelated activity (a
// same-day confound that would make `touched` correctly non-empty for
// reasons unrelated to this race). Confirmed clean of any existing
// workout_logs/workout_sessions before using it.
const targetDate = dates[2];

let s;
let pausedBaselineId = null;
let loggedId = null;
try {
  const db = await testDb();
  const uid = await testUserId();

  // Pause the pre-existing active enrollment (if any) so ours is the sole
  // active one during this case.
  const { data: preExisting } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  for (const e of preExisting || []) {
    await db.from('program_enrollments').update({ status: 'paused' }).eq('id', e.id);
  }
  pausedBaselineId = (preExisting || []).map((e) => e.id);

  const { data: program } = await db.from('programs').insert({
    created_by: uid, title: TITLE, schema_version: 2, num_cycles: 1,
    duration_weeks: 1, days_per_week: 7, focus: 'strength',
  }).select().single();

  const rows = dates.map((d, i) => ({
    program_id: program.id, created_by: uid, day_index: i + 1, title: `Day ${i + 1}`,
    scheduled_date: d, exercises: [{ name: `${TITLE} Ex`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }],
  }));
  await db.from('program_workouts').insert(rows);

  await db.from('program_enrollments').insert({
    created_by: uid, program_id: program.id, status: 'active', current_cycle: 1,
    current_day_index: 1, current_week: 1, current_day: 1,
    progression_state: {}, completed_workouts: [], started_at: today,
  });

  // A tagged folder + 2 workouts so a template folder exists to apply.
  const { data: w1 } = await db.from('workouts').insert({ created_by: uid, title: `${TITLE} lib Day 1`, folder: `${TITLE} folder`, exercises: [{ name: 'Bench', sets: 3, rep_target: '5' }] }).select().single();
  const { data: w2 } = await db.from('workouts').insert({ created_by: uid, title: `${TITLE} lib Day 2`, folder: `${TITLE} folder`, exercises: [{ name: 'Row', sets: 3, rep_target: '5' }] }).select().single();

  // 1. Open /weekly-schedule FIRST so WeekTemplateSwap's `touched` query
  // fires and resolves with NO log for targetDate yet (touched = empty for it).
  s = await start('/weekly-schedule');
  await s.page.waitForTimeout(2500);

  // 2. NOW insert targetDate's log directly via testDb -- a write the page's
  // React Query cache has no subscription to and will not know about.
  // workout_logs has no title column (created_by, workout_id, log_date,
  // exercises, duration_seconds, notes, pre_note, post_note only) -- capture
  // the id for explicit cleanup since cleanupCase's tag-based ilike filter
  // doesn't apply here.
  const { data: logRow, error: logErr } = await db.from('workout_logs').insert({
    created_by: uid, program_id: program.id, log_date: targetDate,
    exercises: [{ name: `${TITLE} Ex`, sets: [{ weight: 135, reps: 5 }] }], duration_seconds: 1200,
  }).select().single();
  if (logErr) throw logErr;
  loggedId = logRow.id;

  // 3. Immediately (no reload) open the template picker and apply, using
  // whatever `touched` the page already has cached.
  const openBtn = s.page.getByRole('button', { name: 'Use a template' });
  await openBtn.click({ timeout: 8000 });
  await s.page.waitForTimeout(500);
  await dismissKeyboard(s.page);
  const folderOption = s.page.getByText(`${TITLE} folder`, { exact: false }).first();
  await folderOption.click({ timeout: 8000 });
  await s.page.waitForTimeout(300);
  const applyBtn = s.page.getByRole('button', { name: new RegExp(`Run ${TITLE} folder this week|Applying`) });
  await applyBtn.click({ timeout: 8000 });
  await s.page.waitForTimeout(2500);

  const bodyAfter = await s.page.locator('body').innerText();
  const problems = s.problems.filter((p) => p.type === 'pageerror');

  const { data: afterRows } = await db.from('program_workouts').select('*').eq('program_id', program.id).order('scheduled_date');
  const targetRow = afterRows.find((r) => r.scheduled_date === targetDate);
  const overwrittenDespiteLogged = targetRow && (targetRow.override_source || '').startsWith('template:');
  const anyRowApplied = afterRows.some((r) => (r.override_source || '').startsWith('template:'));

  log(!overwrittenDespiteLogged, CASE, `targetDate=${targetDate} targetRow.override_source=${targetRow?.override_source} overwrittenDespiteLogged=${overwrittenDespiteLogged} anyRowApplied=${anyRowApplied} problems=${problems.length}`);

  await appendFinding({
    id: CASE,
    severity: overwrittenDespiteLogged ? 'data-loss' : (anyRowApplied ? 'none' : 'blocked'),
    route: '/weekly-schedule',
    title: "WeekTemplateSwap's `touched` (already-logged) set is a client-cached React Query snapshot with no invalidation hook for writes made elsewhere -- applying a template right after a concurrent log can overwrite an already-logged day",
    steps: "Open /weekly-schedule (WeekTemplateSwap's `touched` query fires and caches with the target date NOT logged yet), then (simulating a concurrent write via testDb, e.g. a log finished on another device/tab) insert a workout_logs row for a day later this week (Wednesday, chosen to avoid a same-day confound from other agents sharing this test account and logging against 'today'), then immediately -- no reload -- open the template picker and apply a folder for the week.",
    expected: "The logged date stays untouched by the template because it's logged (`touched` should include it) -- the apply mutation should re-derive touched server-side, or at minimum re-fetch before computing the plan, rather than trusting a client snapshot that predates the log write.",
    actual: !anyRowApplied
      ? `Inconclusive: no row in the week ended up template-prefixed at all (anyRowApplied=false), meaning the Apply click itself didn't land as expected in this run -- not a real 'touched correctly protected the day' result. Needs a rerun with the Apply-button interaction verified before trusting the outcome.`
      : overwrittenDespiteLogged
      ? `CONFIRMED: the targetDate (${targetDate}) program_workouts row was rewritten with override_source='${targetRow.override_source}' despite a workout_logs row for that date existing in the DB before Apply was tapped. useApplyWeekTemplate/planTemplateWeek (useWeekTemplate.js:36-45,68-84) compute the plan purely from the client's cached \`touched\` Set (WeekTemplateSwap.jsx:29-47, React Query keyed [weekTemplateRows,user,programId,first]); a workout_logs write made through any channel other than this component's own query invalidation (a testDb insert, a second tab, a different device) never triggers a refetch, so the plan can silently include and overwrite an already-logged day. No pageerror (problems=${problems.length}).`
      : `Not reproduced: other days in the week WERE template-applied (anyRowApplied=true, confirming Apply worked), but targetDate (${targetDate}) row override_source='${targetRow?.override_source}' (not template-prefixed) -- it was correctly excluded from the plan despite the race attempt. No pageerror (problems=${problems.length}).`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-09.mjs',
    evidence: `targetDate=${targetDate} targetRow: ${JSON.stringify(targetRow)}. anyRowApplied=${anyRowApplied}. afterRows override_sources: ${JSON.stringify(afterRows.map((r) => [r.scheduled_date, r.override_source]))}. bodyAfter snippet: ${bodyAfter.slice(0, 300)}`,
    suspectFile: 'src/components/program/WeekTemplateSwap.jsx:29-47 (touched query, no dependency on a just-logged signal), src/hooks/useWeekTemplate.js:36-45 (templateDates/planTemplateWeek trust the caller-supplied touched Set), :68-84 (useApplyWeekTemplate mutationFn does no server-side re-check before writing)',
  });
} finally {
  const del = await cleanupCase(NN);
  if (loggedId) {
    const db2 = await testDb();
    await db2.from('workout_logs').delete().eq('id', loggedId);
  }
  if (pausedBaselineId?.length) {
    const db = await testDb();
    for (const id of pausedBaselineId) await db.from('program_enrollments').update({ status: 'active' }).eq('id', id);
  }
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)} restoredBaselineActive=${JSON.stringify(pausedBaselineId)}`);
  if (s) await s.close();
}
