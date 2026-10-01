// Regression for body-r1-03: the Progress > Measurements tab always inserted
// a new row on save, so re-saving a correction for the same day (fixing a
// typo, logging AM then PM) left two rows for that date and the "Latest" card
// wasn't guaranteed to reflect the most recent one. Fix: Progress.jsx now
// looks up an existing row for (created_by, date) and updates it instead of
// inserting a duplicate.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'body-r1-03';
const NOTE = `OVN-${CASE}`;

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DATE = dateOffset(-12);

async function cleanup(uid, db) {
  await db.from('measurements').delete().eq('created_by', uid).eq('date', DATE);
}

test('re-saving Measurements for the same date updates the row instead of duplicating it', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    await signIn(page, '/fuel?tab=body');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Measurements', exact: true }).click();
    await page.waitForTimeout(300);

    const dateInput = page.getByTestId('measurements-date');
    // Chest is the first field in MEASUREMENT_FIELDS; tagged with its own
    // data-testid so this doesn't collide with WeightModule's own (hidden,
    // closed-<details>) date/number inputs, which now render earlier in the
    // DOM on the always-visible Body page.
    const chestInput = page.getByTestId('measurements-chest');
    const notesInput = page.getByPlaceholder('Notes (optional)');

    // First save: chest=100.
    await dateInput.fill(DATE);
    await chestInput.fill('100');
    await notesInput.fill(`${NOTE}-am`);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await page.waitForTimeout(1000);

    // Second save, same date: chest=101 (a correction).
    await dateInput.fill(DATE);
    await chestInput.fill('101');
    await notesInput.fill(`${NOTE}-pm`);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await page.waitForTimeout(1000);

    const { data: rows } = await db.from('measurements')
      .select('*').eq('created_by', uid).eq('date', DATE);

    expect(rows?.length).toBe(1);
    expect(rows[0].chest_cm).toBe(101);
    expect(rows[0].notes).toBe(`${NOTE}-pm`);

    // Review correction: a third re-save with the notes box left blank (the
    // form never prefills it) must keep the earlier note, not null it.
    await dateInput.fill(DATE);
    await chestInput.fill('102');
    await notesInput.fill('');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await page.waitForTimeout(1000);

    const { data: rows2 } = await db.from('measurements')
      .select('*').eq('created_by', uid).eq('date', DATE);
    expect(rows2?.length).toBe(1);
    expect(rows2[0].chest_cm).toBe(102);
    expect(rows2[0].notes).toBe(`${NOTE}-pm`);
  } finally {
    await cleanup(uid, db);
  }
});
