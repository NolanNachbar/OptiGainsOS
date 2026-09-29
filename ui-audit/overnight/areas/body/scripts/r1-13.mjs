// body-r1-13: read-only — cross-check the Water card's displayed goal against
// waterGoalMl(profile) using the athlete's actual current_weight/weight_unit.
// Never mutates profile (current_weight is a shared, load-bearing field).
import { start, snap, report } from '../../../drive.mjs';
import { log, getProfile } from './_lib.mjs';

const CASE = 'body-r1-13';
let s;
try {
  const profile = await getProfile();
  const w = profile?.current_weight;
  const kg = profile.weight_unit === 'kg' ? w : w / 2.205;
  const expectedGoal = Math.round((kg * 35) / 50) * 50;

  s = await start('/fuel?tab=hydration');
  await s.page.waitForTimeout(1000);
  await snap(s.page, 'r1-13-water-card');

  const bodyText = await s.page.locator('body').innerText();
  const m = bodyText.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*ml/i);
  const displayedGoal = m ? Number(m[2].replace(/,/g, '')) : null;

  const rpt = await report(s);
  const ok = displayedGoal === expectedGoal;
  log(ok, CASE, `profileWeight=${w}${profile.weight_unit} expectedGoal=${expectedGoal} displayedGoal=${displayedGoal}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: "Water card's displayed goal does not match waterGoalMl(profile) formula",
      severity: 'engine', route: '/fuel?tab=hydration',
      steps: `Read profile.current_weight (${w} ${profile.weight_unit}) and cross-check the Water card's "{total} / {goal} ml" label against waterGoalMl().`,
      expected: `goal = round(kg*35/50)*50 = ${expectedGoal}ml`,
      actual: `Displayed goal = ${displayedGoal}ml`,
      suspectFile: 'src/pages/Supplements.jsx:24-30',
    })}`);
  } else {
    console.log(`NOTE ${CASE}: personalized-goal happy path verified (${expectedGoal}ml). The DEFAULT_WATER_GOAL_ML=3000 fallback path (profile.current_weight unset) was NOT exercised — doing so would require nulling the shared account's current_weight, which the case spec explicitly forbids (WeighInPrompt/MorningCheckin/other cases depend on it). Flagging as a wish-list gap: no UI text distinguishes "personalized" vs "generic default" goal, so the fallback is silent either way.`);
  }
} finally {
  if (s) await s.close();
}
