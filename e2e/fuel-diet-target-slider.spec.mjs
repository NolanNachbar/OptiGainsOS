// Regression/coverage for the diet-target slider (WeeklyPlanCard's override
// sheet, 2026-09-30): a single horizontal slider from Peak cut (1640 kcal —
// his real deepest engine-set cut this year) to Peak bulk replaced the old
// four-way Cut/Maintain/Bulk/Custom picker. Dragging (here: keyboard Home, the
// native range-input shortcut to jump to `min`) to the left end and saving
// must still land on the SAME nutrition_overrides path the old picker used —
// an action:"manual" row per date in the week, manual_calorie_target: 1640.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

// The native <input> is index-based (min=0, max=stops.length-1) so keyboard
// arrows land on adjacent stops — aria-valuenow/aria-valuetext stay in kcal
// terms for screen readers, and that's what tests should assert against too,
// since the index domain is an implementation detail that can shift with the
// stop list. This walks ArrowRight from Home until aria-valuenow matches.
async function moveSliderToKcal(slider, targetKcal) {
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < 100; i++) {
    const cur = Number(await slider.getAttribute('aria-valuenow'));
    if (cur === targetKcal) return;
    await slider.press('ArrowRight');
  }
  throw new Error(`diet slider never reached ${targetKcal} kcal`);
}

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

  try {
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

    // Native range-input behavior: Home jumps to index 0, which is always the
    // Peak cut landmark (the slider's fixed 1640 kcal floor).
    await slider.focus();
    await slider.press('Home');

    await expect(slider).toHaveAttribute('aria-valuetext', /^1,640 kcal, Peak cut$/);

    const saveBtn = page.getByRole('button', { name: 'Set target' });
    await saveBtn.click();
    await expect(page.getByText(/kcal\/day manually/)).toBeVisible({ timeout: 8000 });

    const { data: rows } = await db.from('nutrition_overrides')
      .select('date, action, manual_calorie_target')
      .eq('created_by', uid).eq('action', 'manual').eq('manual_calorie_target', 1640);
    expect(rows?.length ?? 0).toBeGreaterThanOrEqual(1);
  } finally {
    // Cleanup: this run's manual override rows, then restore the phase to
    // exactly what it was before this test touched it. Runs even if an
    // assertion above threw, so a failed run never leaves the test account
    // mid-cut or carrying a stray override row.
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
  await expect(slider).toHaveAttribute('aria-valuetext', /^1,640 kcal, Peak cut$/);

  // Walking up to the raw maintenance value lands on it exactly (it's a
  // stop, not a rounded-off neighbor) — this is the bug the standard
  // 1640-anchored grid used to introduce (2,960 would land as 2,940).
  await moveSliderToKcal(slider, 2960);
  await expect(slider).toHaveAttribute('aria-valuetext', /^2,960 kcal, Maintain$/);

  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', /^3,700 kcal, Peak bulk$/);

  // Close without saving — this test is read-only against the DB.
  await page.keyboard.press('Escape');
});

// Fix-first review item: the native input used to be kcal-valued with
// step=1, so a 1 kcal ArrowRight nudge re-snapped straight back to the same
// stop via nearestStop — arrow keys were functionally dead. The input is now
// index-based (min=0, max=stops.length-1, step=1) so every keyboard press
// moves to the literal next entry in the stop list. With a real
// maintenance_kcal, Peak cut (1640) and the next stop up are exactly
// SLIDER_STEP (50 kcal) apart — Cut/Mini cut/etc. land elsewhere on the
// track, but the filler stop directly above Peak cut is always a plain 50
// kcal grid point.
test('ArrowRight from Peak cut moves exactly one stop', async ({ page }) => {
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
    await route.fulfill({ status: response.status(), headers: response.headers(), json: patched });
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

  await slider.focus();
  await slider.press('Home');
  const start = Number(await slider.getAttribute('aria-valuenow'));
  expect(start).toBe(1640);

  await slider.press('ArrowRight');
  const afterOne = Number(await slider.getAttribute('aria-valuenow'));
  // Must have moved to a genuinely different, adjacent stop — not snapped
  // back to 1640. The very next stop is usually a plain 50 kcal filler, but
  // when a landmark falls close to Peak cut, STOP_MERGE_RADIUS (25 kcal) can
  // absorb that filler, so the next stop can be up to a landmark instead —
  // still always well under MIN_LANDMARK_GAP (150), never a multi-stop jump.
  expect(afterOne).not.toBe(start);
  expect(afterOne - start).toBeLessThanOrEqual(100);
  expect(afterOne - start).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
});
