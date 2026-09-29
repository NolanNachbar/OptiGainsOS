// body-r1-01v (verify): single-screen double tap on Progress > Log Weight, ~100ms apart.
import { start, report } from '../../../drive.mjs';
import { log, dismissKeyboard, deleteWeightByDate, weightRowsByDate, dateOffset } from './_lib.mjs';
const CASE = 'body-r1-01v';
const date = dateOffset(-4);
let s;
try {
  const pre = await weightRowsByDate(date);
  if (pre.length) throw new Error('date not empty, abort to avoid touching others rows');
  s = await start('/fuel?tab=body');
  await s.page.locator('summary:has-text("Log Weight")').click();
  await s.page.waitForTimeout(300);
  await s.page.locator('input[type="date"]').first().fill(date);
  await s.page.locator('input[type="number"]').first().fill('183');
  await s.page.getByPlaceholder('Morning, fasted...').fill(`OVN-${CASE}`);
  await dismissKeyboard(s.page);
  const btn = s.page.getByRole('button', { name: 'Log', exact: true });
  const box = await btn.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await s.page.mouse.click(x, y);
  await s.page.waitForTimeout(100);
  await s.page.mouse.click(x, y);
  await s.page.waitForTimeout(2500);
  const rows = await weightRowsByDate(date);
  await report(s);
  log(rows.length <= 1, CASE, `rows=${rows.length} ${JSON.stringify(rows.map(r => [r.weight, r.notes]))}`);
} finally {
  const c = await deleteWeightByDate(date);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  await s?.close?.();
  process.exit(0);
}
