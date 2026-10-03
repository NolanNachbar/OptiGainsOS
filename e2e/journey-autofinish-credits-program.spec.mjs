// Daily-loop journey: a program-day session the athlete forgot to Finish and
// that the app auto-finishes (3h silence) must credit the program exactly like
// the Finish button: the log carries program_id / enrollment_id / workout_id,
// and the enrollment's completed_workouts / current_day advance. Before the
// fix auto-finish wrote a log with program_id/workout_id null and never
// advanced the enrollment.
//
// Seeds a program-day in_progress session aged past the threshold (rows are
// backdated in the DB; no browser clock moves), opens Today (the global sweep
// finishes it), then checks the log and the enrollment.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'autofinish-credits-program';
const PROGRAM_TITLE = `OVN-${CASE} Split`;
const DAYS = [1, 2, 3].map((i) => ({ day_index: i, title: `OVN-${CASE} Day ${i}`, exercise: `OVN-${CASE} Lift ${i}` }));
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const isMine = (row) => Array.isArray(row?.exercises) && row.exercises.some((ex) => DAYS.some((d) => d.exercise === ex?.name));

async function cleanup(db, uid) {
  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const sIds = (sessions || []).filter(isMine).map((s) => s.id);
  if (sIds.length) await db.from('workout_sessions').delete().in('id', sIds);
  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const lIds = (logs || []).filter(isMine).map((l) => l.id);
  if (lIds.length) await db.from('workout_logs').delete().in('id', lIds);
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).eq('title', PROGRAM_TITLE);
  const pIds = (progs || []).map((p) => p.id);
  if (pIds.length) {
    await db.from('program_enrollments').delete().in('program_id', pIds);
    await db.from('program_workouts').delete().in('program_id', pIds);
    await db.from('programs').delete().in('id', pIds);
  }
}

test('auto-finishing a stale program-day session credits the program like Finish', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);

  const { data: profile } = await db.from('profiles').select('timezone').eq('id', uid).maybeSingle();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateIn = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  const yesterday = dateIn(Date.now() - DAY_MS);

  const { data: otherActive } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  if (otherActive?.length) await db.from('program_enrollments').update({ status: 'paused' }).in('id', otherActive.map((e) => e.id));
  // Any other stale in-progress session would be swept too and muddy the run.
  const { data: otherSessions } = await db.from('workout_sessions').select('id').eq('created_by', uid).eq('status', 'in_progress');
  expect(otherSessions?.length ?? 0, 'test account should have no other in-progress sessions').toBe(0);

  try {
    const { data: program, error: pErr } = await db.from('programs').insert({
      created_by: uid, title: PROGRAM_TITLE, schema_version: 2, num_cycles: 4,
      duration_weeks: 4, days_per_week: 3, focus: 'strength',
    }).select().single();
    expect(pErr).toBeNull();
    const { data: pws, error: wErr } = await db.from('program_workouts').insert(DAYS.map((d) => ({
      program_id: program.id, created_by: uid, day_index: d.day_index, title: d.title, focus: 'strength',
      exercises: [{ name: d.exercise, sets: 1, rep_target: '5' }],
    }))).select();
    expect(wErr).toBeNull();
    const day1 = pws.find((w) => w.day_index === 1);
    const { data: enrollment, error: eErr } = await db.from('program_enrollments').insert({
      created_by: uid, program_id: program.id, status: 'active',
      started_at: `${yesterday}T12:00:00Z`, current_cycle: 1, current_day_index: 1,
      current_week: 1, current_day: 1, completed_workouts: [],
    }).select().single();
    expect(eErr).toBeNull();

    // Day 1's session: started 5h ago, last touched 4h ago (past the 3h rule).
    const { error: sErr } = await db.from('workout_sessions').insert({
      created_by: uid, workout_id: null, program_workout_id: day1.id, enrollment_id: enrollment.id,
      status: 'in_progress',
      start_time: new Date(Date.now() - 5 * HOUR_MS).toISOString(),
      updated_at: new Date(Date.now() - 4 * HOUR_MS).toISOString(),
      exercises: [{ name: DAYS[0].exercise, sets: [{ weight: 135, reps: 5, completed: true }] }],
    });
    expect(sErr).toBeNull();

    // The global sweep runs on any route.
    await signIn(page, '/today');

    let log;
    await expect.poll(async () => {
      const { data } = await db.from('workout_logs').select('*').eq('created_by', uid);
      log = (data || []).find(isMine);
      return !!log;
    }, { timeout: 20000, message: 'auto-finish should write the log' }).toBe(true);
    expect(log.program_id).toBe(program.id);
    expect(log.enrollment_id).toBe(enrollment.id);
    expect(log.workout_id).not.toBeNull();

    await expect.poll(async () => {
      const { data } = await db.from('program_enrollments').select('completed_workouts, current_day_index').eq('id', enrollment.id).single();
      return `${(data?.completed_workouts || []).map((c) => `${c.cycle}-${c.day_index}`).join(',')}|${data?.current_day_index}`;
    }, { timeout: 15000, message: 'auto-finish should complete cycle 1 / day 1 and advance' }).toBe('1-1|2');

    // The program no longer points at day 1: the next start is day 2.
    const { data: after } = await db.from('program_enrollments').select('current_day, current_week, status').eq('id', enrollment.id).single();
    expect([after.current_day, after.current_week, after.status]).toEqual([2, 1, 'active']);
  } finally {
    await cleanup(db, uid);
    if (otherActive?.length) await db.from('program_enrollments').update({ status: 'active' }).in('id', otherActive.map((e) => e.id));
  }
});
