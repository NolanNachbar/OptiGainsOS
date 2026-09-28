// Shared setup/cleanup for fuel r1 attack scripts.
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { ORIGIN } from '../../../drive.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

export function log(pass, title, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${title} :: ${detail}`);
}

// Like drive.mjs's start(), but fakes Date/"now" to a chosen instant for the
// case under test. Two things learned by trial (see /tmp debug scripts this
// session):
//  1. clock.install() freezes real timers too, and the app's own
//     setTimeout-driven bypass-auth/load path then never fires -> stuck
//     loading spinner forever. clock.setFixedTime() only overrides
//     Date.now()/new Date() while real timers keep ticking - use that.
//  2. Faking the clock BEFORE the bypass_auth login navigation makes the
//     Supabase session look expired (issued "in the past" relative to the
//     faked now) and the app hangs on the loading spinner. So: log in for
//     real (real clock), THEN fake the time, THEN navigate to the target
//     path so the component mounts under the faked date.
export async function startWithClock(path, time) {
  const s = await launchIPhone({ appOrigin: ORIGIN, mode: 'standalone' });
  const problems = [];
  s.problems = problems;
  s.page.on('pageerror', (e) => problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  await s.page.clock.setFixedTime(time);
  if (path !== '/today') { await s.page.goto(ORIGIN + path); await s.page.waitForTimeout(2000); }
  return s;
}

// The Add Food dialog autofocuses its search field, which raises the software
// keyboard as an image overlay (iphone-sim layer.js) covering "Manual entry"
// below the fold. A tap there actually hits the keyboard picture instead of
// the real button underneath (confirmed: first click is a no-op, second click
// — after the keyboard closes on blur — lands). Blur first so taps land where
// intended, same as a real user dismissing the keyboard before scrolling.
export async function dismissKeyboard(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
}

// Opens the Add Food dialog (FAB) and expands Manual entry.
export async function openManualAdd(page) {
  await page.getByRole('button', { name: 'Add food' }).click();
  await page.waitForTimeout(400);
  await dismissKeyboard(page);
  await page.getByRole('button', { name: 'Manual entry' }).click();
  await page.waitForTimeout(200);
}

export async function fillManualFood(page, { name, calories, protein, carbs, fats }) {
  await page.locator('#food_name').fill(name);
  if (calories != null) await page.locator('#calories').fill(String(calories));
  if (protein != null) await page.locator('#protein_grams, [id="protein_grams"]').first().fill(String(protein)).catch(() => {});
  await page.waitForTimeout(150);
}

export async function submitAdd(page) {
  await page.getByRole('button', { name: /^(Add Food|Save Changes)$/ }).click();
  await page.waitForTimeout(1200);
}

// Deletes every tagged food_entries row for this case (by food_name prefix).
export async function cleanupByTag(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').delete()
    .eq('created_by', uid)
    .ilike('food_name', `OVN-${caseId}%`)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

export async function insertTaggedEntry(fields) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').insert({ created_by: uid, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function taggedRows(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').select('*')
    .eq('created_by', uid)
    .ilike('food_name', `OVN-${caseId}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
