// Regression for today-r1-11: while offline, React Query's default
// networkMode pauses (not fails) the "Practiced" mutation on a skill — it
// resumes on its own on reconnect, so onError never fires and there's no
// error to catch. The button gave zero feedback (no toast, no visible
// change) while offline, then silently completed later on reconnect. Fix:
// while the mutation is paused for this skill, the button reads "Offline -
// saves when back online" instead (mirrors FoodTracker's f2590dcd fix).
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-11';
const SKILL_NAME = `OVN-${CASE} test skill`;

async function cleanup(uid, db) {
  await db.from('skills').delete().eq('created_by', uid).ilike('name', `%${SKILL_NAME}%`);
}

test('offline "Practiced" tap shows an honest offline message instead of doing nothing', async ({ page, context }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const { error: insErr } = await db.from('skills').insert({
    created_by: uid, name: SKILL_NAME, category: 'test', level: 1, last_practiced_at: null,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/mind');
    await page.getByRole('button', { name: 'Skills' }).click();
    await page.waitForTimeout(300);

    const card = page.locator('div').filter({ hasText: SKILL_NAME }).filter({
      has: page.getByRole('button', { name: 'Practiced' }),
    }).last();
    await card.waitFor({ state: 'visible', timeout: 8000 });
    const practicedBtn = card.getByRole('button', { name: 'Practiced' });

    await context.setOffline(true);
    try {
      await practicedBtn.click({ timeout: 5000, force: true });
      await expect(card.getByText('Offline - saves when back online')).toBeVisible({ timeout: 5000 });

      const { data: whileOffline } = await db.from('skills').select('last_practiced_at').eq('created_by', uid).ilike('name', `%${SKILL_NAME}%`);
      expect(whileOffline[0].last_practiced_at).toBeNull();
    } finally {
      await context.setOffline(false);
    }

    // Reconnect: the paused mutation resumes on its own and the row updates.
    await expect.poll(async () => {
      const { data } = await db.from('skills').select('last_practiced_at').eq('created_by', uid).ilike('name', `%${SKILL_NAME}%`);
      return data?.[0]?.last_practiced_at ?? null;
    }, { timeout: 10000 }).not.toBeNull();
  } finally {
    await context.setOffline(false).catch(() => {});
    await cleanup(uid, db);
  }
});
