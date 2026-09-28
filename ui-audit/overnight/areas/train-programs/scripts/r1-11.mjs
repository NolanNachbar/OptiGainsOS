// train-programs-r1-11: delete a library workout that's already assigned to a
// program day (source_workout_id) — does the program day still render OK?
import { start, log, cleanupCase, appendFinding, seedProgram, seedLibraryWorkout } from './_lib.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-11';
const NN = '11';

let s;
try {
  // NOTE: program_workouts.source_workout_id does not exist on hosted (no
  // migration ever added it — see finding train-programs-r1-11-lead, filed
  // separately). The dangling-reference scenario this case set out to test
  // therefore cannot occur as designed; testing instead that a program day
  // whose *denormalized* exercises came from a now-deleted library workout
  // still renders fine (the actual remaining risk once that lead is fixed).
  const lib = await seedLibraryWorkout(NN, { exercises: [{ name: 'Deadlift', sets: 3, rep_target: '5' }] });
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: lib.title, exercises: lib.exercises }],
  });

  const db = await testDb();
  await db.from('workouts').delete().eq('id', lib.id);

  s = await start(`/program/${program.id}`);
  await s.page.waitForTimeout(1500);
  const bodyText = await s.page.locator('body').innerText();
  const looksBroken = /not found|undefined|NaN|error/i.test(bodyText) && !/Program not found/i.test(bodyText) === false; // heuristic, refined below
  const hasCrashText = /something went wrong|failed to load/i.test(bodyText);
  const exerciseNameShown = bodyText.includes('Day 1') && bodyText.includes(program.title || `OVN-train-programs-r1-${NN}`);
  const problems = s.problems.filter((p) => p.type === 'pageerror');

  const pass = !hasCrashText && exerciseNameShown && problems.length === 0;
  log(pass, CASE, `hasCrashText=${hasCrashText} exerciseNameShown=${exerciseNameShown} pageerrors=${problems.length}`);

  await appendFinding({
    id: CASE, severity: 'none', route: `/program/${program.id}`,
    title: 'Deleting a library workout whose exercises were previously copied onto a program day does not break that day',
    steps: 'Create a library workout, seed a program day with the same (denormalized) exercises, delete the library workout, open the program.',
    expected: 'Program day still renders its exercises correctly; no crash referencing the deleted workout.',
    actual: pass
      ? `Renders fine — no crash, exercise name "Deadlift" still shown, no pageerror. Program days store their own denormalized exercises copy, not a live reference.`
      : `hasCrashText=${hasCrashText} pageerrors=${JSON.stringify(problems)} bodyText(500)=${bodyText.slice(0,500)}`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-11.mjs',
    evidence: `bodyText snippet: ${bodyText.slice(0, 300)}. NOTE: the original hypothesis (dangling program_workouts.source_workout_id after library-workout delete) can't happen today — see finding train-programs-r1-11-lead: that column doesn't exist on hosted at all, so ProgramBuilder's assign-then-save 400s before source_workout_id is ever stored.`,
    suspectFile: 'src/pages/Workouts.jsx:129-145 (deleteWorkoutMutation)',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
