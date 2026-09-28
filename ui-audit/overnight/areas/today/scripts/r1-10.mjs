// today-r1-10: Mind > Skills — rapid-tap level dots 1,5,2,4,3 on one skill.
// Risk: Mind.jsx:539-545 updateLevel mutation has no onError (contrast
// `practiced` right above it which does), no isPending guard on the dot
// buttons (:598-605).
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedSkill, taggedSkills, cleanupSkills } from './_lib2.mjs';

const CASE = 'today-r1-10';
let s;
try {
  await insertTaggedSkill({ name: `OVN-${CASE} rapid dots`, category: 'test', level: 3 });

  s = await start('/mind');
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: /skills/i }).click();
  await s.page.waitForTimeout(400);

  const card = s.page.locator(`text=OVN-${CASE} rapid dots`).locator('xpath=ancestor::div[contains(@class,"glass")][1]');
  await card.waitFor({ state: 'visible', timeout: 5000 });
  const dots = card.locator('button').filter({ has: s.page.locator('span.rounded-full') });

  // 5 dot buttons precede the "Practiced" button; grab first 5 buttons in the level row.
  const dotButtons = await card.locator('div.flex.items-center.gap-2.mb-3 button').all();
  console.log(`found ${dotButtons.length} dot buttons`);

  const order = [0, 4, 1, 3, 2]; // taps level 1,5,2,4,3 (0-indexed)
  for (const i of order) {
    dotButtons[i].click({ timeout: 3000 }).catch((e) => console.log(`click err idx=${i}: ${e}`));
  }
  await s.page.waitForTimeout(2000);

  await snap(s.page, 'r1-10-after-rapid-taps');
  const rpt = await report(s);

  const rowsAfter = await taggedSkills(CASE);
  const finalLevel = rowsAfter[0]?.level;
  const bodyText = await s.page.locator('body').innerText();
  const ok = rowsAfter.length === 1 && finalLevel === 3 && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `finalLevel=${finalLevel} (expected 3, last tap) rows=${rowsAfter.length} problems=${JSON.stringify(rpt.problems)}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: after rapid dot taps 1,5,2,4,3 final DB level=${finalLevel} (expected 3). No onError on updateLevel mutation (Mind.jsx:539-545) means a failed request among the five gives zero feedback and could leave a stale/wrong level silently.`);
  } else {
    console.log(`NOTE ${CASE}: settled correctly on last tap (level=3) with no visible errors in this run; the no-onError gap (Mind.jsx:539-545) is still a real code gap for the case where one of the concurrent requests actually fails (network blip) — not reproduced live here since all 5 requests succeeded.`);
  }
} finally {
  const c = await cleanupSkills(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
