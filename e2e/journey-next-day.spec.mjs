// Daily-loop journey across a day boundary, the path the 2026-09-30 miss
// went down: start a workout, log a set, never press Finish, come back the
// next day. The day-1 session is created through the UI, then moved back 30h
// in the DB. (Moving the browser clock forward instead breaks Supabase auth:
// the client treats every token as expired and refresh-loops into a 429.)
//
// Asserts the whole chain, not one screen:
//   1. opening the app logs yesterday's session (no Finish, no review card)
//   2. the log is filed under yesterday, stamped last change + 3h
//   3. Today no longer shows a "Workout in progress" banner
//   4. starting the next workout from Train (not Today) asks for the weigh-in
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'journey-nextday';
const TITLE = `OVN-${CASE} Workout`;
const EXERCISE = `OVN-${CASE} Lift`;
const HOUR = 60 * 60 * 1000;

const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hasMarker = (row) => Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === EXERCISE);

async function cleanup(db, uid) {
  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const sIds = (sessions || []).filter(hasMarker).map((s) => s.id);
  if (sIds.length) await db.from('workout_sessions').delete().in('id', sIds);
  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const lIds = (logs || []).filter(hasMarker).map((l) => l.id);
  if (lIds.length) await db.from('workout_logs').delete().in('id', lIds);
  await db.from('workouts').delete().eq('created_by', uid).eq('title', TITLE);
}

test('next day: yesterday\'s unfinished workout is logged on open, and the next start asks for the weigh-in', async ({ browser }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);

  const today = localDate(Date.now());
  const { data: priorToday } = await db.from('body_weight_entries')
    .select('*').eq('created_by', uid).eq('recorded_date', today);
  await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', today);

  const { data: workout, error: wErr } = await db.from('workouts').insert({
    created_by: uid,
    title: TITLE,
    exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
  }).select().single();
  expect(wErr).toBeNull();

  try {
    // ── Day 1: start from the workout page, a set gets logged, no Finish ──
    const day1 = await browser.newContext();
    const p1 = await day1.newPage();
    await signIn(p1, `/workout-detail?id=${workout.id}`);
    await p1.getByRole('button', { name: 'Start Logging Workout' }).first().click();
    const skip = p1.getByRole('button', { name: 'Skip, straight to the session' });
    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();

    let session;
    await expect.poll(async () => {
      const { data } = await db.from('workout_sessions').select('*')
        .eq('created_by', uid).eq('workout_id', workout.id).eq('status', 'in_progress');
      session = data?.[0];
      return !!session;
    }, { timeout: 15000, message: 'day 1 should create a session' }).toBe(true);
    await day1.close();

    // Move day 1 into yesterday: started 30h ago, a set logged and then
    // nothing for 29h. Delete + reinsert with the same id, because the
    // BEFORE UPDATE trigger would re-stamp updated_at to now.
    const startedAt = new Date(Date.now() - 30 * HOUR).toISOString();
    const lastChange = new Date(Date.now() - 29 * HOUR).toISOString();
    await db.from('workout_sessions').delete().eq('id', session.id);
    const { error: rErr } = await db.from('workout_sessions').insert({
      ...session,
      start_time: startedAt,
      updated_at: lastChange,
      exercises: [{ name: EXERCISE, sets: [{ weight: 135, reps: 8, completed: true }] }],
    });
    expect(rErr).toBeNull();

    // ── Day 2: open the app ──
    const day2 = await browser.newContext();
    const p2 = await day2.newPage();
    await signIn(p2, '/today');

    await expect.poll(async () => {
      const { data } = await db.from('workout_sessions').select('status').eq('id', session.id).single();
      return data?.status;
    }, { timeout: 20000, message: 'opening the app the next day should log yesterday\'s session' }).toBe('completed');

    const { data: logs } = await db.from('workout_logs').select('log_date, created_at, exercises').eq('created_by', uid);
    const mine = (logs || []).filter(hasMarker);
    expect(mine).toHaveLength(1);
    expect(mine[0].log_date).toBe(localDate(new Date(startedAt).getTime()));
    expect(Math.abs(new Date(mine[0].created_at).getTime() - (new Date(lastChange).getTime() + 3 * HOUR)))
      .toBeLessThan(60 * 1000);

    await p2.reload();
    await expect(p2.getByText('Workout in progress')).toHaveCount(0);
    await expect(p2.getByText('Unfinished sessions')).toHaveCount(0);

    // ── Day 2: next workout started from Train, not Today's card ──
    await p2.goto(`/workout-detail?id=${workout.id}`);
    await p2.getByRole('button', { name: 'Start Logging Workout' }).first().click();
    await expect(p2.getByRole('heading', { name: 'Weigh in first' })).toBeVisible({ timeout: 10000 });
    await day2.close();
  } finally {
    await cleanup(db, uid);
    await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', today);
    if (priorToday?.length) {
      await db.from('body_weight_entries').insert(priorToday.map(({ id, created_at, ...rest }) => rest));
    }
  }
});
