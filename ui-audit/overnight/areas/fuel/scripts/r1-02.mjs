// fuel-r1-02: "Logging earlier" eaten_at across the DST fall-back transition
// (America/Denver, 2026-11-01 02:00 MDT -> 01:00 MST).
import { report } from '../../../drive.mjs';
import { startWithClock, log, cleanupByTag, taggedRows, dismissKeyboard } from './_lib.mjs';

const CASE = 'fuel-r1-02';
const DAY = '2026-11-01'; // DST falls back this Sunday in America/Denver
let s;
try {
  // Land on the DST-transition date, midday so we're not near the fold.
  s = await startWithClock('/fuel', new Date(`${DAY}T12:00:00-07:00`)); // already MST after fallback

  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Manual entry' }).click();
  await s.page.waitForTimeout(200);
  await s.page.locator('#food_name').fill(`OVN-${CASE} dst dinner`);
  await dismissKeyboard(s.page);

  // Toggle "Logging earlier" so eaten_at is derived from MEAL_DEFAULT_TIME
  // (dinner = 19:00) on the selected date, not "now".
  await s.page.getByRole('button', { name: 'Logging earlier' }).click();
  await s.page.waitForTimeout(150);
  const loggingEarlierActive = await s.page.getByRole('button', { name: 'Logging earlier' }).evaluate((el) => el.className.includes('gold'));
  console.log('loggingEarlierActive', loggingEarlierActive);
  // meal_type defaults from time-of-day (noon -> lunch); force it to dinner.
  // The Select is a plain trigger <button><span>lunch</span></button>, no
  // combobox role/aria-label — target it via the "Meal Type" label sibling.
  await s.page.locator('text=Meal Type').locator('xpath=following-sibling::*[1]').click();
  await s.page.waitForTimeout(300);
  await s.page.getByText('Dinner', { exact: true }).click();
  await s.page.waitForTimeout(150);
  await s.page.locator('#calories').fill('500');
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 });
  await s.page.waitForTimeout(1200);

  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  const eatenAt = rows?.[0]?.eaten_at;
  // Expected: 19:00 local on 2026-11-01, which (post-fallback, MST = UTC-7) is
  // 2026-11-02T02:00:00Z. If the app used a stale pre-fallback offset (MDT,
  // UTC-6) it would produce 2026-11-02T01:00:00Z instead — one hour off.
  const expectedUtc = '2026-11-02T02:00:00.000Z';
  const ok = rows?.length === 1 && eatenAt && new Date(eatenAt).toISOString() === expectedUtc;
  log(ok, CASE, `rows=${rows?.length} eaten_at=${eatenAt} expectedUtc=${expectedUtc} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: 'Logging earlier' on ${DAY} (DST fall-back date) for dinner (default 19:00 local) produced eaten_at=${eatenAt}, expected ${expectedUtc}. src/pages/FoodTracker.jsx:73-77 getEatenAt does new Date(\`\${dateStr}T\${time}:00\`).toISOString() which should use the date's own offset, but verify against actual output.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
