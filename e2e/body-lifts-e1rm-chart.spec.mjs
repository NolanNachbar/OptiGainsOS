// Body > Lifts (phase-2b): ExerciseProgressChart used to be unreachable —
// it only ever rendered from ProgressContent.jsx, which nothing imported.
// This checks the real path: a lift with logged sets shows up in the Lifts
// list with an e1RM, and tapping it expands the chart.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'lifts-r3b';
const EXERCISE = `OVN-${CASE} Squat`;

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('a lift with logged sets shows an e1RM row and expands to its chart', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const logs = [
    { log_date: dateOffset(-21), weight: 185, reps: 5 },
    { log_date: dateOffset(-7), weight: 195, reps: 5 },
    { log_date: dateOffset(-1), weight: 205, reps: 5 },
  ];

  const inserted = [];
  try {
    for (const l of logs) {
      const { data, error } = await db.from('workout_logs').insert({
        created_by: uid,
        log_date: l.log_date,
        exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: l.weight, reps: l.reps, completed: true }] }],
      }).select().single();
      expect(error).toBeNull();
      inserted.push(data.id);
    }

    await signIn(page, '/lifts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText(EXERCISE, { exact: true });
    await expect(row).toBeVisible();

    // e1RM at 205x5 (Epley: 205 * (1 + 5/30) ≈ 239) should render in the row.
    await expect(page.getByText('239', { exact: false }).first()).toBeVisible();

    await row.click();
    await page.waitForTimeout(300);

    const chart = page.getByLabel(`${EXERCISE} e1RM chart`);
    await expect(chart).toBeVisible();
    await expect(chart.locator('svg')).toBeVisible();
  } finally {
    await db.from('workout_logs').delete().in('id', inserted);
  }
});
