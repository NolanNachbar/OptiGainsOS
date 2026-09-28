// Regression for today-r1-06.
//
// A long unbroken token (e.g. a pasted URL) in a todo's text had no
// overflow-wrap on the row span, so it pushed the whole /today page wider
// than the viewport instead of wrapping. Fix: TodayActions.jsx's todo text
// span gets `min-w-0 [overflow-wrap:anywhere]`, plus a maxLength on the Add
// input as a belt-and-braces guard.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

async function cleanup(uid, db, text) {
  await db.from('todos').delete().eq('created_by', uid).ilike('text', `%${text}%`);
}

test('a long unbroken todo token wraps instead of overflowing the page', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const TAG = 'OVN-r1-06';
  const LONG_TOKEN = TAG + 'x'.repeat(2000);
  await cleanup(uid, db, TAG);

  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  await page.addInitScript(([userId, d]) => {
    localStorage.setItem(`todos_seeded_${userId}_${d}`, '1');
  }, [uid, date]);

  const { error: insErr } = await db.from('todos').insert({
    created_by: uid, date, text: LONG_TOKEN, source: 'manual', completed: false,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/today');
    await page.waitForTimeout(500);

    const row = page.locator('div').filter({ hasText: TAG }).filter({
      has: page.getByRole('button', { name: 'Delete action' }),
    }).last();
    await row.waitFor({ state: 'visible', timeout: 8000 });

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  } finally {
    await cleanup(uid, db, TAG);
  }
});
