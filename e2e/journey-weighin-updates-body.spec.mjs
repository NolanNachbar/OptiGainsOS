// Daily-loop journey: weigh in from Today, then see it everywhere without a
// hard reload. The weigh-in write goes through useLogWeight, whose onSuccess
// invalidates ['bodyWeightEntries'] (prefix match, so Today's 365-day query
// AND the Body page's full-history query). If that invalidation is dropped,
// the 5-minute staleTime keeps both showing the old data until a reload.
//
// Why Body is visited FIRST: a query nobody has loaded yet fetches fresh, so
// the stale-cache bug only shows if the Body page's data is already cached
// when the weigh-in lands. Today -> Body (Detail link) -> back -> weigh in ->
// Body again, all by in-app navigation; a window marker proves no reload.
//
// "Body" here is Fuel -> Body (/fuel?tab=body): its history list is the live
// view of body_weight_entries. /athlete-state's "Weight Trend" is lbs/wk
// computed server-side into athlete_state, so it is not a live view.
//
// Asserts the whole chain:
//   1. the Today weigh-in row writes body_weight_entries (recorded_date = local
//      today, the typed value) and the profile's current_weight follows
//   2. Today's weight module moves its trend number and the row flips to
//      "Logged today", with no reload
//   3. the Body history lists today's entry with the value and the profile's
//      unit, with no reload
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = localDate();
const VALUE = 233.7; // far from any plausible trend, so the EWMA visibly moves

test('weigh-in from Today updates the Today weight module and the Body history without a reload', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const { data: prior } = await db.from('body_weight_entries')
    .select('*').eq('created_by', uid).eq('recorded_date', TODAY);
  const { data: profile } = await db.from('user_profiles').select('id, current_weight, weight_unit')
    .eq('created_by', uid).limit(1).single();
  const unit = profile?.weight_unit || 'lbs';
  await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', TODAY);

  try {
    await signIn(page, '/today');
    await page.evaluate(() => { window.__noReload = true; });
    const trend = page.locator('.type-display.text-2xl').first();
    await expect(page.getByRole('textbox', { name: `Bodyweight in ${unit}` })).toBeVisible({ timeout: 10000 });
    const trendBefore = await trend.innerText();

    // Prime the Body page's cache, then come back by history (no reload).
    await page.getByRole('link', { name: 'Detail' }).nth(1).click();
    await expect(page).toHaveURL(/\/fuel\?tab=body/);
    await expect(page.getByText('Log Weight')).toBeVisible({ timeout: 10000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/today/);

    // ── Weigh in from Today ──
    await page.getByRole('textbox', { name: `Bodyweight in ${unit}` }).fill(String(VALUE));
    await page.getByRole('button', { name: 'Log', exact: true }).click();

    let row;
    await expect.poll(async () => {
      const { data } = await db.from('body_weight_entries').select('*')
        .eq('created_by', uid).eq('recorded_date', TODAY);
      row = data?.[0];
      return data?.length ?? 0;
    }, { timeout: 10000, message: 'the Today weigh-in should write one row for today' }).toBe(1);
    expect(Number(row.weight)).toBe(VALUE);
    await expect.poll(async () => {
      const { data } = await db.from('user_profiles').select('current_weight').eq('id', profile.id).single();
      return Number(data?.current_weight);
    }, { timeout: 10000, message: 'profile current_weight follows today\'s weigh-in' }).toBe(VALUE);

    // ── Today's module reflects it, live ──
    await expect(page.getByText('Logged today')).toBeVisible({ timeout: 10000 });
    await expect(trend).not.toHaveText(trendBefore);

    // ── Body history reflects it, live ──
    await page.getByRole('link', { name: 'Detail' }).nth(1).click();
    await expect(page).toHaveURL(/\/fuel\?tab=body/);
    await expect(page.getByText(`${VALUE} ${unit}`).first()).toBeVisible({ timeout: 10000 });

    expect(await page.evaluate(() => window.__noReload === true), 'no hard reload happened').toBe(true);
  } finally {
    await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', TODAY);
    if (prior?.length) {
      await db.from('body_weight_entries').insert(prior.map(({ id, created_at, updated_at, ...rest }) => rest));
    }
    if (profile?.id) await db.from('user_profiles').update({ current_weight: profile.current_weight }).eq('id', profile.id);
  }
});
