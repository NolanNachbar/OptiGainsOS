// Regression for train-programs-r1-14: React Query's default networkMode
// pauses (not fails) useEnrollInProgram while offline, so onError ("Failed to
// enroll", ProgramDetail.jsx) never fires. The Start Program button in the
// Enroll dialog sat on "Starting..." for the whole outage with no signal that
// anything was different from a normal slow save. Fix mirrors fuel f2590dcd:
// while paused, the button reads an honest offline message.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-14';
const TITLE = `OVN-${CASE} program`;

async function cleanup(uid, db) {
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `${TITLE}%`);
  const progIds = (progs || []).map((p) => p.id);
  if (progIds.length) {
    await db.from('program_enrollments').delete().in('program_id', progIds);
    await db.from('program_workouts').delete().in('program_id', progIds);
    await db.from('programs').delete().in('id', progIds);
  }
}

test('offline enroll shows an honest offline message instead of stuck "Starting..."', async ({ page, context }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title: TITLE, schema_version: 2, num_cycles: 1,
    duration_weeks: 1, days_per_week: 1, focus: 'strength',
  }).select().single();
  if (pErr) throw pErr;
  const { error: wErr } = await db.from('program_workouts').insert({
    program_id: program.id, created_by: uid, day_index: 1, title: 'Day 1',
    focus: 'strength', exercises: [{ name: `OVN-${CASE} Ex`, sets: 3, rep_target: '5' }],
  });
  if (wErr) throw wErr;

  try {
    await signIn(page, `/program/${program.id}`);
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /Start Program/ }).first().click();
    await page.waitForTimeout(300);

    await context.setOffline(true);
    try {
      // Two "Start Program" CTAs (header + mobile fixed bar) plus the dialog's
      // own confirm button all share the label — the dialog's is last in DOM order.
      const startBtn = page.getByRole('button', { name: 'Start Program', exact: true }).last();
      await startBtn.click({ timeout: 5000, force: true });

      await expect(page.getByText("Offline - starts when you're back online")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Starting...')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }

    // Reconnect: the paused mutation resumes on its own and the enrollment lands.
    await expect.poll(async () => {
      const { data } = await db.from('program_enrollments').select('id').eq('program_id', program.id);
      return data?.length ?? 0;
    }, { timeout: 10000 }).toBe(1);
  } finally {
    await context.setOffline(false).catch(() => {});
    await cleanup(uid, db);
  }
});
