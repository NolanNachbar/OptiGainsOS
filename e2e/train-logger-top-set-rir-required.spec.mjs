// Top sets (set_type 'top_set', seeded from a program exercise's set_scheme)
// must carry an RIR: e1RM treats a blank RIR as 0, so an un-RIR'd top single
// reads as a max effort and stalls progression. Completing one with RIR blank
// is refused and routes to the RIR input with an inline hint (RIR is NOT
// pre-filled). RIR 0 is a valid value. Back-off sets keep RIR optional.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, ensureTodayWeighIn } from './helpers.mjs';

const CASE = 'top-set-rir-required';
const PROGRAM_TITLE = `OVN-${CASE} Program`;
const EXERCISE = `OVN-${CASE} Lift`;
const isMine = (row) => Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === EXERCISE);

async function cleanup(db, uid) {
  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const sIds = (sessions || []).filter(isMine).map((s) => s.id);
  if (sIds.length) await db.from('workout_sessions').delete().in('id', sIds);
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).eq('title', PROGRAM_TITLE);
  const pIds = (progs || []).map((p) => p.id);
  if (pIds.length) {
    // Starting the logger writes an in_progress session keyed by program_workout_id
    // (its exercises can still be empty), so match on that, not the lift name.
    const { data: pws } = await db.from('program_workouts').select('id').in('program_id', pIds);
    const pwIds = (pws || []).map((w) => w.id);
    if (pwIds.length) await db.from('workout_sessions').delete().in('program_workout_id', pwIds);
    await db.from('program_enrollments').delete().in('program_id', pIds);
    await db.from('program_workouts').delete().in('program_id', pIds);
    await db.from('programs').delete().in('id', pIds);
  }
}

// Seeds a one-day program whose lift has a top set + a back-off set, and
// returns the logger URL. Other active enrollments are paused and restored.
async function seed(db, uid) {
  await cleanup(db, uid);
  const { data: otherActive } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  if (otherActive?.length) await db.from('program_enrollments').update({ status: 'paused' }).in('id', otherActive.map((e) => e.id));
  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title: PROGRAM_TITLE, schema_version: 2, num_cycles: 4,
    duration_weeks: 4, days_per_week: 1, focus: 'strength',
  }).select().single();
  expect(pErr).toBeNull();
  const { data: pw, error: wErr } = await db.from('program_workouts').insert({
    program_id: program.id, created_by: uid, day_index: 1, title: `OVN-${CASE} Day`, focus: 'strength',
    exercises: [{
      name: EXERCISE, sets: 2, rep_target: '3', rir_target: 2,
      set_scheme: [
        { set_type: 'top_set', label: 'Top set', sets: 1, rep_target: '3', rir_target: 2, load_lbs: 200 },
        { set_type: 'back_off', label: 'Back-off', sets: 1, rep_target: '5', rir_target: 3, load_lbs: 170 },
      ],
    }],
  }).select().single();
  expect(wErr).toBeNull();
  const { data: enrollment, error: eErr } = await db.from('program_enrollments').insert({
    created_by: uid, program_id: program.id, status: 'active',
    started_at: new Date().toISOString(), current_cycle: 1, current_day_index: 1,
    current_week: 1, current_day: 1, completed_workouts: [],
  }).select().single();
  expect(eErr).toBeNull();
  return {
    url: `/workout-detail?source=program&enrollmentId=${enrollment.id}&programWorkoutId=${pw.id}`,
    restore: async () => {
      await cleanup(db, uid);
      if (otherActive?.length) await db.from('program_enrollments').update({ status: 'active' }).in('id', otherActive.map((e) => e.id));
    },
  };
}

async function open(page, url) {
  await signIn(page, url);
  await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();
  await expect(page.getByLabel('Set 1 reps in reserve')).toBeVisible();
}

test.describe('desktop inputs', () => {
  test('top set needs RIR (0 counts); back-off does not', async ({ page }) => {
    const db = await testDb();
    const uid = await testUserId();
    const removeWeighIn = await ensureTodayWeighIn(db, uid);
    const { url, restore } = await seed(db, uid);
    try {
      await open(page, url);
      const rir1 = page.getByLabel('Set 1 reps in reserve');
      const done1 = page.getByRole('checkbox', { name: 'Mark set 1 complete' });
      await expect(rir1).toHaveValue(''); // never pre-filled

      await done1.click();
      await expect(done1).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByText('RIR required on top sets')).toBeVisible();

      await rir1.fill('0');
      await expect(page.getByText('RIR required on top sets')).toBeHidden();
      await done1.click();
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 incomplete' })).toBeVisible();

      // Back-off: blank RIR completes fine.
      await expect(page.getByLabel('Set 2 reps in reserve')).toHaveValue('');
      await page.getByRole('checkbox', { name: 'Mark set 2 complete' }).click();
      await expect(page.getByRole('checkbox', { name: 'Mark set 2 incomplete' })).toBeVisible();
      await expect(page.getByText('RIR required on top sets')).toBeHidden();
    } finally {
      await restore();
      await removeWeighIn();
    }
  });
});

test.describe('keypad', () => {
  test.use({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });

  test('Done on a blank top-set RIR reopens the RIR keypad; a pill completes it', async ({ page }) => {
    const db = await testDb();
    const uid = await testUserId();
    const removeWeighIn = await ensureTodayWeighIn(db, uid);
    const { url, restore } = await seed(db, uid);
    try {
      await open(page, url);
      const sheet = page.getByRole('group', { name: 'Set entry keypad' });
      await page.getByRole('checkbox', { name: 'Mark set 1 complete' }).click();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText(/required on top sets/)).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 complete' })).toHaveAttribute('aria-checked', 'false');

      // "Done" with RIR still blank must not complete; it keeps asking.
      await sheet.getByRole('button', { name: 'Done, mark set complete' }).click();
      await expect(sheet).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 complete' })).toHaveAttribute('aria-checked', 'false');

      await sheet.getByRole('button', { name: 'RIR 0' }).click();
      await expect(sheet).not.toBeVisible();
      await expect(page.getByLabel('Set 1 reps in reserve')).toHaveValue('0');
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 incomplete' })).toBeVisible();
    } finally {
      await restore();
      await removeWeighIn();
    }
  });
});
