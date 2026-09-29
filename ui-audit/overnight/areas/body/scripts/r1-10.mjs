// body-r1-10: Physique guided session — reload mid-multi-photo-queue BEFORE
// tapping Analyze must lose no data (nothing uploads until Analyze). Verify
// empirically: no physique_entries rows, no storage objects.
import { start, snap, report } from '../../../drive.mjs';
import { log, physiqueEntriesSince, listPhysiqueStorage } from './_lib.mjs';
import { testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'body-r1-10';
const SCRATCH = '/tmp/claude-1000/-home-nolan-projects-SkyWyo/d06355e5-2a10-4383-9ef1-2cf100418235/scratchpad';
let s;
try {
  const sinceIso = new Date(Date.now() - 5000).toISOString();
  const uid = await testUserId();
  const storageBefore = await listPhysiqueStorage(uid);

  s = await start('/physique');
  await s.page.waitForTimeout(1000);

  await s.page.getByRole('button', { name: /guided session/i }).click();
  await s.page.waitForTimeout(500);

  const fileInput = s.page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    `${SCRATCH}/ovn-body-0.jpg`,
    `${SCRATCH}/ovn-body-1.jpg`,
    `${SCRATCH}/ovn-body-2.jpg`,
  ]);
  await s.page.waitForTimeout(1000);
  await snap(s.page, 'r1-10-review-sheet-shot1');

  // Reload BEFORE tapping Analyze.
  await s.page.reload();
  await s.page.waitForTimeout(2000);
  await snap(s.page, 'r1-10-after-reload');

  const rpt = await report(s);
  const entries = await physiqueEntriesSince(sinceIso);
  const storageAfter = await listPhysiqueStorage(uid);
  const newObjects = storageAfter.filter(o => !storageBefore.some(b => b.name === o.name));

  const ok = entries.length === 0 && newObjects.length === 0;
  log(ok, CASE, `entries=${entries.length} newStorageObjects=${JSON.stringify(newObjects.map(o=>o.name))} problems=${rpt.problems.length}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'Reload mid guided-session photo queue (before Analyze) leaves orphaned data',
      severity: entries.length ? 'data-loss' : 'minor', route: '/physique',
      steps: 'Open /physique, tap Guided session, select 3 photos at once, on the review sheet for shot 1 of 3 reload the page before tapping Analyze.',
      expected: 'No physique_entries rows and no storage objects exist from the reload — queue state is client-only until Analyze is confirmed.',
      actual: `entries=${entries.length}, new storage objects=${JSON.stringify(newObjects.map(o=>o.name))}`,
      suspectFile: 'src/pages/PhysiqueTracker.jsx:163-194,213-223',
    })}`);
  }

  // Cleanup any accidental writes.
  if (entries.length) {
    const { deletePhysiqueIds } = await import('./_lib.mjs');
    await deletePhysiqueIds(entries.map(e => e.id));
  }
  if (newObjects.length) {
    const { removePhysiqueStorage } = await import('./_lib.mjs');
    await removePhysiqueStorage(newObjects.map(o => `${uid}/${o.name}`));
  }
  console.log(`CLEANUP ${CASE} entriesDeleted=${entries.length} storageDeleted=${newObjects.length}`);
} finally {
  if (s) await s.close();
}
