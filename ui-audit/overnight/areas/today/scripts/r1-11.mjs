// today-r1-11: Mind > Skills — mark "Practiced" while offline. Control case:
// confirm the onError toast (Mind.jsx:530-536 does have onError, unlike
// updateLevel) actually fires end-to-end and no optimistic UI runs ahead.
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedSkill, taggedSkills, cleanupSkills } from './_lib2.mjs';

const CASE = 'today-r1-11';
let s;
try {
  await insertTaggedSkill({ name: `OVN-${CASE} offline practiced`, category: 'test', level: 2 });

  s = await start('/mind');
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: /skills/i }).click();
  await s.page.waitForTimeout(400);

  const card = s.page.locator(`text=OVN-${CASE} offline practiced`).locator('xpath=ancestor::div[contains(@class,"glass")][1]');
  await card.waitFor({ state: 'visible', timeout: 5000 });

  const before = await taggedSkills(CASE);
  console.log(`before last_practiced_at=${before[0]?.last_practiced_at}`);

  await s.context.setOffline(true);
  await card.getByRole('button', { name: /practiced/i }).click();
  await s.page.waitForTimeout(4000); // stay offline; a real onError would have fired by now

  await snap(s.page, 'r1-11-offline-practiced');
  const bodyTextWhileOffline = await s.page.locator('body').innerText();
  const sawFailToastWhileOffline = /Failed to update/i.test(bodyTextWhileOffline);
  const cardTextWhileOffline = await card.innerText();

  const duringOffline = await taggedSkills(CASE);
  const dbUnchangedWhileOffline = duringOffline[0]?.last_practiced_at === before[0]?.last_practiced_at;

  await s.context.setOffline(false);
  await s.page.waitForTimeout(2500); // let a react-query paused mutation resume if that's what's happening

  const rpt = await report(s);
  const after = await taggedSkills(CASE);
  const dbChangedAfterReconnect = after[0]?.last_practiced_at !== before[0]?.last_practiced_at;

  // Expected per the case: a clear "Failed to update" toast while offline, no DB
  // change, no false "just practiced" UI. Actual (react-query default
  // networkMode:'online'): the mutation PAUSES while offline (no error, no
  // toast, no optimistic UI) and silently fires once connectivity returns.
  const matchesExpectation = dbUnchangedWhileOffline && sawFailToastWhileOffline;
  log(matchesExpectation, CASE, `dbUnchangedWhileOffline=${dbUnchangedWhileOffline} sawFailToastWhileOffline=${sawFailToastWhileOffline} dbChangedAfterReconnect=${dbChangedAfterReconnect} cardTextWhileOffline="${cardTextWhileOffline.replace(/\s+/g, ' ').slice(0,120)}" problems=${rpt.problems.length}`);
  console.log(`FINDING ${CASE}: tapping "Practiced" while offline does NOT show the onError "Failed to update" toast (Mind.jsx:536) and does NOT fail — react-query's default mutation networkMode pauses the mutation while offline (no error, no optimistic UI, no "queued" indicator either) and it silently fires and succeeds once connectivity returns (${dbChangedAfterReconnect ? 'confirmed: DB updated after reconnect' : 'DB not yet updated after reconnect wait'}). The onError handler on this mutation is effectively dead code for real offline use — it only helps a genuine server-side error, not a connectivity drop, which is the more common real-world offline case at a gym.`);
} finally {
  const c = await cleanupSkills(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
