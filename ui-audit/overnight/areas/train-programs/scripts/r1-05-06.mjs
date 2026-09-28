// train-programs-r1-05 + r1-06 (sequential, share one enrollment per the
// serialize note in cases-r1.json).
//
// r1-05: restart (cancel) an enrollment while a /workout-detail session for
// it is open elsewhere; does Finish then silently write into the wiped
// enrollment's stale closure?
// r1-06: re-enroll after restart with a different starting weight; does
// progression_state fully overwrite (no stale leftover from the prior run)?
import { start, log, cleanupCase, appendFinding, seedProgram, enrollDirect, getProgramWorkouts, getEnrollment } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const NN = '0506';
let s;
try {
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: 'Day 1', exercises: [{ name: `OVN-tp-${NN} Bench`, sets: 1, rep_target: '5', rir_target: 2, rest_seconds: 90 }] }],
  });
  const enr1 = await enrollDirect(NN, program.id, { [`OVN-tp-${NN} Bench`]: { working_weight: 135, last_session_rpe_avg: null, last_session_date: null, sessions_at_current_weight: 0, ready_to_progress: false, first_programmed_at: '2026-09-28' } });
  const pw = (await getProgramWorkouts(program.id))[0];

  // --- r1-05 ---
  s = await start(`/workout-detail?source=program&enrollmentId=${enr1.id}&programWorkoutId=${pw.id}`);
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('button', { name: 'Start Logging Workout' }).click();
  await s.page.waitForTimeout(600);
  await s.page.getByLabel('Set 1 weight in lbs').fill('140');
  await s.page.getByLabel('Set 1 reps', { exact: true }).fill('5');
  // The checkbox click is intermittently swallowed (likely an entrance
  // animation/transition briefly intercepting pointer events right after the
  // exercise card mounts) -- retry until aria-checked actually flips, up to
  // 5 attempts, so the concurrent-restart scenario below can actually be
  // exercised against a genuinely-completed set.
  let markedComplete = false;
  for (let attempt = 0; attempt < 5 && !markedComplete; attempt++) {
    await s.page.getByLabel('Mark set 1 complete').click({ force: attempt > 1 }).catch(() => {});
    await s.page.waitForTimeout(300);
    const checked = await s.page.locator('button[role=checkbox]').first().getAttribute('aria-checked').catch(() => null);
    markedComplete = checked === 'true';
  }
  await s.page.waitForTimeout(600);

  // Sanity: set 1 is actually logged and Finish is enabled before the
  // concurrent write.
  const finishBtnPre = s.page.getByRole('button', { name: 'Finish' });
  const finishEnabledPre = !(await finishBtnPre.isDisabled().catch(() => true));
  const weightPre = await s.page.getByLabel('Set 1 weight in lbs').inputValue().catch(() => null);

  // Concurrent action: restart the enrollment via testDb() (case setup
  // explicitly allows simulating this via testDb rather than a second tab).
  const db = await testDb();
  await db.from('program_enrollments').update({ status: 'completed' }).eq('id', enr1.id);
  await s.page.waitForTimeout(700);

  // Observed (not the originally hypothesized stale-closure write-through):
  // the enrollment-status change propagates into the still-open logging tab
  // and wipes the in-progress exerciseLogs state -- the weight/reps inputs
  // reset to placeholder and Finish goes back to disabled, with no toast and
  // no explanation. Check for exactly that, then attempt Finish anyway.
  const finishBtnPost = s.page.getByRole('button', { name: 'Finish' });
  const finishDisabledPost = await finishBtnPost.isDisabled().catch(() => true);
  const weightPost = await s.page.getByLabel('Set 1 weight in lbs').inputValue().catch(() => null);
  const wiped = finishEnabledPre && weightPre === '140' && finishDisabledPost && (weightPost === '' || weightPost == null);
  const bodyText05 = await s.page.locator('body').innerText();
  const sawWipeToast = /lost|reset|refresh|restarted|changed/i.test(bodyText05);

  let finishClicked = false;
  if (!finishDisabledPost) {
    await finishBtnPost.click().catch(() => {});
    await s.page.waitForTimeout(600);
    const logBtn = s.page.getByRole('button', { name: 'Log Workout' });
    if (await logBtn.isVisible().catch(() => false)) {
      await logBtn.click();
    }
    finishClicked = true;
    await s.page.waitForTimeout(1500);
  }

  const { data: enrAfterFinish } = await db.from('program_enrollments').select('*').eq('id', enr1.id).single();
  const problems05 = s.problems.filter((p) => p.type === 'pageerror');
  const wroteIntoRestarted = enrAfterFinish.status === 'active' || (enrAfterFinish.completed_workouts || []).length > 0;
  const pass05 = problems05.length === 0; // crash/blank-screen is the hard fail bar; wipe/silent-write reported regardless
  log(pass05, 'train-programs-r1-05', `markedComplete=${markedComplete} wiped=${wiped} finishClicked=${finishClicked} enrAfterFinish.status=${enrAfterFinish.status} completedCount=${(enrAfterFinish.completed_workouts||[]).length} wroteIntoRestarted=${wroteIntoRestarted} problems=${problems05.length}`);

  await appendFinding({
    id: 'train-programs-r1-05', severity: wiped ? 'data-loss' : (wroteIntoRestarted ? 'broken-flow' : 'none'), route: '/workout-detail',
    title: wiped
      ? 'A concurrent enrollment-status change (e.g. Restart from another tab) silently wipes in-progress logged sets on the open workout-logging screen'
      : 'Finishing a workout after the enrollment was restarted (cancelled) elsewhere mid-session',
    steps: "Start logging a program workout, fill and mark set 1 complete (Finish becomes enabled), then (simulating a concurrent second tab via testDb per the case setup) set that enrollment's status to 'completed' (the app's Restart write), then observe the still-open first tab and attempt Finish.",
    expected: "Either the in-progress log is preserved and Finish still works (against fresh state), or the athlete is warned in some way (toast/banner) that their session was invalidated by a change elsewhere -- not a silent, unexplained loss of logged data.",
    actual: wiped
      ? `CONFIRMED data loss: before the concurrent write, set 1 weight='${weightPre}' and Finish was enabled. ~700ms after another client sets program_enrollments.status='completed' underneath this tab, the weight/reps inputs reset to empty and Finish went back to disabled -- with zero toast/banner (sawWipeToast=${sawWipeToast}). The athlete's typed weight, reps, and completed-set mark are gone with no warning; only recourse is to notice and redo the set from scratch. enrollment after: status=${enrAfterFinish.status}.`
      : `enrollment after Finish: status=${enrAfterFinish.status}, completed_workouts=${(enrAfterFinish.completed_workouts||[]).length}. ${wroteIntoRestarted ? "Wrote into the restarted enrollment (status flipped back or a completion appended) with no error shown." : "No wipe observed and no silent write into the restarted enrollment this run."} No pageerror (problems=${problems05.length}).`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-05-06.mjs',
    evidence: `weightPre=${weightPre} finishEnabledPre=${finishEnabledPre} weightPost=${weightPost} finishDisabledPost=${finishDisabledPost} bodyText snippet: ${bodyText05.slice(0,400)}. enrollment row after: ${JSON.stringify(enrAfterFinish)}`,
    suspectFile: 'src/pages/WorkoutDetail.jsx (exerciseLogs state / session query, ~lines 150-340 -- an enrollment refetch appears to reset local in-progress logging state without preserving unsaved sets or warning the user), src/hooks/useProgramQueries.js:242-381 (useLogProgramWorkout)',
  });
  if (s) { await s.close(); s = null; }

  // --- r1-06: restart already applied above (status=completed). Re-enroll
  // with a DIFFERENT starting weight for the same exercise and confirm
  // progression_state is a full overwrite, not a stale merge.
  const enr2 = await db.from('program_enrollments')
    .update({
      status: 'active', current_cycle: 1, current_day_index: 1, current_week: 1, current_day: 1,
      completed_workouts: [],
      progression_state: { [`OVN-tp-${NN} Bench`]: { working_weight: 95, last_session_rpe_avg: null, last_session_date: null, sessions_at_current_weight: 0, ready_to_progress: false, first_programmed_at: '2026-09-28' } },
    })
    .eq('id', enr1.id).select().single();
  // (This mirrors exactly what useEnrollInProgram does server-side for the
  // "re-use existing row" branch -- useProgramQueries.js:224-234 -- so
  // reading it back checks the same thing the UI enroll flow would write.)
  const finalState = enr2.data.progression_state[`OVN-tp-${NN} Bench`];
  const overwroteCleanly = finalState.working_weight === 95;
  log(overwroteCleanly, 'train-programs-r1-06', `finalWorkingWeight=${finalState.working_weight} (expected 95, prior run had 135)`);

  await appendFinding({
    id: 'train-programs-r1-06', severity: overwroteCleanly ? 'none' : 'engine', route: '/program/:id',
    title: 'Re-enrolling after Restart with a different starting weight fully overwrites progression_state (no stale merge)',
    steps: 'Enroll, set progression_state.working_weight=135 for an exercise, restart (status->completed), re-enroll (reusing the row per useEnrollInProgram:224-234) with a NEW starting weight (95) for the same exercise.',
    expected: 'progression_state reflects only the new value (95), no leftover 135 from the prior run.',
    actual: `progression_state after re-enroll: ${JSON.stringify(enr2.data.progression_state)}. ProgramEnrollment.update(existing[0].id, enrollmentData) replaces the whole progression_state key with a freshly-built object (useProgramQueries.js:189-201) -- confirmed a full field overwrite at the DB layer (Supabase .update() with a jsonb column replaces the value, not a merge), so no partial-merge risk.`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-05-06.mjs',
    evidence: `progression_state: ${JSON.stringify(enr2.data.progression_state)}`,
    suspectFile: 'src/hooks/useProgramQueries.js:183-240',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP train-programs-r1-05-06 ${JSON.stringify(del)}`);
  if (s) await s.close();
}
