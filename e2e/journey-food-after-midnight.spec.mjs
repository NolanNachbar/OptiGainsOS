// Daily-loop journey: food logged just after local midnight must land on the
// NEW local day, on both Today and Fuel. The risk is code that derives the day
// from UTC (toISOString().slice(0,10)) instead of the local calendar date: it
// is right for most of the day and wrong exactly in the hours around midnight.
//
// No clock games (moving the browser clock breaks Supabase auth with a 429).
// Instead the browser context gets a timezoneId chosen at runtime so that the
// local date differs from the UTC date RIGHT NOW (Kiritimati is UTC+14,
// Pago_Pago UTC-11: one of them always straddles). A UTC-derived date then
// lands on the wrong day, which is the same failure as a midnight log.
//
// Asserts the whole chain:
//   1. a food logged through the real Fuel UI is stored with date = the local
//      date in that zone (not the UTC date)
//   2. Fuel's current day lists it
//   3. Today's Nutrition module counts its calories
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, openAddFoodDialog } from './helpers.mjs';

const CASE = 'journey-midnight';
const FOOD_NAME = `OVN-${CASE} snack`;
const KCAL = 777;

const ymdIn = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

const utcDate = ymdIn('UTC');
const TZ = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Pacific/Auckland', 'America/Denver']
  .find((tz) => ymdIn(tz) !== utcDate);
const localToday = ymdIn(TZ);

test.use({ timezoneId: TZ });

async function cleanup(db, uid) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

// The Kcal column's "N/goal" caption (Consumed view) as the consumed number.
async function consumedKcal(page) {
  await page.getByRole('button', { name: 'Consumed' }).first().click();
  const cap = page.locator('div:has(> div:text-is("Kcal"))').first().locator('.font-technical');
  const text = (await cap.innerText()).replace(/,/g, '');
  const m = text.match(/^(\d+)\//);
  return m ? Number(m[1]) : null;
}

test('food logged when local date != UTC date lands on the local day, on Today and Fuel', async ({ page }) => {
  expect(TZ, 'a zone whose date differs from UTC right now').toBeTruthy();
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);

  try {
    await signIn(page, '/today');
    await page.waitForTimeout(500);
    const before = await consumedKcal(page);
    expect(before, 'Today shows a Consumed/goal Kcal caption').not.toBeNull();

    // ── Log through the real Fuel UI ──
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');
    await openAddFoodDialog(page);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Manual entry' }).click();
    await page.waitForTimeout(200);
    await page.locator('#food_name').fill(FOOD_NAME);
    await page.locator('#calories').fill(String(KCAL));
    await page.locator('#calories').blur();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: 'Add Food', exact: true });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ timeout: 5000, force: true });

    // 1. stored under the LOCAL date of that zone, not the UTC date
    let row;
    await expect.poll(async () => {
      const { data } = await db.from('food_entries').select('*')
        .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
      row = data?.[0];
      return data?.length ?? 0;
    }, { timeout: 10000, message: 'the UI log should create one food_entries row' }).toBe(1);
    expect(localToday).not.toBe(utcDate);
    expect(row.date).toBe(localToday);
    expect(row.calories).toBe(KCAL);

    // 2. Fuel's current day shows it (fresh load, default day = today)
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(FOOD_NAME).first()).toBeVisible({ timeout: 10000 });
    const fuelAfter = await consumedKcal(page);
    expect(fuelAfter).toBe(before + KCAL);

    // 3. Today's Nutrition module counts it
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    expect(await consumedKcal(page)).toBe(before + KCAL);
  } finally {
    await cleanup(db, uid);
  }
});
