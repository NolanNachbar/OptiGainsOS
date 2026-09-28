// Regression for train-programs-r1-01: useUpdateProgram (useProgramQueries.js)
// deleted every existing program_workouts row before recreating them, with no
// rollback. Any failed create mid-loop (gym Wi-Fi drop, a validation 400) left
// the program with FEWER days than before the edit, sometimes zero.
//
// The end-to-end UI save path is still blocked today by the known,
// not-yet-applied migration 20260928000000 (program_workouts.notes is
// missing on hosted, so every create 400s with PGRST204 regardless of this
// fix). Per the fix instructions, this test exercises the fix at the most
// honest layer available without that migration: it drives the real
// ProgramBuilder edit UI, strips `notes` from the outgoing requests (the
// same technique the verify step used to prove the bug independent of the
// migration — see areas/train-programs/scripts/_lib.mjs stripNotesRoute) so
// the requests reach a schema the new code path can actually complete
// against, then aborts the 2nd create request to simulate a real mid-save
// failure. It asserts the ORIGINAL 3 days are still present afterward — the
// exact case that used to zero out the program.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const TITLE = 'OVN-r1-01-edit program';

async function stripNotesRoute(page) {
  await page.route('**/rest/v1/program_workouts*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const data = req.postDataJSON();
      const strip = (o) => { if (o && typeof o === 'object') delete o.notes; return o; };
      const stripped = Array.isArray(data) ? data.map(strip) : strip(data);
      let url = req.url();
      if (url.includes('columns=')) {
        const u = new URL(url);
        const cols = u.searchParams.get('columns');
        if (cols) {
          const kept = cols.split(',').filter((c) => decodeURIComponent(c.replace(/^"|"$/g, '')) !== 'notes');
          u.searchParams.set('columns', kept.join(','));
          url = u.toString();
        }
      }
      await route.continue({ postData: JSON.stringify(stripped), url });
    } else {
      await route.continue();
    }
  });
}

async function cleanup(uid, db) {
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `${TITLE}%`);
  const progIds = (progs || []).map((p) => p.id);
  if (progIds.length) {
    await db.from('program_workouts').delete().in('program_id', progIds);
    await db.from('programs').delete().in('id', progIds);
  }
}

test('a failed mid-save on Update Program leaves the original days intact instead of zeroing them out', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title: TITLE, schema_version: 2, num_cycles: 1,
    duration_weeks: 1, days_per_week: 3, focus: 'strength',
  }).select().single();
  if (pErr) throw pErr;
  const days = [1, 2, 3].map((i) => ({
    program_id: program.id, created_by: uid, day_index: i, title: `Day ${i}`,
    focus: 'strength', exercises: [{ name: `OVN-r1-01 Ex${i}`, sets: 3, rep_target: '5' }],
  }));
  const { error: wErr } = await db.from('program_workouts').insert(days);
  if (wErr) throw wErr;

  try {
    await signIn(page, `/program-builder?edit=${program.id}`);
    await page.waitForTimeout(1500);

    await stripNotesRoute(page);
    let posts = 0;
    await page.route('**/rest/v1/program_workouts*', async (route) => {
      if (route.request().method() === 'POST' && ++posts === 2) {
        return route.abort('internetdisconnected');
      }
      return route.fallback();
    });

    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next' }).click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.getByRole('button', { name: /Update Program/ }).click();
    await page.waitForTimeout(3000);

    const { data: after } = await db.from('program_workouts').select('id, day_index').eq('program_id', program.id);
    // Before the fix: the delete-first loop ran unconditionally, so a create
    // failure on day 2 left 0 or 1 rows. After the fix: the create loop runs
    // first and rolls back on failure, so the original 3 rows are untouched.
    expect(after?.length).toBe(3);
    expect((after || []).map((r) => r.day_index).sort()).toEqual([1, 2, 3]);
  } finally {
    await cleanup(uid, db);
  }
});
