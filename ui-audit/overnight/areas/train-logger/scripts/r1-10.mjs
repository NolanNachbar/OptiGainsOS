// train-logger-r1-10: Swap every exercise in a program session mid-workout,
// including one already partially completed. Checks: (1) exercise 1's
// already-completed set survives its swap unchanged + gets a swap note, (2)
// exercises 2-4 (swapped before any set) seed cleanly with no swap note, (3)
// the final workout_logs exercises array uses the NEW names throughout, (4)
// whether 4 sequential swaps' async ProgramEnrollment.update calls (each
// reading progression_state off the same stale `enrollment` closure until its
// own query invalidation resolves) correctly chain rather than clobber each
// other — WorkoutDetail.jsx:1027-1035 / useProgramQueries.js useEnrollments.
import { start, snap, report } from '../../../drive.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { setNumberField, checkSet, log } from './_lib.mjs';

const CASE = 'train-logger-r1-10';
const today = new Date().toISOString().slice(0, 10);
const ORIG = ['OVN-r1-10 Ex1', 'OVN-r1-10 Ex2', 'OVN-r1-10 Ex3', 'OVN-r1-10 Ex4'];
const NEW = ['OVN-r1-10 Swap1', 'OVN-r1-10 Swap2', 'OVN-r1-10 Swap3', 'OVN-r1-10 Swap4'];

async function swapExercise(page, exIndex, newName, problems) {
  // Scroll to top first so card positions are stable/predictable regardless of
  // where a prior step (keyboard, scroll-into-view) left the page.
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(150);
  const card = page.locator('button.h-9.w-9').nth(exIndex);
  try {
    await card.scrollIntoViewIfNeeded({ timeout: 5000 });
    await card.click({ timeout: 8000, force: true });
  } catch (e) {
    await page.screenshot({ path: `/tmp/r1-10-fail-${exIndex}.png` });
    console.log(`SWAP_FAIL exIndex=${exIndex} bodyText=${(await page.evaluate(() => document.body.innerText)).slice(0, 800)}`);
    throw e;
  }
  await page.waitForTimeout(250);
  // force:true here bypasses Playwright's hit-test/interception check and
  // dispatches straight to the resolved element — needed because the sim's
  // keyboard/header overlay can sit visually on top of the real menu item.
  await page.getByText('Replace exercise').click({ force: true, timeout: 8000 });
  await page.waitForTimeout(250);
  const input = page.getByPlaceholder('Enter exercise name…');
  await input.fill(newName);
  // Enter inside this input is the combobox's own commit shortcut
  // (onKeyDown: Enter + non-empty value -> onReplaceExercise + close dialog).
  // Clicking the visible "Use" button also works but the option listbox that
  // opens under the input while typing sits over it, so keep this reliable path.
  await input.press('Enter');
  await page.getByText('Choose a replacement').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  const activeInfo = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? { tag: el.tagName, label: el.getAttribute?.('aria-label') || el.placeholder || null } : null;
  }).catch(() => null);
  console.log(`SWAP_DEBUG exIndex=${exIndex} activeElementAfterClose=${JSON.stringify(activeInfo)}`);
  // Dismiss the on-screen keyboard (still up after the Enter on a text input,
  // and sometimes focus lands back on a set's weight/reps field after the
  // dialog closes, reopening it). Blur whatever's focused rather than tapping
  // a fixed screen coordinate, which can hit unrelated UI under the keyboard.
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(400);
}

let programId, workoutId, enrollmentId, s;
try {
  const db = await testDb();
  const uid = await testUserId();

  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title: 'OVN-r1-10 Test Program', description: 'temp', focus: 'strength',
    duration_weeks: 4, days_per_week: 1, difficulty: 'intermediate', is_public: false,
    schema_version: 2, num_cycles: 4, tags: [],
  }).select().single();
  if (pErr) throw pErr;
  programId = program.id;

  const { data: pw, error: wErr } = await db.from('program_workouts').insert({
    program_id: programId, created_by: uid, title: 'OVN-r1-10 Test Day', focus: 'strength',
    week_number: 1, day_index: 1, scheduled_date: today,
    exercises: ORIG.map((name) => ({ name, sets: 1, rep_target: '10', rir_target: 3, rest_seconds: 90 })),
    duration_minutes: null, cardio_sessions: [], locked: false,
  }).select().single();
  if (wErr) throw wErr;
  workoutId = pw.id;

  const progressionState = {};
  for (const name of ORIG) {
    progressionState[name] = {
      working_weight: 100, last_session_date: today, sessions_at_current_weight: 1,
      ready_to_progress: false, stalled: false, stall_suggestion: null,
      first_programmed_at: today,
    };
  }
  const { data: enr, error: eErr } = await db.from('program_enrollments').insert({
    created_by: uid, program_id: programId, started_at: today, current_week: 1, current_day: 1,
    current_cycle: 1, current_day_index: 1, status: 'active',
    progression_state: progressionState, completed_workouts: [],
  }).select().single();
  if (eErr) throw eErr;
  enrollmentId = enr.id;

  s = await start(`/workout-detail?source=program&enrollmentId=${enrollmentId}&programWorkoutId=${workoutId}`);
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: 'Start Logging Workout' }).first().click();
  await s.page.waitForTimeout(1000);

  // Complete exercise 1's (Ex1) only set BEFORE swapping it.
  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '105');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '8');
  await checkSet(s.page, 1, 0);
  await snap(s.page, 'r1-10-before-swaps');

  // Swap all 4 exercises in quick succession (real user pace, not waiting for
  // each swap's async progression-state write to round-trip and invalidate).
  await swapExercise(s.page, 0, NEW[0], s.problems);
  await swapExercise(s.page, 1, NEW[1], s.problems);
  await swapExercise(s.page, 2, NEW[2], s.problems);
  await swapExercise(s.page, 3, NEW[3], s.problems);
  await s.page.waitForTimeout(1500); // let any pending progression writes land
  await snap(s.page, 'r1-10-after-swaps');

  const { data: enrAfterSwaps } = await db.from('program_enrollments').select('progression_state').eq('id', enrollmentId).single();
  const psKeys = Object.keys(enrAfterSwaps.progression_state || {});
  const allTransferred = NEW.every((n) => psKeys.includes(n));
  const noOrigLeft = ORIG.every((n) => !psKeys.includes(n));

  // Complete the remaining sets on the now-swapped exercises 2-4.
  for (let i = 1; i <= 3; i++) {
    await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).nth(i), '95');
    await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).nth(i), '10');
    await checkSet(s.page, 1, i);
  }
  await s.page.waitForTimeout(500);

  const bodyBeforeFinish = await s.page.evaluate(() => document.body.innerText);
  const ex1NoteVisible = /Swapped OVN-r1-10 Ex1/.test(bodyBeforeFinish);

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  const incomplete = s.page.getByText('Incomplete Sets');
  if (await incomplete.isVisible({ timeout: 2000 }).catch(() => false)) {
    await s.page.getByRole('button', { name: 'Complete All & Finish' }).click().catch(async () => {
      await s.page.getByRole('button', { name: 'Leave As-Is' }).click();
    });
  }
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(2000);
  await snap(s.page, 'r1-10-after-finish');

  const { data: logs, error } = await db.from('workout_logs').select('*').eq('program_id', programId);
  if (error) throw error;
  const savedExNames = (logs?.[0]?.exercises || []).map((e) => e.name);
  const allNewNames = NEW.every((n) => savedExNames.includes(n));
  const noOldNames = ORIG.every((n) => !savedExNames.includes(n));
  const ex1Log = logs?.[0]?.exercises?.find((e) => e.name === NEW[0]);
  const ex1SetPreserved = ex1Log?.sets?.[0]?.weight === 105 && ex1Log?.sets?.[0]?.reps === 8 && ex1Log?.sets?.[0]?.completed === true;

  const rpt = await report(s);
  const ok = allTransferred && noOrigLeft && allNewNames && noOldNames && ex1SetPreserved && ex1NoteVisible && rpt.problems.length === 0;
  log(ok, CASE, `progressionAllTransferred=${allTransferred} progressionNoOrigLeft=${noOrigLeft} progressionKeysAfterSwaps=${JSON.stringify(psKeys)} savedExNames=${JSON.stringify(savedExNames)} ex1SetPreserved=${ex1SetPreserved} ex1SwapNoteVisible=${ex1NoteVisible} problems=${rpt.problems.length}`);
  if (!allTransferred || !noOrigLeft) {
    console.log(`FINDING ${CASE}: after 4 sequential exercise swaps in one session, program_enrollments.progression_state = ${JSON.stringify(enrAfterSwaps.progression_state)} — expected all 4 NEW names present and all 4 ORIG names removed (transferProgressionState called once per swap). ${allTransferred ? '' : 'Missing transferred key(s) — a later swap clobbered an earlier one\'s write (each handleReplaceExercise reads enrollment.progression_state from a closure that only updates after that swap\'s own query invalidation resolves, so 4 swaps fired in quick succession all read the SAME pre-swap state and the last async update to land wins).'}`);
  }
  if (!allNewNames || !noOldNames) console.log(`FINDING ${CASE}: final workout_logs.exercises names = ${JSON.stringify(savedExNames)}, expected exactly ${JSON.stringify(NEW)} (no mix of old/new).`);
  if (!ex1SetPreserved) console.log(`FINDING ${CASE}: exercise 1's pre-swap completed set (105x8) was not preserved unchanged after the swap. Found: ${JSON.stringify(ex1Log)}`);
  if (!ex1NoteVisible) console.log(`FINDING ${CASE}: expected a visible 'Swapped OVN-r1-10 Ex1 → OVN-r1-10 Swap1' note after swapping an exercise with 1 already-completed set; not found in the DOM before Finish.`);
} finally {
  if (workoutId || programId) {
    const db = await testDb();
    if (workoutId) await db.from('workout_sessions').delete().eq('program_workout_id', workoutId);
    if (programId) await db.from('workout_logs').delete().eq('program_id', programId);
    if (enrollmentId) await db.from('program_enrollments').delete().eq('id', enrollmentId);
    if (workoutId) await db.from('program_workouts').delete().eq('id', workoutId);
    if (programId) await db.from('programs').delete().eq('id', programId);
    console.log(`CLEANUP ${CASE} deleted program+program_workout+enrollment+logs`);
  }
  if (s) await s.close();
}
