// Regression for today-r1-01 + today-r1-04.
//
// r1-01: deleting a todo had no confirm and no undo — a single tap on the X
// permanently lost the entry with zero recovery path. Fix mirrors fuel's
// delete-undo pattern (58cb69a9 + review correction 51b16dca): the delete
// mutation now returns the deleted row(s) and shows a "Task deleted" toast
// with an Undo action that re-inserts them, plus onError feedback.
//
// r1-04: the text-only de-dupe (TodayActions.jsx:47-52, keeps only the
// earliest same-text row) meant that deleting the *visible* row left its
// hidden same-text twin in the DB, which instantly re-rendered in the
// deleted row's place — so the delete looked like it silently did nothing.
// Fix: delete (and toggle) now act on every raw row sharing that text for
// the date (.in('id', ids)), not just the clicked row's id.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

async function cleanup(uid, db, text) {
  await db.from('todos').delete().eq('created_by', uid).ilike('text', `%${text}%`);
}

test('deleting a todo offers an Undo toast that restores it', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const TASK_TEXT = 'OVN-r1-01 undo task';
  await cleanup(uid, db, TASK_TEXT);

  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  await page.addInitScript(([userId, d]) => {
    localStorage.setItem(`todos_seeded_${userId}_${d}`, '1');
  }, [uid, date]);

  const { error: insErr } = await db.from('todos').insert({
    created_by: uid, date, text: TASK_TEXT, source: 'manual', completed: false,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/today');
    await page.waitForTimeout(500);

    const row = page.locator('div').filter({ hasText: TASK_TEXT }).filter({
      has: page.getByRole('button', { name: 'Delete action' }),
    }).last();
    await row.waitFor({ state: 'visible', timeout: 8000 });
    await row.getByRole('button', { name: 'Delete action' }).click();

    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Task deleted')).toBeVisible();

    await page.waitForTimeout(500);
    const { data: afterDelete } = await db.from('todos').select('id')
      .eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
    expect(afterDelete.length).toBe(0);

    await undoButton.click();
    await page.waitForTimeout(800);

    const { data: afterUndo, error } = await db.from('todos').select('*')
      .eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
    expect(error).toBeNull();
    expect(afterUndo.length).toBe(1);
    expect(afterUndo[0].text).toBe(TASK_TEXT);
    expect(afterUndo[0].source).toBe('manual');
  } finally {
    await cleanup(uid, db, TASK_TEXT);
  }
});

test('deleting the visible half of a same-text duplicate removes both and shows visible feedback', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const TASK_TEXT = 'OVN-r1-04 dup task';
  await cleanup(uid, db, TASK_TEXT);

  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  await page.addInitScript(([userId, d]) => {
    localStorage.setItem(`todos_seeded_${userId}_${d}`, '1');
  }, [uid, date]);

  // Two rows, identical text — the realistic duplicate the app itself can
  // produce (e.g. the brief seeded on two devices), which the de-dupe
  // collapses to one visible row.
  const { error: insErr } = await db.from('todos').insert([
    { created_by: uid, date, text: TASK_TEXT, source: 'manual', completed: false },
    { created_by: uid, date, text: TASK_TEXT, source: 'manual', completed: false },
  ]);
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/today');
    await page.waitForTimeout(500);

    // Only one row should be visible (de-dupe).
    await expect(page.getByText(TASK_TEXT)).toHaveCount(1);

    const row = page.locator('div').filter({ hasText: TASK_TEXT }).filter({
      has: page.getByRole('button', { name: 'Delete action' }),
    }).last();
    await row.waitFor({ state: 'visible', timeout: 8000 });
    await row.getByRole('button', { name: 'Delete action' }).click();

    // Visible feedback: the row disappears (not re-rendered from the hidden
    // twin) and the toast shows.
    await expect(page.getByText('Task deleted')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(TASK_TEXT)).toHaveCount(0);

    await page.waitForTimeout(500);
    const { data: afterDelete } = await db.from('todos').select('id')
      .eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
    expect(afterDelete.length).toBe(0);

    // Undo restores both rows.
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(800);
    const { data: afterUndo, error } = await db.from('todos').select('*')
      .eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
    expect(error).toBeNull();
    expect(afterUndo.length).toBe(2);
  } finally {
    await cleanup(uid, db, TASK_TEXT);
  }
});
