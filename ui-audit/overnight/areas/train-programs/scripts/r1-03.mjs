// train-programs-r1-03: imported program JSON with a blank exercise name and
// absurd set/rest values passes validation unclamped.
// NOTE: /program-builder create is currently fully blocked by the unapplied
// notes migration (PGRST204, known issue). To exercise the rest of the
// import->create flow, this script strips `notes` from the program_workouts
// POST via page.route (simulating migration 20260928000000 being applied).
import { writeFileSync } from 'node:fs';
import { start, log, stripNotesRoute, cleanupCase, appendFinding } from './_lib.mjs';

const CASE = 'train-programs-r1-03';
const NN = '03';
const file = '/tmp/ovn-tp-r1-03.json';
writeFileSync(file, JSON.stringify({
  program: { name: `OVN-train-programs-r1-${NN}`, cycle_length: 1, num_cycles: 1,
    workouts: [{ day_index: 1, title: 'Day 1', exercises: [
      { name: '', sets: 9999, rest_seconds: 999999 },
    ] }] },
}));

let s;
try {
  s = await start('/program-builder');
  await stripNotesRoute(s.page);
  await s.page.locator('input[type=file]').setInputFiles(file);
  await s.page.waitForTimeout(800);

  for (let i = 0; i < 3; i++) {
    await s.page.getByRole('button', { name: 'Next' }).click();
    await s.page.waitForTimeout(400);
  }
  await s.page.getByRole('button', { name: 'Create Program' }).click();
  await s.page.waitForTimeout(1500);

  const problems = s.problems;
  const httpErrs = problems.filter((p) => p.type === 'http');

  const rows = await L_getRows();
  async function L_getRows() {
    const { testDb, testUserId } = await import('/home/nolan/projects/OptiGains/e2e/helpers.mjs');
    const db = await testDb(); const uid = await testUserId();
    const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `OVN-train-programs-r1-${NN}%`);
    if (!progs?.length) return [];
    const { data: pw } = await db.from('program_workouts').select('*').in('program_id', progs.map((p) => p.id));
    return pw || [];
  }

  const created = rows.length > 0;
  const badExercise = created && rows[0].exercises?.[0];
  const passedThrough = badExercise && badExercise.name === '' && badExercise.sets === 9999 && badExercise.rest_seconds === 999999;

  log(created, CASE, `created=${created} httpErrs=${httpErrs.length} exercise=${JSON.stringify(badExercise)}`);
  if (!created) {
    console.log(`INCONCLUSIVE ${CASE}: create didn't go through even with notes stripped (httpErrs=${JSON.stringify(httpErrs)}); can't confirm import clamp bug end-to-end this round.`);
    await appendFinding({
      id: CASE, severity: 'minor', route: '/program-builder', verdict: 'blocked',
      title: 'Could not confirm import exercise-value clamp end-to-end (create blocked even with notes stripped)',
      steps: 'Import JSON with blank exercise name + sets:9999/rest_seconds:999999, step to Confirm, Create (notes stripped via route to bypass PGRST204).',
      expected: 'n/a - blocked', actual: `create request errors: ${JSON.stringify(httpErrs)}`,
      repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-03.mjs',
      evidence: 'code read confirms the underlying gap independent of DB: src/utils/programIO.js:105 name has no non-empty check, sets/rest_seconds (:106,109) have no upper bound unlike cycle_length/num_cycles (1-30/1-20 clamp, :87-88).',
      suspectFile: 'src/utils/programIO.js:105-109',
    });
  } else {
    console.log(`FINDING ${CASE}: blank name + absurd sets/rest passed straight through unclamped into program_workouts. passedThrough=${passedThrough}`);
    await appendFinding({
      id: CASE, severity: 'engine', route: '/program-builder',
      title: 'Imported program JSON with blank exercise name and absurd set/rest values passes validation unclamped',
      steps: 'Import a program JSON with one exercise: name:"", sets:9999, rest_seconds:999999. Step to Confirm, Create.',
      expected: 'Blank exercise name and absurd set/rest values are rejected or flagged before create, or clamped like cycle_length/num_cycles are.',
      actual: `Created program_workouts row stored the exercise verbatim: ${JSON.stringify(badExercise)}. These render as broken-looking cards (blank exercise name, "9999 sets") in ProgramDetail and WeeklySchedule with no upper bound.`,
      repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-03.mjs',
      evidence: `DB row after create: ${JSON.stringify(rows)}`,
      suspectFile: 'src/utils/programIO.js:105-109 (parseProgramJson: name has no non-empty check; sets/rest_seconds have no upper bound, unlike cycle_length 1-30 / num_cycles 1-20 clamps at :87-88)',
    });
  }
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
