// body-r1-05: rapid double-tap delete on a supplement log entry — no confirm,
// no isPending guard (same gap pattern as water).
// body-r1-06: typing dose '0' silently falls back to default_dose instead of
// logging 0 (parseFloat(dose) || type.default_dose treats 0 as falsy).
// Combined into one script since both share one supplement_types record and
// must run back-to-back (serializeReason in cases-r1.json).
import { start, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, insertSupplementType, supplementLogsByType, deleteSupplementLogIds, deleteSupplementTypeIds } from './_lib.mjs';

const NAME = 'OVN-body-r1-05-supp';
let s, type;
try {
  type = await insertSupplementType({ name: NAME, default_dose: 5, unit: 'mg' });
  console.log(`SETUP created supplement_types id=${type.id}`);

  s = await start('/fuel?tab=hydration');
  await s.page.waitForTimeout(1500);
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(300);

  // ---- r1-05: log once, then rapid double-tap delete ----
  const CASE5 = 'body-r1-05';
  const logBtn = s.page.getByRole('button', { name: 'Log', exact: true }).first();
  await logBtn.waitFor({ state: 'visible', timeout: 15000 });
  await logBtn.click();
  await s.page.waitForTimeout(1200);

  let rowsBefore = await supplementLogsByType(type.id);
  if (rowsBefore.length !== 1) throw new Error(`expected 1 log row, got ${rowsBefore.length}`);

  const deleteLogBtn = s.page.getByRole('button', { name: 'Delete supplement log' }).first();
  await deleteLogBtn.waitFor({ state: 'visible' });
  await Promise.all([
    deleteLogBtn.click({ timeout: 5000, force: true }).catch((e) => ({ err: String(e) })),
    deleteLogBtn.click({ timeout: 5000, force: true }).catch((e) => ({ err: String(e) })),
  ]);
  await s.page.waitForTimeout(1200);
  await snap(s.page, 'r1-05-after-double-tap');
  let rpt = await report(s);
  let remaining = await supplementLogsByType(type.id);
  const ok5 = remaining.length === 0 && rpt.problems.filter(p => p.type === 'pageerror').length === 0;
  log(ok5, CASE5, `remaining=${remaining.length} problems=${JSON.stringify(rpt.problems)}`);
  if (!ok5) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE5, title: 'Rapid double-tap delete on a supplement log entry — no confirm, no isPending guard, crash/error on double delete',
      severity: rpt.problems.some(p => p.type === 'pageerror') ? 'crash' : 'minor', route: '/fuel?tab=hydration',
      steps: 'Log a supplement dose. Rapid-double-tap its Delete (X) button.',
      expected: 'One delete happens; second tap harmless. No crash.',
      actual: `remaining=${remaining.length}, problems=${JSON.stringify(rpt.problems)}`,
      suspectFile: 'src/pages/Supplements.jsx:283-289,413-419',
    })}`);
  }

  // Clean any leftover log rows from r1-05 before r1-06.
  const leftover = await supplementLogsByType(type.id);
  if (leftover.length) await deleteSupplementLogIds(leftover.map(r => r.id));

  // ---- r1-06: dose '0' should log 0, not fall back to default_dose (5) ----
  const CASE6 = 'body-r1-06';
  await s.page.reload();
  await s.page.waitForTimeout(1500);
  const doseInput = s.page.locator(`input[placeholder="5 mg"]`).first();
  await doseInput.fill('0');
  await dismissKeyboard(s.page);
  // Scope to the sibling Log button in the SAME row — a bare "first Log
  // button on the page" would hit an earlier supplement's (e.g. Creatine's
  // real "Log Again") instead of this one.
  await doseInput.locator('xpath=following-sibling::button[1]').click();
  await s.page.waitForTimeout(1200);
  await snap(s.page, 'r1-06-after-log-zero');

  const rows6 = await supplementLogsByType(type.id);
  rpt = await report(s);
  const loggedZero = rows6.length === 1 && rows6[0].dose === 0;
  const loggedDefault = rows6.length === 1 && rows6[0].dose === 5;
  const ok6 = loggedZero;
  log(ok6, CASE6, `rows=${JSON.stringify(rows6.map(r => r.dose))} loggedZero=${loggedZero} loggedDefault=${loggedDefault}`);
  if (!ok6) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE6, title: "Typing dose '0' when logging a supplement silently falls back to the default dose instead of logging 0",
      severity: 'engine', route: '/fuel?tab=hydration',
      steps: `Type '0' into the dose field for ${NAME} (default_dose=5). Tap Log.`,
      expected: 'The logged dose is 0 (explicitly typed) or the UI explains why 0 is rejected.',
      actual: `Logged row dose=${rows6[0]?.dose} (expected 0). parseFloat('0') is falsy in JS so \`dose: parseFloat(dose) || type.default_dose\` silently substitutes the default.`,
      suspectFile: 'src/pages/Supplements.jsx:264-274',
    })}`);
  }
} finally {
  let c1 = 0, c2 = 0;
  if (type) {
    const remLogs = await supplementLogsByType(type.id);
    c1 += await deleteSupplementLogIds(remLogs.map(r => r.id));
    c2 = await deleteSupplementTypeIds([type.id]);
  }
  // Orphaned logs: if a previous crashed run deleted its type before its
  // logs, supplement_type_id nulls out (FK ON DELETE SET NULL) but the row
  // survives, keyed only by supplement_name — sweep those too.
  const db = await (await import('/home/nolan/projects/OptiGains/e2e/helpers.mjs')).testDb();
  const uid = await (await import('/home/nolan/projects/OptiGains/e2e/helpers.mjs')).testUserId();
  const { data: orphans } = await db.from('supplement_logs').select('id').eq('created_by', uid).eq('supplement_name', NAME);
  if (orphans?.length) c1 += await deleteSupplementLogIds(orphans.map(r => r.id));
  console.log(`CLEANUP body-r1-05/06 logsDeleted=${c1} typeDeleted=${c2}`);
  if (s) await s.close();
}
