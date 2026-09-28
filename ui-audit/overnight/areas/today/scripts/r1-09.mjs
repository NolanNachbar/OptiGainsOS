// today-r1-09: Readiness hero (/today) vs Athlete State (/athlete-state) —
// do they read the same day's row? Read-only case (no mutation).
// Code finding (confirmed by inspection): Today.jsx:86 passes an explicit
// `today` (getTodayString(profile?.timezone)) into useAthleteState/
// useTodayPrescription, but AthleteState.jsx:43-44 calls useEngineParams()/
// useTodayPrescription() with NO date arg, so those default internally to
// getTodayString() with no timezone -> browser/device tz, not profile.timezone.
// For THIS test athlete profile.timezone is null, so both resolve to the same
// tz today and the pages will currently agree live. The divergence is latent:
// it would only surface for an athlete with profile.timezone set to something
// different from the browser's local tz (e.g. traveling).
import { start, report, snap } from '../../../drive.mjs';
import { log, latestAthleteState, todayPrescription, latestEngineParams } from './_lib2.mjs';

const CASE = 'today-r1-09';
const today = new Date().toISOString().slice(0, 10);
let s;
try {
  const state = await latestAthleteState(today);
  const rx = await todayPrescription(today);
  const eng = await latestEngineParams(today);
  console.log(`DB athlete_state.date=${state?.date} training_prescription present=${!!rx} engine_params.date=${eng?.date}`);

  s = await start('/today');
  await s.page.waitForTimeout(500);
  const heroText = await s.page.locator('.hero-metric').first().innerText().catch(() => null);

  await s.page.goto('http://localhost:5173/athlete-state');
  await s.page.waitForTimeout(2000);
  const body = await s.page.locator('body').innerText();
  const confMatch = body.match(/Model Confidence[\s\S]{0,40}?(\d+%|—)/);
  const vdotMatch = body.match(/VDOT[\s\S]{0,30}?(\d+\.\d|—)/);

  await snap(s.page, 'r1-09-athlete-state');
  const rpt = await report(s);

  console.log(`Today hero readiness text="${heroText}" | AthleteState Model Confidence="${confMatch?.[1]}" VDOT="${vdotMatch?.[1]}"`);
  const ok = rpt.problems.length === 0;
  log(ok, CASE, `problems=${rpt.problems.length}; latent divergence in date-source between Today.jsx (profile-tz-aware) and AthleteState.jsx (browser-tz, no date arg) confirmed by code, not live-reproducible since profile.timezone is null for the test athlete`);
} finally {
  if (s) await s.close();
}
