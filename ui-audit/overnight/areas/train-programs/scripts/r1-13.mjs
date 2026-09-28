// train-programs-r1-13: program at the import clamp ceiling (30-day cycle x
// 20 cycles = 600 programmed days) renders on WeeklySchedule / "show all
// cycles" without freezing.
import { start, log, cleanupCase, appendFinding, seedProgram, enrollDirect } from './_lib.mjs';

const CASE = 'train-programs-r1-13';
const NN = '13';

let s;
try {
  const days = [];
  for (let d = 1; d <= 30; d++) {
    days.push({ day_index: d, title: `Day ${d}`, exercises: [{ name: 'Squat', sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] });
  }
  const t0 = Date.now();
  const { program } = await seedProgram(NN, { days, numCycles: 20, durationWeeks: 20, daysPerWeek: 30 });
  const enr = await enrollDirect(NN, program.id, {});
  const seedMs = Date.now() - t0;

  s = await start(`/program/${program.id}`);
  await s.page.waitForTimeout(1500);
  const t1 = Date.now();
  const showAllBtn = s.page.getByRole('button', { name: /show all/i }).first();
  let clickedShowAll = false;
  if (await showAllBtn.count()) {
    await showAllBtn.click();
    clickedShowAll = true;
    await s.page.waitForTimeout(1500);
  }
  const renderMs = Date.now() - t1;

  const t2 = Date.now();
  await s.page.goto(s.page.url().replace(/\/program\/.*/, '/weekly-schedule'));
  await s.page.waitForTimeout(1500);
  const scheduleMs = Date.now() - t2;

  const bodyText = await s.page.locator('body').innerText();
  const hasCrashText = /something went wrong|failed to load/i.test(bodyText);
  const problems = s.problems.filter((p) => p.type === 'pageerror');
  const slow = renderMs > 4000 || scheduleMs > 4000;

  const pass = !hasCrashText && problems.length === 0 && !slow;
  log(pass, CASE, `clickedShowAll=${clickedShowAll} renderMs=${renderMs} scheduleMs=${scheduleMs} problems=${problems.length}`);

  await appendFinding({
    id: CASE, severity: pass ? 'none' : 'engine', route: `/program/${program.id}`,
    title: '30-day cycle x 20-cycle program (max import clamp, 600 programmed days) renders without freezing',
    steps: 'Seed a program at the clamp ceiling (cycle_length 30, num_cycles 20), enroll, open ProgramDetail "show all cycles" and /weekly-schedule.',
    expected: 'No freeze/crash at the clamp ceiling; both views handle 600 total programmed days without a multi-second stall.',
    actual: pass
      ? `No crash, no pageerror. show-all-cycles render ~${renderMs}ms, weekly-schedule load ~${scheduleMs}ms (clickedShowAll=${clickedShowAll}).`
      : `hasCrashText=${hasCrashText} problems=${JSON.stringify(problems)} renderMs=${renderMs} scheduleMs=${scheduleMs}`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-13.mjs',
    evidence: `seedMs=${seedMs} renderMs=${renderMs} scheduleMs=${scheduleMs}`,
    suspectFile: 'src/utils/programSchedule.js (getProgramSchedule), src/pages/ProgramDetail.jsx (showAllCycles/showAllProgression)',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
