// Regression for train-programs-r1-nav-cta-overlap: ProgramDetail's fixed
// mobile bottom CTA ("Start Program") sat under the bottom nav dock
// (z-[9999]), so a real tap at the bottom edge was intercepted by the dock
// instead of reaching the button. Fix: the bar's paddingBottom now reserves
// --dock-total-height (same token CreateWorkout.jsx uses), lifting the button
// clear of the dock.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const TITLE = 'OVN-r1-nav-cta-overlap program';

async function cleanup(uid, db) {
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `${TITLE}%`);
  const progIds = (progs || []).map((p) => p.id);
  if (progIds.length) {
    await db.from('program_enrollments').delete().in('program_id', progIds);
    await db.from('program_workouts').delete().in('program_id', progIds);
    await db.from('programs').delete().in('id', progIds);
  }
}

test('the fixed mobile bottom CTA is not covered by the nav dock and registers a real tap', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title: TITLE, schema_version: 2, num_cycles: 1,
    duration_weeks: 1, days_per_week: 1, focus: 'strength',
  }).select().single();
  if (pErr) throw pErr;
  await db.from('program_workouts').insert({
    program_id: program.id, created_by: uid, day_index: 1, title: 'Day 1',
    focus: 'strength', exercises: [{ name: 'OVN-nav-cta Ex', sets: 3, rep_target: '5' }],
  });

  try {
    await signIn(page, `/program/${program.id}`);
    await page.waitForTimeout(1000);

    // The mobile fixed CTA is the first "Start Program" button in DOM order
    // (it's rendered above the header card); a real (non-forced) click must
    // land on it without the nav dock intercepting the pointer event.
    const mobileCta = page.getByRole('button', { name: 'Start Program', exact: true }).first();
    await expect(mobileCta).toBeVisible();
    await mobileCta.click({ timeout: 5000 }); // no `force` — must not be intercepted

    await expect(page.getByRole('heading', { name: /Start.*Program|Enroll/i })).toBeVisible({ timeout: 5000 })
      .catch(async () => {
        // Fall back to asserting the dialog opened via its Cancel/Start controls.
        await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
      });
  } finally {
    await cleanup(uid, db);
  }
});
