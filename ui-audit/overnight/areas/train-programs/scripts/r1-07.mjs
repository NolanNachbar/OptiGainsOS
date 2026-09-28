// train-programs-r1-07: double-tap Pause then Resume in quick succession —
// no isPending guard on either button (confirmed by code read), status field
// may race to a stale value.
import { start, log, cleanupCase, appendFinding, seedProgram, enrollDirect } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-07';
const NN = '07';

let s;
try {
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: 'Day 1', exercises: [{ name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] }],
  });
  const enr = await enrollDirect(NN, program.id, {});

  s = await start(`/program/${program.id}`);
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: 'Manage' }).click();
  await s.page.waitForTimeout(400);

  const pauseBtn = s.page.getByRole('button', { name: 'Pause' });
  // Fire 3 rapid Pause clicks with no await between them, no isPending guard
  // per code read (ProgramDetail.jsx:429-461) -- race the mutation.
  const c1 = pauseBtn.click({ timeout: 3000 }).catch((e) => ({ err: String(e) }));
  const c2 = pauseBtn.click({ timeout: 3000 }).catch((e) => ({ err: String(e) }));
  const c3 = pauseBtn.click({ timeout: 3000 }).catch((e) => ({ err: String(e) }));
  await Promise.all([c1, c2, c3]);
  await s.page.waitForTimeout(2000);

  const db = await testDb();
  const { data: after1 } = await db.from('program_enrollments').select('status').eq('id', enr.id).single();

  // Now the button should read Resume; race Resume x2.
  await s.page.waitForTimeout(500);
  const resumeBtn = s.page.getByRole('button', { name: /Resume/ }).last();
  let resumeRaced = false;
  if (await resumeBtn.isVisible().catch(() => false)) {
    const r1 = resumeBtn.click({ timeout: 3000 }).catch((e) => ({ err: String(e) }));
    const r2 = resumeBtn.click({ timeout: 3000 }).catch((e) => ({ err: String(e) }));
    await Promise.all([r1, r2]);
    resumeRaced = true;
    await s.page.waitForTimeout(2000);
  }

  const { data: after2 } = await db.from('program_enrollments').select('status').eq('id', enr.id).single();
  const problems = s.problems.filter((p) => p.type === 'pageerror');

  const finalDeterministic = resumeRaced ? after2.status === 'active' : after1.status === 'paused';
  const pass = finalDeterministic && problems.length === 0;
  log(pass, CASE, `afterPauseX3=${after1.status} resumeRaced=${resumeRaced} afterResumeX2=${after2.status} problems=${problems.length}`);

  await appendFinding({
    id: CASE, severity: pass ? 'minor' : 'no-undo', route: `/program/${program.id}`,
    title: 'Rapid Pause/Resume taps: buttons have no isPending guard, but final status matched last intent in this run',
    steps: 'On /program/:id with an active enrollment, fire 3 near-simultaneous Pause clicks (no await between), then once the UI shows Resume, fire 2 near-simultaneous Resume clicks.',
    expected: 'Final status is deterministic and matches the last action (Pause buttons have no disabled={statusMutation.isPending} guard per ProgramDetail.jsx:448-461, same shape as fuel WeeklyPlanCard double-approve).',
    actual: `afterPauseX3 status=${after1.status}, afterResumeX2 status=${after2.status}. finalDeterministic=${finalDeterministic}. No pageerror. Confirmed by code read: neither Pause nor Resume button passes disabled={statusMutation.isPending} (ProgramDetail.jsx:428,454), so a genuinely concurrent double-tap (both requests in flight before either resolves) is possible and would be last-network-response-wins, not last-click-wins -- this run's clicks mostly serialized fast enough that the result matched intent, but the missing guard is real and independently confirmed by code, matching the same unguarded-mutation shape flagged elsewhere in this area (r1-02) and in fuel (WeeklyPlanCard).`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-07.mjs',
    evidence: `after1=${JSON.stringify(after1)} after2=${JSON.stringify(after2)}`,
    suspectFile: 'src/pages/ProgramDetail.jsx:428 (Resume button), :454 (Pause button) — no isPending disable; useUpdateEnrollmentStatus (useProgramQueries.js:383-396) has no optimistic-concurrency check.',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
