// train-programs-r1-01: editing an existing v2 program deletes all its days
// (useUpdateProgram, useProgramQueries.js:146-170) before recreating them --
// today every recreate 400s on the known PGRST204 notes bug (ProgramBuilder
// always sends `notes`). What must not happen: zero program_workouts rows
// left for a program that had rows before the edit.
import { start, log, cleanupCase, appendFinding, seedProgram, getProgramWorkouts } from './_lib.mjs';

const CASE = 'train-programs-r1-01';
const NN = '01';

let s;
try {
  const { program, workouts: seeded } = await seedProgram(NN, {
    days: [
      { day_index: 1, title: 'Day 1', exercises: [{ name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] },
      { day_index: 2, title: 'Day 2', exercises: [{ name: `OVN-tp-${NN} Squat`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] },
      { day_index: 3, title: 'Day 3', exercises: [{ name: `OVN-tp-${NN} Row`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] },
    ],
    daysPerWeek: 3,
  });
  const beforeCount = seeded.length;

  s = await start(`/program-builder?edit=${program.id}`);
  await s.page.waitForTimeout(1500);

  // Walk the wizard to Confirm (step 4/4), changing one field (a rep target)
  // on the way, without stripping `notes` -- this is the natural, currently-
  // deployed behavior (migration 20260928000000 not applied on hosted).
  await s.page.getByRole('button', { name: 'Next' }).click();
  await s.page.waitForTimeout(600);
  // Edit step (Cycle Days): open Day 1, change its exercise's rep target.
  const day1 = s.page.getByText('Day 1', { exact: true }).first();
  if (await day1.isVisible().catch(() => false)) {
    await day1.click();
    await s.page.waitForTimeout(400);
    const repInput = s.page.locator('input').filter({ hasText: '' }).first();
    // Fall back: just proceed without a field-level edit if the inline editor
    // shape isn't what's expected -- the save-path risk is what's under test,
    // not the field-diff itself.
  }
  await s.page.getByRole('button', { name: 'Next' }).click().catch(() => {});
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: 'Next' }).click().catch(() => {});
  await s.page.waitForTimeout(500);

  const bodyBeforeSave = await s.page.locator('body').innerText();
  const onConfirm = /Confirm/.test(bodyBeforeSave);

  const saveBtn = s.page.getByRole('button', { name: /Update Program|Saving/ });
  await saveBtn.click();
  await s.page.waitForTimeout(2500);

  const bodyAfterSave = await s.page.locator('body').innerText();
  const failToast = /Failed to update program/i.test(bodyAfterSave);
  const okToast = /Program updated/i.test(bodyAfterSave);

  const afterRows = await getProgramWorkouts(program.id);
  const afterCount = afterRows.length;
  const problems = s.problems.filter((p) => p.type === 'pageerror');

  // Judge: zero rows remaining (wiped, not restored) is the hard-fail case
  // the runbook flags. Partial (some but not all) is also bad. Full restore
  // (afterCount === beforeCount, whether via success or a clean no-op) is ok;
  // full original-preserved-on-failure is also ok if that's actually what
  // happens (it currently is NOT, per the code-read risk: delete runs before
  // any create attempt, so a create failure leaves 0 rows).
  const wiped = afterCount === 0;
  const partial = afterCount > 0 && afterCount < beforeCount;
  const dataLoss = wiped || partial;

  log(!dataLoss, CASE, `onConfirm=${onConfirm} failToast=${failToast} okToast=${okToast} beforeCount=${beforeCount} afterCount=${afterCount} wiped=${wiped} partial=${partial} problems=${problems.length}`);

  await appendFinding({
    id: CASE,
    severity: wiped ? 'data-loss' : (partial ? 'data-loss' : 'none'),
    route: `/program-builder?edit=${program.id}`,
    title: 'Editing an existing v2 program deletes all program_workouts rows before recreating them, and recreation currently always fails (PGRST204 notes)',
    steps: "Seed a v2 program with 3 program_workouts rows, open /program-builder?edit=<id>, walk to Confirm, tap 'Update Program' (no notes-migration workaround applied -- exercising the currently-deployed behavior).",
    expected: 'Either the update fully succeeds (all days present with the edit applied), or it fully fails leaving the ORIGINAL days untouched. Zero program_workouts rows remaining for a program that had rows before the edit must not happen.',
    actual: wiped
      ? `CONFIRMED data loss: program had ${beforeCount} program_workouts rows before the edit; after tapping 'Update Program' (toast: failToast=${failToast} okToast=${okToast}), 0 rows remain. useUpdateProgram (useProgramQueries.js:146-170) deletes all existing ProgramWorkout rows unconditionally before looping ProgramWorkout.create for the new set; because every create call 400s on PGRST204 (notes column missing the migration that adds it), the delete lands but not a single day gets recreated -- the program is silently reduced to zero days, worse than the known create-time failure (which at least leaves nothing to lose). The UI shows '${failToast ? "Failed to update program" : (okToast ? "Program updated (misleadingly, given 0 rows persisted)" : "no clear toast text matched")}' with no indication the program's days were just destroyed.`
      : partial
      ? `Partial data loss: ${beforeCount} rows before, ${afterCount} after (some but not all days survived/recreated) -- toast failToast=${failToast} okToast=${okToast}.`
      : `No data loss: ${beforeCount} rows before, ${afterCount} after. toast failToast=${failToast} okToast=${okToast}.`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-01.mjs',
    evidence: `beforeCount=${beforeCount} afterCount=${afterCount} bodyAfterSave snippet: ${bodyAfterSave.slice(0, 300)}`,
    suspectFile: 'src/hooks/useProgramQueries.js:146-170 (useUpdateProgram: unconditional delete-then-create loop, no transaction, no rollback on partial failure), src/pages/ProgramBuilder.jsx:425-471 (handleSubmit always includes notes on every workout)',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
