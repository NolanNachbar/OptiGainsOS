// Regression for the cbum-nutrition-body critique #2: calculateAdaptiveTDEE
// defaulted to a 14-day window (days=14), but confidence needs daySpan>=21
// ("medium") or >=28 ("high"), and getBestTDEE calls it with no `days`
// argument. Since the window can never be wider than its own `days` default,
// daySpan could never reach 21, so the adaptive path could never activate —
// every athlete silently got the Mifflin formula TDEE forever, regardless of
// how much weight/food history they logged. Fixed by widening the default
// window to 28 (matching the "high" threshold) so a real logging history can
// actually reach "medium"/"high" confidence.
//
// coachingUtils.js imports via the `@/lib` Vite alias, which plain Node ESM
// can't resolve, so this loads the real module through the Vite dev server
// (the same one `npm run dev` serves the app from) via a dynamic import from
// inside a page — Vite's import-rewriting middleware resolves the alias for
// any request it serves, not just the initial page load. That runs the
// actual shipped source, not a re-implementation.
import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('a 25-day logging history reaches medium/high confidence with the caller\'s implicit default', async ({ page }) => {
  await signIn(page, '/fuel');

  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/coachingUtils.js');
    const { calculateAdaptiveTDEE, getBestTDEE } = mod;

    const weightEntries = [];
    const foodEntries = [];
    // Anchored to real "now" (both functions filter by `subDays(new Date(), days)`),
    // spanning the last 25 days so the whole history falls inside any window >=25.
    const now = new Date();
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      weightEntries.push({ recorded_date: date, weight: 200 - (24 - i) * 0.05 });
      foodEntries.push({ date, calories: 2400, protein_grams: 180 });
    }

    // getBestTDEE calls calculateAdaptiveTDEE with no explicit `days` — it
    // relies entirely on the function's own default, which is exactly what
    // was broken.
    const adaptiveWithDefault = calculateAdaptiveTDEE(weightEntries, foodEntries);
    // Explicit regression guard: the OLD default (14) can never reach medium
    // (daySpan>=21) confidence, since the window can't be wider than itself.
    const adaptiveWithOldDefault = calculateAdaptiveTDEE(weightEntries, foodEntries, 14);

    const profile = { sex: 'male', age: 30, height_cm: 180, weight_unit: 'lb', current_weight: 195, tdee_override: null };
    const best = getBestTDEE(profile, 195, weightEntries, foodEntries, []);

    return { adaptiveWithDefault, adaptiveWithOldDefault, bestMethod: best.method };
  });

  expect(result.adaptiveWithDefault).not.toBeNull();
  expect(['medium', 'high']).toContain(result.adaptiveWithDefault.confidence);
  expect(result.adaptiveWithDefault.dataPoints.daySpan).toBeGreaterThanOrEqual(21);
  expect(result.adaptiveWithOldDefault).toBeNull();
  expect(result.bestMethod).toBe('adaptive');
});

// Review correction: once the adaptive path could activate, week-plan rows
// (planned=true, possibly future-dated) leaked into its calorie average —
// useAllFoodEntries returns them. They must not move the adaptive TDEE.
test('planned and future-dated food rows do not skew the adaptive TDEE', async ({ page }) => {
  await signIn(page, '/fuel');

  const result = await page.evaluate(async () => {
    const { calculateAdaptiveTDEE } = await import('/src/utils/coachingUtils.js');
    const weightEntries = [];
    const eaten = [];
    const now = new Date();
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      weightEntries.push({ recorded_date: date, weight: 200 - (24 - i) * 0.05 });
      eaten.push({ date, calories: 2400, planned: false });
    }
    const noise = [];
    for (let i = 1; i <= 5; i++) {
      const past = new Date(now); past.setUTCDate(past.getUTCDate() - i);
      const future = new Date(now); future.setUTCDate(future.getUTCDate() + i);
      noise.push({ date: past.toISOString().slice(0, 10), calories: 9000, planned: true });
      noise.push({ date: future.toISOString().slice(0, 10), calories: 9000, planned: false });
    }
    return {
      clean: calculateAdaptiveTDEE(weightEntries, eaten),
      noisy: calculateAdaptiveTDEE(weightEntries, [...eaten, ...noise]),
    };
  });

  expect(result.clean).not.toBeNull();
  expect(result.noisy.tdee).toBe(result.clean.tdee);
  expect(result.noisy.dataPoints.foodDays).toBe(result.clean.dataPoints.foodDays);
});
