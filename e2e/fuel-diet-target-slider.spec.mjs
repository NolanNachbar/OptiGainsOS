// Regression/coverage for the diet-target slider (WeeklyPlanCard's override
// sheet, 2026-09-30): a single horizontal slider from Peak cut (1640 kcal —
// his real deepest engine-set cut this year) to Peak bulk replaced the old
// four-way Cut/Maintain/Bulk/Custom picker. Dragging (here: keyboard Home, the
// native range-input shortcut to jump to `min`) to the left end and saving
// must still land on the SAME nutrition_overrides path the old picker used —
// an action:"manual" row per date in the week, manual_calorie_target: 1640.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

test('dragging the diet slider to Peak cut and saving writes a 1640 kcal manual override', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  // Snapshot what's there before: Peak cut sits well under maintenance-100, so
  // saving always resolves to phase "cut", which can end the test account's
  // currently-open diet_phases row and open a new one (or flip
  // user_profiles.diet_phase). Both get put back exactly afterward.
  const { data: profileBefore } = await db.from('user_profiles')
    .select('diet_phase').eq('created_by', uid).single();
  const { data: phaseBefore } = await db.from('diet_phases')
    .select('*').eq('created_by', uid).is('end_date', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  await signIn(page, '/fuel');

  const weekPlanBtn = page.getByRole('button', { name: /Week plan/ });
  await weekPlanBtn.waitFor({ state: 'visible', timeout: 8000 });
  await weekPlanBtn.click();

  // The sheet's trigger reads whatever phase is currently active (Cut /
  // Maintain / Bulk) or "Custom" once a manual override is already set —
  // never a fixed label, so match any of the four.
  const overrideBtn = page.getByRole('button', { name: /^(Cut|Maintain|Bulk|Custom)$/ });
  await overrideBtn.waitFor({ state: 'visible', timeout: 8000 });
  await overrideBtn.click();

  const slider = page.getByRole('slider', { name: 'Daily calorie target' });
  await slider.waitFor({ state: 'visible', timeout: 8000 });

  // Native range-input behavior: Home jumps to `min`, which is always the
  // Peak cut landmark (the slider's fixed 1640 kcal floor).
  await slider.focus();
  await slider.press('Home');

  await expect(page.getByText('1,640', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Peak cut', { exact: true }).first()).toBeVisible();

  const saveBtn = page.getByRole('button', { name: 'Set target' });
  await saveBtn.click();
  await expect(page.getByText(/kcal\/day manually/)).toBeVisible({ timeout: 8000 });

  const { data: rows } = await db.from('nutrition_overrides')
    .select('date, action, manual_calorie_target')
    .eq('created_by', uid).eq('action', 'manual').eq('manual_calorie_target', 1640);
  expect(rows?.length ?? 0).toBeGreaterThanOrEqual(1);

  // Cleanup: this run's manual override rows, then restore the phase to
  // exactly what it was before this test touched it.
  await db.from('nutrition_overrides').delete()
    .eq('created_by', uid).eq('action', 'manual').eq('manual_calorie_target', 1640);

  const { data: phaseAfter } = await db.from('diet_phases')
    .select('*').eq('created_by', uid).is('end_date', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (phaseAfter && phaseAfter.id !== phaseBefore?.id) {
    await db.from('diet_phases').delete().eq('id', phaseAfter.id);
    if (phaseBefore) await db.from('diet_phases').update({ end_date: null }).eq('id', phaseBefore.id);
  }
  if (profileBefore) {
    await db.from('user_profiles').update({ diet_phase: profileBefore.diet_phase }).eq('created_by', uid);
  }
});

// The test account has no athlete_state nutrition row, so the test above only
// exercises the "maintenance unknown, fall back to today's target" path —
// which never even calls round50/round50-adjacent code for Maintain/Peak
// bulk. This one intercepts the athlete_state fetch to inject a real
// maintenance_kcal so the landmark math (Maintain exact, Peak bulk = x1.25
// rounded to 50) actually runs against realistic numbers. Read-only: it
// rewrites a network response, never writes to the DB.
test('with a real maintenance_kcal, Maintain and Peak bulk land on their exact numbers', async ({ page }) => {
  // The test account has no athlete_state rows at all (empty result), so
  // there's nothing to patch — synthesize the one row every caller of this
  // endpoint expects instead.
  const mockNutrition = {
    recommended_intake: { maintenance_kcal: 2960 },
    phase_options: { maintenance: { maintenance_kcal: 2960 } },
  };
  await page.route('**/rest/v1/athlete_state*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const inject = (row) => ({ ...row, nutrition: mockNutrition });
    let patched;
    if (Array.isArray(body) && body.length > 0) patched = body.map(inject);
    else if (Array.isArray(body)) patched = [inject({ date: '2026-09-30' })];
    else patched = body ? inject(body) : inject({ date: '2026-09-30' });
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      json: patched,
    });
  });

  await signIn(page, '/fuel');

  const weekPlanBtn = page.getByRole('button', { name: /Week plan/ });
  await weekPlanBtn.waitFor({ state: 'visible', timeout: 8000 });
  await weekPlanBtn.click();

  const overrideBtn = page.getByRole('button', { name: /^(Cut|Maintain|Bulk|Custom)$/ });
  await overrideBtn.waitFor({ state: 'visible', timeout: 8000 });
  await overrideBtn.click();

  const slider = page.getByRole('slider', { name: 'Daily calorie target' });
  await slider.waitFor({ state: 'visible', timeout: 8000 });

  // Home -> Peak cut (fixed 1640, independent of maintenance).
  await slider.focus();
  await slider.press('Home');
  await expect(page.getByText('1,640', { exact: false }).first()).toBeVisible();

  // Dragging to the raw maintenance value snaps to it exactly (it's a stop,
  // not a rounded-off neighbor) — this is the bug the standard 1640-anchored
  // grid used to introduce (2,960 would land as 2,940).
  await slider.fill('2960');
  await expect(page.getByText('2,960', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Maintain', { exact: true }).first()).toBeVisible();

  await slider.press('End');
  await expect(page.getByText('3,700', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Peak bulk', { exact: true }).first()).toBeVisible();

  // Close without saving — this test is read-only against the DB.
  await page.keyboard.press('Escape');
});
