import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^VITE_SUPABASE_(URL|ANON_KEY)=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));

// Sign in the page as the test athlete (same path the app's DEV bypass uses).
export async function signIn(page, path = '/today') {
  await page.goto('/today?bypass_auth=true');
  await page.waitForLoadState('networkidle');
  if (path !== '/today') await page.goto(path);
}

// A Supabase client signed in as the test athlete, for asserting on DB state.
// RLS applies, so it can only see the test account's rows.
let db;
export async function testDb() {
  if (db) return db;
  db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: 'athlete@local.test', password: 'localpassword123' });
  if (error) throw error;
  return db;
}
export async function testUserId() { return (await (await testDb()).auth.getUser()).data.user.id; }

// Open the Add Food dialog the way the app now expects on mobile: FoodTracker
// no longer renders its own bottom-right FAB (r5 review, major -- it doubled
// up with the dock's raised '+' on /food-tracker). The dock's '+' -> "Log
// Food" is the one path now, on Fuel or anywhere else.
export async function openAddFoodDialog(page) {
  await page.getByTestId('quick-add-button').click();
  await page.getByRole('menuitem', { name: 'Log Food' }).click();
}
