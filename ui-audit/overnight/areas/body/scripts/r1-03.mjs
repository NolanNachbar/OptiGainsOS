// body-r1-03: Measurements tab inserts a new row per save (no upsert-by-date),
// unlike Weight. Save twice for the same date and check History + Latest.
import { start, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, measurementRowsByNote, deleteMeasurementIds, todayStr } from './_lib.mjs';

const CASE = 'body-r1-03';
const today = todayStr();
let s;
try {
  s = await start('/fuel?tab=body');
  await s.page.getByRole('button', { name: 'Measurements' }).click();
  await s.page.waitForTimeout(500);

  const chestInput = s.page.locator('input[type="number"]').first();

  // Save #1 (AM)
  await chestInput.fill('100');
  await s.page.getByPlaceholder('Notes (optional)').fill(`OVN-${CASE}-am`);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Save Entry' }).click();
  await s.page.waitForTimeout(1200);

  // Save #2 (PM), same date, immediately after
  await chestInput.fill('101');
  await s.page.getByPlaceholder('Notes (optional)').fill(`OVN-${CASE}-pm`);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Save Entry' }).click();
  await s.page.waitForTimeout(1200);

  await snap(s.page, 'r1-03-after-both-saves');
  const bodyText = await s.page.locator('body').innerText();
  const latestShowsPm = /101/.test(bodyText.split('Latest')[1]?.slice(0, 200) || '');

  const rows = await measurementRowsByNote(`OVN-${CASE}%`);
  const rpt = await report(s);

  const ok = rows.length === 1; // one row if upserted; bug if two
  log(ok, CASE, `rows=${rows.length} dates=${JSON.stringify(rows.map(r => ({ id: r.id, date: r.date, chest: r.chest_cm, notes: r.notes })))} latestShowsPm=${latestShowsPm}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: "Measurements tab inserts a new row per save instead of upserting-by-date like Weight does",
      severity: 'engine', route: '/fuel?tab=body',
      steps: `Open Fuel > Body > Measurements tab. Enter Chest=100, save for today. Immediately enter Chest=101, save again for the SAME date.`,
      expected: 'Either the second save updates the same day entry, or the Latest card deterministically shows the most recently saved value.',
      actual: `${rows.length} rows exist for date=${today}: ${JSON.stringify(rows.map(r => ({ chest: r.chest_cm, notes: r.notes })))}. Latest card ${latestShowsPm ? 'showed' : 'did NOT show'} the most recent (101) value.`,
      suspectFile: 'src/pages/Progress.jsx:209-222 (insert, no upsert), :202 (order by date only, no secondary sort)',
    })}`);
  }
} finally {
  const rows = await measurementRowsByNote(`OVN-${CASE}%`);
  const c = await deleteMeasurementIds(rows.map(r => r.id));
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
