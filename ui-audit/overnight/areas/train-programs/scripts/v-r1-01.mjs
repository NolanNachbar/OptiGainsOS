// VERIFY r1-01: (a) as deployed, (b) notes stripped (post-migration) + 2nd POST aborted (network drop mid-save).
import { start, cleanupCase, seedProgram, getProgramWorkouts, stripNotesRoute } from './_lib.mjs';
const NN = '01';
async function run(mode) {
  let s;
  try {
    const { program, workouts } = await seedProgram(NN, { days: [1,2,3].map(i => ({ day_index: i, title: `Day ${i}`, exercises: [{ name: `OVN-tp-${NN} Ex${i}`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] })), daysPerWeek: 3 });
    s = await start(`/program-builder?edit=${program.id}`);
    await s.page.waitForTimeout(1500);
    if (mode === 'b') {
      await stripNotesRoute(s.page);
      let posts = 0;
      await s.page.route('**/rest/v1/program_workouts*', async (route) => {
        if (route.request().method() === 'POST' && ++posts === 2) return route.abort('internetdisconnected');
        return route.fallback();
      });
    }
    for (let i = 0; i < 3; i++) { await s.page.getByRole('button', { name: 'Next' }).click().catch(() => {}); await s.page.waitForTimeout(600); }
    await s.page.getByRole('button', { name: /Update Program/ }).click();
    await s.page.waitForTimeout(3500);
    const body = await s.page.locator('body').innerText();
    const after = await getProgramWorkouts(program.id);
    console.log(`mode=${mode} before=${workouts.length} after=${after.length} failToast=${/Failed to update program/.test(body)} okToast=${/Program updated/.test(body)} http=${JSON.stringify(s.problems.filter(p=>p.type==='http').map(p=>p.status))}`);
  } finally {
    console.log('cleanup', JSON.stringify(await cleanupCase(NN)));
    if (s) await s.close();
  }
}
await run('a');
await run('b');
