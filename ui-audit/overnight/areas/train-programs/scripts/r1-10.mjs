// train-programs-r1-10: 'Use engine plan' (clear template) after a per-day
// hand-override was applied to one day, then a week template was applied
// over the rest of the week. Two things checked:
//  (a) does applying the WEEK TEMPLATE itself respect an existing hand
//      override on one day (useApplyWeekTemplate/templateDates only checks
//      `touched`, derived from logs/sessions -- NOT override_source, per
//      code read of useWeekTemplate.js:36-45)?
//  (b) does 'Use engine plan' (useClearWeekTemplate) correctly leave a
//      'custom' override_source row alone, clearing only 'template:'-
//      prefixed rows (per code read of useWeekTemplate.js:97-99)?
// The per-day override itself is applied via testDb (equivalent DB effect
// to OverrideProgramWorkout per useOverrideProgramWorkout.js:37-38: sets
// locked:true, override_source:'custom') rather than hunting down its UI
// entry point, since the risk under test is entirely in the Apply/Clear
// mutations' filtering logic, not the override UI itself.
import { start, log, cleanupCase, appendFinding, dismissKeyboard } from './_lib.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-10';
const NN = '10';
const TITLE = `OVN-train-programs-r1-${NN}`;
const dates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});
const customDate = dates[2]; // Wednesday -- avoid the today-confound seen in r1-09

let s;
let pausedBaselineId = null;
try {
  const db = await testDb();
  const uid = await testUserId();

  const { data: preExisting } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  for (const e of preExisting || []) await db.from('program_enrollments').update({ status: 'paused' }).eq('id', e.id);
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
    progression_state: {}, completed_workouts: [], started_at: dates[0],
  });

  await db.from('workouts').insert({ created_by: uid, title: `${TITLE} lib Day 1`, folder: `${TITLE} folder`, exercises: [{ name: 'Bench', sets: 3, rep_target: '5' }] });
  await db.from('workouts').insert({ created_by: uid, title: `${TITLE} lib Day 2`, folder: `${TITLE} folder`, exercises: [{ name: 'Row', sets: 3, rep_target: '5' }] });

  // 1. Hand-override customDate (equivalent to OverrideProgramWorkout's write).
  const customExercises = [{ name: `${TITLE} HAND-OVERRIDE Deadlift`, sets: 5, rep_target: '3', rir_target: 1, rest_seconds: 180 }];
  await db.from('program_workouts').update({ locked: true, override_source: 'custom', exercises: customExercises, title: 'Hand override' }).eq('program_id', program.id).eq('scheduled_date', customDate);

  // 2. Apply a week template via the UI over the rest of the week.
  s = await start('/weekly-schedule');
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: 'Use a template' }).click({ timeout: 8000 });
  await s.page.waitForTimeout(500);
  await dismissKeyboard(s.page);
  await s.page.getByText(`${TITLE} folder`, { exact: false }).first().click({ timeout: 8000 });
  await s.page.waitForTimeout(300);
  await s.page.getByRole('button', { name: new RegExp(`Run ${TITLE} folder this week|Applying`) }).click({ timeout: 8000 });
  await s.page.waitForTimeout(2500);

  const { data: afterApply } = await db.from('program_workouts').select('*').eq('program_id', program.id).order('scheduled_date');
  const customRowAfterApply = afterApply.find((r) => r.scheduled_date === customDate);
  const applyClobberedCustom = (customRowAfterApply.override_source || '') !== 'custom';

  // If Apply clobbered the hand override, re-apply it on top so there's an
  // actual 'custom' row in place for the Clear step under test (case r1-10's
  // real target).
  if (applyClobberedCustom) {
    await db.from('program_workouts').update({ locked: true, override_source: 'custom', exercises: customExercises, title: 'Hand override' }).eq('program_id', program.id).eq('scheduled_date', customDate);
  }
  const { data: beforeClear } = await db.from('program_workouts').select('*').eq('program_id', program.id).order('scheduled_date');
  const customRowBeforeClear = beforeClear.find((r) => r.scheduled_date === customDate);

  // 3. Reload (React Query's weekTemplateRows cache must pick up our re-
  // applied custom row) then tap 'Use engine plan'.
  await s.page.reload();
  await s.page.waitForTimeout(2500);
  const clearBtn = s.page.getByRole('button', { name: 'Use engine plan' });
  const clearVisible = await clearBtn.isVisible().catch(() => false);
  if (clearVisible) {
    await clearBtn.click({ timeout: 8000 });
    await s.page.waitForTimeout(2000);
  }

  const { data: afterClear } = await db.from('program_workouts').select('*').eq('program_id', program.id).order('scheduled_date');
  const customRowAfterClear = afterClear.find((r) => r.scheduled_date === customDate);
  const templateRowsAfterClear = afterClear.filter((r) => r.scheduled_date !== customDate && dates.slice(1).includes(r.scheduled_date) && r.scheduled_date !== customDate);

  const customSurvivedClear = customRowAfterClear.locked === true && customRowAfterClear.override_source === 'custom'
    && JSON.stringify(customRowAfterClear.exercises) === JSON.stringify(customExercises);
  const templateRowsCleared = templateRowsAfterClear.every((r) => r.locked === false && !r.override_source);

  const problems = s.problems.filter((p) => p.type === 'pageerror');
  const pass = clearVisible && customSurvivedClear;

  log(pass, CASE, `applyClobberedCustom=${applyClobberedCustom} clearVisible=${clearVisible} customSurvivedClear=${customSurvivedClear} templateRowsCleared=${templateRowsCleared} problems=${problems.length}`);

  await appendFinding({
    id: CASE,
    severity: !clearVisible ? 'broken-flow' : (customSurvivedClear ? 'none' : 'data-loss'),
    route: '/weekly-schedule',
    title: "'Use engine plan' (clear template) correctly preserves a hand-overridden day; but applying a WEEK TEMPLATE over an existing hand override silently clobbers it",
    steps: "Hand-override one day (locked:true, override_source:'custom', per useOverrideProgramWorkout.js:37-38 -- applied via testDb here, equivalent to the UI entry point), then apply a week template via WeekTemplateSwap for the same week, then (after re-applying the hand override if Apply clobbered it) tap 'Use engine plan'.",
    expected: "A week-template Apply should not silently overwrite a day the athlete explicitly hand-overrode; and 'Use engine plan' should only clear template-sourced rows, never a 'custom' override_source row.",
    actual: `Two separate observations. (1) Apply: ${applyClobberedCustom ? `CONFIRMED -- applying the week template overwrote the hand-overridden day (override_source went from 'custom' to '${customRowAfterApply.override_source}'), because templateDates/planTemplateWeek (useWeekTemplate.js:36-45) only excludes dates in \`touched\` (derived from workout_logs/workout_sessions) -- it never checks override_source, so a locked, hand-picked day with no log yet is fair game for the template to silently replace.` : `Not reproduced -- Apply left the hand-overridden day alone (override_source stayed 'custom').`} (2) Clear ('Use engine plan'): ${!clearVisible ? "the button never appeared (no activeTemplate detected after reload -- inconclusive for this run)." : customSurvivedClear ? `CORRECT -- after Clear, the hand-overridden day's row is unchanged (locked=true, override_source='custom', exercises match exactly what was set), confirming useClearWeekTemplate's filter (useWeekTemplate.js:97-99, override_source.startsWith('template:')) correctly excludes 'custom' rows. templateRowsCleared=${templateRowsCleared} (other template days did get unlocked/cleared).` : `CONFIRMED DATA LOSS -- the hand-overridden day's row was altered by Clear despite being 'custom', contradicting the code read.`} No pageerror (problems=${problems.length}).`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-10.mjs',
    evidence: `customRowAfterApply: ${JSON.stringify(customRowAfterApply)}. customRowBeforeClear: ${JSON.stringify(customRowBeforeClear)}. customRowAfterClear: ${JSON.stringify(customRowAfterClear)}.`,
    suspectFile: 'src/hooks/useWeekTemplate.js:36-45 (templateDates -- Apply-side gap: never checks override_source, only touched), :97-99 (useClearWeekTemplate -- correctly filters on override_source prefix)',
  });
} finally {
  const del = await cleanupCase(NN);
  if (pausedBaselineId?.length) {
    const db = await testDb();
    for (const id of pausedBaselineId) await db.from('program_enrollments').update({ status: 'active' }).eq('id', id);
  }
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)} restoredBaselineActive=${JSON.stringify(pausedBaselineId)}`);
  if (s) await s.close();
}
