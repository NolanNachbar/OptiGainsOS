// Review r4f BLOCKER: Phase A moved Cancel workout / Calculators out of
// WorkoutLoggingHeader entirely and onto the focused exercise's own kebab,
// updating WorkoutDetail.jsx to match but never QuickWorkout.jsx -- Cancel
// workout and Calculators were completely unreachable mid-session on
// /quick-workout, with nothing in the UI even hinting they existed. This
// proves Cancel is reachable again: kebab -> "Cancel workout" -> the confirm
// dialog appears. It then dismisses via "Keep Going" -- the real assertion
// is reachability, not that cancelling actually works (cancelSession() is a
// one-line status update already covered structurally; this test must not
// destroy the test account's session data).
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, ensureTodayWeighIn } from './helpers.mjs';

const CASE = 'qwcancel-1';
const EXERCISE = `OVN-${CASE} Lift`;

async function cleanup(uid) {
  const db = await testDb();
  // Quick-workout sessions carry no workout_id/program_workout_id. Any
  // in-progress one left on the test account (this test's own empty session
  // if a step failed before the exercise was added, or a stale one from an
  // earlier interrupted run) surfaces as a silent "Resume Workout?" prompt on
  // the next run and blocks it -- so this clears every in-progress
  // quick-workout session for the test user, not just ones matching this
  // test's own marker exercise. The test account has no real, work-losing
  // quick-workout session to protect (see helpers.mjs: athlete@local.test is
  // e2e-only), so this is safe.
  await db
    .from('workout_sessions')
    .delete()
    .eq('created_by', uid)
    .eq('status', 'in_progress')
    .is('workout_id', null)
    .is('program_workout_id', null);
}

test('Cancel workout is reachable from QuickWorkout mid-session and shows a confirm dialog', async ({ page }) => {
  const uid = await testUserId();
  // Clear any stray in-progress quick-workout session up front too (not just
  // in `finally`) -- a run that crashed before cleanup would otherwise leave
  // one behind that silently intercepts this run's first interactions
  // behind an un-dismissable "Resume Workout?" scrim.
  await cleanup(uid);
  const removeSeededWeighIn = await ensureTodayWeighIn(await testDb(), uid);

  try {
    await signIn(page, '/quick-workout');

    // checkForActiveSession resolves asynchronously after mount, so the
    // "Resume Workout?" prompt (when one exists) can pop in a beat after the
    // empty canvas first renders -- race the two so a same-tick isVisible()
    // check can't miss it and leave it to silently intercept later clicks.
    const resumeHeading = page.getByRole('heading', { name: 'Resume Workout?' });
    const nameFieldProbe = page.getByPlaceholder('Exercise name');
    await expect(resumeHeading.or(nameFieldProbe)).toBeVisible({ timeout: 10000 });
    if (await resumeHeading.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Start Fresh' }).click();
      await expect(nameFieldProbe).toBeVisible();
    }

    // Enter (not a click on "Add exercise") -- the Combobox's own
    // suggestion dropdown opens on input and, while open, its
    // outside-pointer-close listener can eat the very click meant for the
    // Add button beneath it. Enter closes the dropdown and commits through
    // the same handleAdd path with no such race.
    const nameField = page.getByPlaceholder('Exercise name');
    await nameField.fill(EXERCISE);
    await nameField.press('Enter');
    await expect(page.getByText(EXERCISE)).toBeVisible();

    // The exercise card's coaching-insight banner arrives asynchronously
    // (a real fetch keyed off unrelated exercise history on this shared test
    // account -- e.g. "Weighted Pull-up") ABOVE the exercise list, and the
    // kebab menu only computes its fixed position once, off the trigger's
    // rect, when it opens -- it doesn't re-measure on a content-height
    // change the way it does on scroll/resize. A flat timeout before opening
    // the kebab is a race against however long that fetch takes, not a fix:
    // dismiss the banner (if it showed up) so the layout is done shifting
    // before the kebab's position is ever computed.
    const dismissInsight = page.getByRole('button', { name: 'Dismiss insight' });
    // The banner's fetch may not have resolved yet at all -- give it a window
    // to show up before deciding there isn't one, rather than checking once.
    await dismissInsight.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await dismissInsight.isVisible().catch(() => false)) {
      await dismissInsight.click();
      await expect(dismissInsight).not.toBeVisible();
    }

    await page.getByRole('button', { name: 'Exercise options' }).first().click();
    const cancelWorkoutItem = page.getByRole('button', { name: 'Cancel workout' });
    await cancelWorkoutItem.scrollIntoViewIfNeeded();
    await cancelWorkoutItem.click();

    await expect(page.getByRole('heading', { name: 'Cancel Workout?' })).toBeVisible();
    await expect(page.getByText('Your progress for this workout will be lost')).toBeVisible();

    // Dismiss without cancelling -- must not delete real session data.
    await page.getByRole('button', { name: 'Keep Going' }).click();
    await expect(page.getByRole('heading', { name: 'Cancel Workout?' })).not.toBeVisible();

    // Still mid-session, nothing was discarded by the dismissed dialog.
    await expect(page.getByText(EXERCISE)).toBeVisible();
  } finally {
    await removeSeededWeighIn();
    await cleanup(uid);
  }
});
