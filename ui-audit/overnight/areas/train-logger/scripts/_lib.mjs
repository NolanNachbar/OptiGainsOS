// Shared setup/cleanup for train-logger r1 attack scripts.
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

// Creates a tagged library workout (title carries the case id so all rows this
// case touches can be found again by workout_id and deleted at the end).
export async function makeWorkout(caseId, exercises) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('workouts').insert({
    created_by: uid,
    title: `OVN-${caseId} Test Workout`,
    exercises,
  }).select().single();
  if (error) throw error;
  return data;
}

export function benchExercise(sets = 1) {
  return [{
    name: 'Bench Press',
    sets: Array.from({ length: sets }, (_, i) => ({ set_number: i + 1, weight: null, reps: null, completed: false })),
  }];
}

// Deletes every row this case could have created, keyed off the workout id.
export async function cleanup(caseId, workoutId) {
  const db = await testDb();
  const r = { workout_logs: 0, workout_sessions: 0, workout_schedules: 0, workouts: 0 };
  if (workoutId) {
    const a = await db.from('workout_logs').delete().eq('workout_id', workoutId).select('id');
    r.workout_logs = a.data?.length || 0;
    const b = await db.from('workout_sessions').delete().eq('workout_id', workoutId).select('id');
    r.workout_sessions = b.data?.length || 0;
    const c = await db.from('workout_schedules').delete().eq('workout_id', workoutId).select('id');
    r.workout_schedules = c.data?.length || 0;
    const d = await db.from('workouts').delete().eq('id', workoutId).select('id');
    r.workouts = d.data?.length || 0;
  }
  return r;
}

// Number inputs here don't support the selection API (selectionStart is null),
// so triple-click does not select-all; Playwright's locator.selectText() does.
export async function setNumberField(page, locator, value) {
  await locator.click();
  await locator.selectText();
  await page.keyboard.press('Backspace');
  if (value !== '') await page.keyboard.type(String(value));
  await page.waitForTimeout(350);
}

// exIndex selects which exercise card when the workout has more than one
// (multiple exercises each restart set numbering at 1, so the aria-label alone
// is ambiguous).
export async function checkSet(page, n, exIndex = 0) {
  await page.locator(`[aria-label="Mark set ${n} complete"]`).nth(exIndex).click();
  await page.waitForTimeout(300);
}

export async function startLogging(page) {
  await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();
  await page.waitForTimeout(500);
}

export async function finishWorkout(page) {
  await page.locator('[aria-label*="Mark set"]').first().waitFor({ state: 'attached' }).catch(() => {});
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
}

export function log(pass, title, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${title} :: ${detail}`);
}
