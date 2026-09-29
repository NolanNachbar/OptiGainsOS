// body-r1-04: rapid double-tap delete on a water log entry — no confirm, no
// isPending guard. Tag by a distinctive amount (137ml has no natural
// duplicate source) since water_logs has no notes column.
import { start, snap, report } from '../../../drive.mjs';
import { log, newWaterLogsSince, deleteWaterIds } from './_lib.mjs';

const CASE = 'body-r1-04';
let s;
try {
  const sinceIso = new Date(Date.now() - 5000).toISOString();
  s = await start('/fuel?tab=hydration');
  await s.page.waitForTimeout(500);

  // No 137ml increment button exists (+100/+250/+500 only); use +100ml as the
  // marker entry and identify it as the newest row created after `sinceIso`.
  await s.page.getByRole('button', { name: '+100ml' }).click();
  await s.page.waitForTimeout(1000);

  const created = await newWaterLogsSince(sinceIso);
  if (created.length !== 1) throw new Error(`expected 1 new water row, got ${created.length}`);

  // Find its delete button and rapid-double-tap.
  const deleteBtn = s.page.getByRole('button', { name: 'Delete water entry' }).first();
  await deleteBtn.waitFor({ state: 'visible' });
  await Promise.all([
    deleteBtn.click({ timeout: 5000, force: true }).catch((e) => ({ err: String(e) })),
    deleteBtn.click({ timeout: 5000, force: true }).catch((e) => ({ err: String(e) })),
  ]);
  await s.page.waitForTimeout(1200);

  await snap(s.page, 'r1-04-after-double-tap');
  const rpt = await report(s);
  const remaining = await newWaterLogsSince(sinceIso);
  const bodyText = await s.page.locator('body').innerText();
  const sawConfusingError = /error|failed/i.test(bodyText.slice(0, 4000)) && !/Failed to log water/i.test(bodyText).toString();

  const ok = remaining.length === 0 && rpt.problems.filter(p => p.type === 'pageerror').length === 0;
  log(ok, CASE, `remaining=${remaining.length} pageerrors=${rpt.problems.filter(p => p.type === 'pageerror').length} problems=${JSON.stringify(rpt.problems)}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'Rapid double-tap delete on a water log entry has no isPending guard / confirm — check for crash or console error on the second tap against an already-deleted id',
      severity: rpt.problems.some(p => p.type === 'pageerror') ? 'crash' : 'minor', route: '/fuel?tab=hydration',
      steps: 'Log a water entry (+100ml). Rapid-double-tap its Delete (X) button within ~150ms.',
      expected: 'One delete happens; second tap is a harmless no-op. No crash.',
      actual: `remaining tagged rows=${remaining.length}, problems=${JSON.stringify(rpt.problems)}`,
      suspectFile: 'src/pages/Supplements.jsx:72-78,127-133',
    })}`);
  } else {
    console.log(`NOTE ${CASE}: no-confirm/no-isPending-guard gap confirmed by code inspection (map.md), but the double-tap itself caused no crash/dup-delete error here — recording as a UX/no-undo gap, not a functional bug this round.`);
  }
} finally {
  const remaining = await newWaterLogsSince(new Date(Date.now() - 60000).toISOString());
  const c = await deleteWaterIds(remaining.map(r => r.id));
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
