// body-r1-07: backfilling a past-dated weigh-in from Progress must not
// overwrite profile.current_weight (only a same-day write should).
import { start, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, deleteWeightByDate, weightRowsByDate, getProfile, setCurrentWeight, dateOffset } from './_lib.mjs';

const CASE = 'body-r1-07';
const date = dateOffset(-5);
let s;
let originalWeight;
try {
  await deleteWeightByDate(date);
  const before = await getProfile();
  originalWeight = before.current_weight;
  console.log(`SETUP current_weight before = ${before.current_weight}`);

  s = await start('/fuel?tab=body');
  await s.page.locator('summary:has-text("Log Weight")').click();
  await s.page.waitForTimeout(300);
  await s.page.locator('input[type="date"]').first().fill(date);
  const distinctWeight = before.current_weight - 10;
  await s.page.locator('input[type="number"]').first().fill(String(distinctWeight));
  await s.page.getByPlaceholder('Morning, fasted...').fill(`OVN-${CASE}-backfill`);
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-07-before-submit');
  await s.page.getByRole('button', { name: 'Log', exact: true }).click();
  await s.page.waitForTimeout(1200);

  const rpt = await report(s);
  const after = await getProfile();
  const row = (await weightRowsByDate(date))[0];

  const ok = row?.weight === distinctWeight && after.current_weight === before.current_weight;
  log(ok, CASE, `backfilledWeight=${row?.weight} profileBefore=${before.current_weight} profileAfter=${after.current_weight}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'Backfilling a past-dated weigh-in from Progress overwrote profile.current_weight',
      severity: 'engine', route: '/fuel?tab=body',
      steps: `Change Weight tab date to ${date} (5 days ago), enter a distinct weight (${distinctWeight}), tap Log.`,
      expected: 'profile.current_weight unchanged — only a same-day ("today") weigh-in should update it.',
      actual: `profile.current_weight went from ${before.current_weight} to ${after.current_weight} after a backdated entry.`,
      suspectFile: 'src/hooks/useWeighIn.js:123-126',
    })}`);
  }
} finally {
  const c = await deleteWeightByDate(date);
  if (originalWeight != null) {
    const nowProfile = await getProfile();
    if (nowProfile.current_weight !== originalWeight) {
      await setCurrentWeight(originalWeight);
      console.log(`RESTORE ${CASE} current_weight ${nowProfile.current_weight} -> ${originalWeight}`);
    }
  }
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
