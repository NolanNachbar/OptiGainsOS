// body-r1-08: MorningCheckin — readiness + soreness commit even when the
// weight write fails. Force the weight write to fail via page.route abort on
// body_weight_entries, verify toast doesn't overclaim/underclaim.
import { start, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, readinessByDate, sorenessByDate, weightRowsByDate, deleteReadinessByDate, deleteSorenessByDate, deleteWeightByDate, todayStr } from './_lib.mjs';

const CASE = 'body-r1-08';
const today = todayStr();
let s;
try {
  await deleteReadinessByDate(today);
  await deleteSorenessByDate(today);
  await deleteWeightByDate(today);

  s = await start('/today');
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(300);

  // Abort only the body_weight_entries write so readiness/soreness upserts
  // (Supabase REST calls to different table paths) still succeed.
  await s.page.route('**/rest/v1/body_weight_entries*', (route) => route.abort('failed'));

  // Find and expand the check-in form.
  const checkInBtn = s.page.getByRole('button', { name: /check in/i }).first();
  await checkInBtn.waitFor({ state: 'visible', timeout: 15000 });
  await checkInBtn.click();
  await s.page.waitForTimeout(500);

  // Energy / Mood sliders or buttons — try common patterns.
  const energyCtl = s.page.getByRole('button', { name: /^7$/ }).first();
  if (await energyCtl.count()) await energyCtl.click().catch(() => {});
  const moodCtl = s.page.getByRole('button', { name: /^8$/ }).first();
  if (await moodCtl.count()) await moodCtl.click().catch(() => {});

  // Cycle Quads soreness pill to "Moderate" (None -> Mild -> Moderate = 2 taps).
  const quadsPill = s.page.getByRole('button', { name: /quads/i }).first();
  await quadsPill.waitFor({ state: 'visible', timeout: 10000 });
  await quadsPill.click();
  await s.page.waitForTimeout(150);
  await quadsPill.click();
  await s.page.waitForTimeout(150);

  // Weight field.
  const weightInput = s.page.getByLabel(/Bodyweight in/i).first();
  if (await weightInput.count()) {
    await weightInput.fill('180');
  }
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-08-before-submit');

  const submitBtn = s.page.getByRole('button', { name: /^check in$/i }).last();
  await submitBtn.click();
  await s.page.waitForTimeout(2000);

  await snap(s.page, 'r1-08-after-submit');
  const bodyText = await s.page.locator('body').innerText();
  const toastMatch = /didn.?t log|failed to log weight|weight.*fail/i.test(bodyText);

  await s.page.unroute('**/rest/v1/body_weight_entries*');
  const rpt = await report(s);

  const readiness = await readinessByDate(today);
  const soreness = await sorenessByDate(today);
  const weightRows = await weightRowsByDate(today);

  const readinessOk = readiness && readiness.energy === 7 && readiness.mood === 8;
  const sorenessOk = soreness.some(r => r.muscle_group?.toLowerCase() === 'quads' && r.level === 2);
  const weightAbsent = weightRows.length === 0;

  const ok = readinessOk && sorenessOk && weightAbsent;
  log(ok, CASE, `readiness=${JSON.stringify(readiness)} sorenessQuads=${JSON.stringify(soreness.find(r=>r.muscle_group?.toLowerCase()==='quads'))} weightRows=${weightRows.length} toastMentionsFailure=${toastMatch}`);

  if (!ok || !toastMatch) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'Check-in with a forced weight-write failure: verify readiness/soreness commit and toast wording is accurate',
      severity: (!readinessOk || !sorenessOk) ? 'data-loss' : (weightRows.length ? 'engine' : 'error-msg'),
      route: '/today',
      steps: "Abort the body_weight_entries POST/PATCH via network intercept. Open check-in, set Energy=7 Mood=8, Quads=Moderate, weight=180. Tap Check In.",
      expected: "Toast communicates partial success (readiness/soreness saved, weight didn't log). daily_readiness and soreness_logs rows exist for today; no body_weight_entries row does.",
      actual: `readinessOk=${readinessOk} sorenessOk=${sorenessOk} weightRowsPresent=${weightRows.length} toastMentionsFailure=${toastMatch}`,
      suspectFile: 'src/components/dashboard/MorningCheckin.jsx:121-195',
    })}`);
  }
} finally {
  await deleteReadinessByDate(today);
  await deleteSorenessByDate(today);
  const c = await deleteWeightByDate(today);
  console.log(`CLEANUP ${CASE} weightDeleted=${c} readiness+soreness cleared`);
  if (s) await s.close();
}
// NOTE (post-run): the timeout above is itself the finding — see
// findings-r1-1.json body-r1-08. /today suppresses PrescribedSessionCard
// (which hosts MorningCheckin) whenever an in-progress workout session exists
// AND today has no engine prescription (Today.jsx:500: `!(activeSession &&
// !prescription)`), with no alternate route to the check-in form anywhere in
// the app. Two in-progress workout_sessions rows exist on the shared test
// account right now (one tagged OVN-r1-03 Lift, a leftover from an earlier
// train-logger round; one untagged, possibly another agent's active work) —
// per ground rules neither was touched/deleted. This makes r1-08 and r1-09
// unreachable through the real UI in the current harness state.
