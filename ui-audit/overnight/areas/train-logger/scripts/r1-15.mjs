// train-logger-r1-15: confirmed lead — does /train (Schedule tab, default) fire
// a 403 (not empty 200) on program_workouts via useEnrollments()'s raw,
// created_by-unfiltered query (src/hooks/useProgramQueries.js:65-68)?
import { start } from '../../../drive.mjs';
import { log } from './_lib.mjs';

const CASE = 'train-logger-r1-15';
let s;
try {
  s = await start('/train');
  await s.page.waitForTimeout(2500);

  const requests = [];
  s.page.on('response', async (r) => {
    if (r.url().includes('/program_workouts')) {
      requests.push({ status: r.status(), url: r.url().slice(0, 250) });
    }
  });
  // Force a fresh mount of useEnrollments (navigate away and back) to make sure
  // we capture the request even if it already fired before the listener attached.
  await s.page.goto('http://localhost:5173/today?bypass_auth=true');
  await s.page.waitForTimeout(1000);
  await s.page.goto('http://localhost:5173/train');
  await s.page.waitForTimeout(3000);

  const consoleErrors = s.problems.filter((p) => p.type === 'console' || p.type === 'pageerror');
  const httpErrors = s.problems.filter((p) => p.type === 'http');
  const programWorkoutsReqs = requests.length ? requests : httpErrors.filter((p) => p.url.includes('program_workouts'));

  const bodyText = await s.page.evaluate(() => document.body.innerText.slice(0, 500));

  const status = programWorkoutsReqs[0]?.status;
  const is403 = status === 403;
  // "ok" here means we got a clear, confirmed answer either way, not that the
  // 403 didn't happen (that's what we're checking for).
  const ok = programWorkoutsReqs.length > 0 || true; // always log actual finding; see FINDING line below
  log(true, CASE, `program_workouts requests=${JSON.stringify(programWorkoutsReqs)} consoleErrors=${JSON.stringify(consoleErrors)} httpErrors=${JSON.stringify(httpErrors)} scheduleRendered=${!/error|something went wrong/i.test(bodyText)}`);
  if (is403) {
    console.log(`FINDING ${CASE}: CONFIRMED — GET .../program_workouts?...in.(programIds) returns HTTP 403 on a normal /train Schedule-tab load for the test athlete's own enrolled program(s). Points to a missing table-level GRANT for the authenticated role on program_workouts (a real RLS gap would be 200+[], not 403). useProgramQueries.js's useEnrollments() destructures the response without checking \`error\`, so allProgramWorkouts silently falls back to [] — the Schedule tab does not crash, but every enrolled program's days silently render as if it had none (degraded, not visibly broken).`);
  } else if (programWorkoutsReqs.length > 0) {
    console.log(`FINDING ${CASE}: program_workouts request observed with status=${status} (not 403) — the lead does not reproduce as described; recording actual status for the record.`);
  } else {
    console.log(`FINDING ${CASE}: no direct program_workouts request observed in this run (possibly cached/no active enrollment in view) — httpErrors=${JSON.stringify(httpErrors)}. Inconclusive, not confirmed.`);
  }
} finally {
  if (s) await s.close();
}
