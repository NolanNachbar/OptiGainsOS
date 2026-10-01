// A session started yesterday and quiet for 3h+ is logged on the next app
// open, no Finish and no Unfinished-sessions review (Nolan, 2026-09-30). The
// log is filed under the session's start date and stamped 3h after its last
// change, not at the moment the app happened to be reopened.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const EXERCISE = 'OVN-yesterday-autolog Lift';
const HOUR = 60 * 60 * 1000;

function hasMarker(row) {
  return Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === EXERCISE);
}

async function cleanup(uid) {
  const db = await testDb();
  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const sIds = (sessions || []).filter(hasMarker).map((s) => s.id);
  if (sIds.length) await db.from('workout_sessions').delete().in('id', sIds);
  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const lIds = (logs || []).filter(hasMarker).map((l) => l.id);
  if (lIds.length) await db.from('workout_logs').delete().in('id', lIds);
}

test("yesterday's unfinished session is auto-logged on open, stamped last change + 3h", async ({ page }) => {
  const uid = await testUserId();
  const db = await testDb();
  await cleanup(uid);

  const updatedAt = new Date(Date.now() - 29 * HOUR);
  try {
    const { data: session, error } = await db.from('workout_sessions').insert({
      created_by: uid,
      workout_id: null,
      program_workout_id: null,
      status: 'in_progress',
      start_time: new Date(Date.now() - 30 * HOUR).toISOString(),
      updated_at: updatedAt.toISOString(),
      exercises: [{ name: EXERCISE, sets: [{ weight: 100, reps: 5, completed: true }] }],
    }).select().single();
    expect(error).toBeNull();

    await signIn(page, '/today');

    await expect
      .poll(
        async () => {
          const { data } = await db.from('workout_sessions').select('status').eq('id', session.id).single();
          return data?.status;
        },
        { timeout: 20000, message: 'the global sweep should log a 30h-old session' }
      )
      .toBe('completed');

    const { data: logs } = await db.from('workout_logs').select('id, created_at, exercises').eq('created_by', uid);
    const mine = (logs || []).filter(hasMarker);
    expect(mine).toHaveLength(1);
    const stampedMs = new Date(mine[0].created_at).getTime();
    expect(Math.abs(stampedMs - (updatedAt.getTime() + 3 * HOUR))).toBeLessThan(60 * 1000);

    await expect(page.getByText('Unfinished sessions')).toHaveCount(0);
  } finally {
    await cleanup(uid);
  }
});
