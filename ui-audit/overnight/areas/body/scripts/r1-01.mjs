// body-r1-01: two near-simultaneous weigh-in submits (MorningCheckin's inline
// weigh-in field + Progress Weight tab) for today's date, on two tabs of the
// same browser context. Race: useLogWeight does select-then-branch, no unique
// constraint on (created_by, recorded_date).
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { ORIGIN, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, deleteWeightByDate, weightRowsByDate, todayStr } from './_lib.mjs';

const CASE = 'body-r1-01';
const today = todayStr();
let s;
try {
  const deletedPre = await deleteWeightByDate(today);
  console.log(`PRECLEAN ${CASE} deletedExisting=${deletedPre}`);

  s = await launchIPhone({ appOrigin: ORIGIN, mode: 'standalone' });
  const problems = [];
  s.problems = problems;
  s.page.on('pageerror', (e) => problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(300);

  // Second tab in the same context (same login/session).
  const page2 = await s.context.newPage();
  await page2.goto(`${ORIGIN}/fuel?tab=body&bypass_auth=true`);
  await page2.waitForTimeout(2500);

  // Tab1 (today): MorningCheckin's own weigh-in field (aria-label "Bodyweight
  // in lbs") — present on /today regardless of the unrelated leftover
  // "Workout in progress" banner from an earlier area.
  const weighInput = s.page.getByLabel('Bodyweight in lbs', { exact: true });
  await weighInput.waitFor({ state: 'visible', timeout: 15000 });
  await weighInput.fill('182');
  await dismissKeyboard(s.page);

  // Tab2 (fuel body): Progress Weight tab — open the disclosure first.
  await page2.locator('summary:has-text("Log Weight")').click();
  await page2.waitForTimeout(300);
  const weightField = page2.locator('input[type="number"]').first();
  await weightField.fill('181');
  await page2.locator('input').filter({ hasText: '' }).nth(0); // no-op, keep linter quiet
  const notesField = page2.getByPlaceholder('Morning, fasted...');
  await notesField.fill(`OVN-${CASE}`);
  await dismissKeyboard(page2);

  // Fire both submits back-to-back, no await between clicks.
  const logWeightBtn = s.page.getByRole('button', { name: 'Log weight' });
  const logBtn = page2.getByRole('button', { name: 'Log', exact: true });
  await Promise.all([
    logBtn.click(),
    logWeightBtn.click(),
  ]);
  await s.page.waitForTimeout(2500);
  await page2.waitForTimeout(1000);

  await snap(s.page, 'r1-01-tab1-after');
  await snap(page2, 'r1-01-tab2-after');

  const rows = await weightRowsByDate(today);
  const rpt = await report(s);

  const ok = rows.length === 1;
  log(ok, CASE, `rowsForToday=${rows.length} values=${JSON.stringify(rows.map(r => ({ w: r.weight, notes: r.notes })))} problems=${rpt.problems.length}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'Two near-simultaneous weigh-in submits create duplicate body_weight_entries rows for the same date',
      severity: 'data-loss', route: '/fuel?tab=body + /today',
      steps: 'Open /today (MorningCheckin weigh-in) and /fuel?tab=body (Progress Weight tab) in two tabs of the same login. Type different weights on each, submit both within the same tick.',
      expected: 'Exactly one body_weight_entries row for today.',
      actual: `${rows.length} rows created for ${today}: ${JSON.stringify(rows.map(r => ({ id: r.id, w: r.weight, notes: r.notes })))}`,
      suspectFile: 'src/hooks/useWeighIn.js:105-121',
    })}`);
  }

  await page2.close();
} finally {
  const remaining = await weightRowsByDate(today);
  const ids = remaining.filter(r => r.notes?.includes(CASE) || true).map(r => r.id);
  // Clean ALL of today's rows this case touched (both the tagged one and any
  // untagged duplicate from MorningCheckin, since this case's whole point is
  // duplicate creation) — restore to baseline (no row for today).
  const { deleteWeightIds } = await import('./_lib.mjs');
  const c = await deleteWeightIds(ids);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
