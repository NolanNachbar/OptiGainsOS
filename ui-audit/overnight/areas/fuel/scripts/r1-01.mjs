// fuel-r1-01: selectedDate never advances at local midnight while the tab stays open.
import { snap, report } from '../../../drive.mjs';
import { startWithClock, log, cleanupByTag, taggedRows, dismissKeyboard } from './_lib.mjs';

const CASE = 'fuel-r1-01';
const DAY_D = '2026-09-30';   // Wed
const DAY_D1 = '2026-10-01';  // Thu
let s;
try {
  s = await startWithClock('/fuel', new Date(`${DAY_D}T23:55:00-06:00`));

  // Cross midnight with no reload / no navigation.
  await s.page.clock.setFixedTime(new Date(`${DAY_D1}T00:10:00-06:00`));
  await s.page.waitForTimeout(300);

  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);

  // Whatever the dialog says it's logging to, right after crossing midnight
  // and before any typing/navigation.
  const dialogHeader = await s.page.locator('text=Logging to').innerText().catch(() => '');
  const showsStaleDay = /Sep 30/.test(dialogHeader);
  const showsNewDay = /Oct 1|Thu/.test(dialogHeader);

  await s.page.getByRole('button', { name: 'Manual entry' }).click();
  await s.page.waitForTimeout(200);
  await s.page.locator('#food_name').fill(`OVN-${CASE} midnight snack`);
  await s.page.locator('#calories').fill('100');
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-01-before-submit');

  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 });
  await s.page.waitForTimeout(1200);

  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  const loggedDate = rows?.[0]?.date;
  const eatenAt = rows?.[0]?.eaten_at;
  const staleDate = loggedDate === DAY_D;
  // Bug if it silently logged to the stale date's `date` field AND the dialog
  // gave no indicator this was no longer "today" (eaten_at itself is a real
  // UTC instant and is correct regardless — it's the `date` grouping key,
  // used for daily/weekly totals, that's stale).
  const ok = rows?.length === 1 && (!staleDate || showsNewDay);
  log(ok, CASE, `rows=${rows?.length} date=${loggedDate} eaten_at=${eatenAt} dialogHeader="${dialogHeader.trim()}" showsStaleDay=${showsStaleDay} showsNewDay=${showsNewDay} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: crossing local midnight (${DAY_D} 23:55 -> ${DAY_D1} 00:10) with the Fuel tab left open (no reload/navigation) leaves selectedDate stuck on ${DAY_D}. The Add Food dialog still reads "${dialogHeader.trim()}" and the saved row's date=${loggedDate} (should be ${DAY_D1}), even though eaten_at=${eatenAt} correctly captures the real Oct-1 00:10 instant. The entry is misattributed to the wrong day in daily/weekly totals with zero on-screen indication. src/pages/FoodTracker.jsx:202 selectedDate = useState(...) never re-derives from a live clock.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
