// Daily-loop journey across a day boundary for a program (split) athlete:
// Today -> Start the prescribed program workout -> weigh-in prompt -> log a
// set -> Finish -> the NEXT day, Today offers the next day of the split, not
// the same workout again.
//
// How the app advances: program_workouts are placed on calendar dates from the
// enrollment's started_at (getProgramSchedule, one day per day_index), and
// Today shows the entry whose date is today (getTodayProgramWorkout). Finish
// records {cycle, day_index} in enrollment.completed_workouts. So "tomorrow"
// is simulated by moving the whole day-1 footprint (enrollment start, log,
// session, weigh-in) back one calendar day in the DB -- never the browser
// clock, which sends Supabase auth into a refresh loop and a 429.
//
// Asserts the whole chain:
//   1. day 1: Today shows the day-1 workout, Start asks for the weigh-in, the
//      logger opens on the program workout, Finish writes the log and the
//      enrollment's completion for cycle 1 / day 1
//   2. day 1 afterwards: Today reads "Logged today", not another Start
//   3. day 2: Today shows day 2 (a different title), Start is available, and
//      day 1's title is gone
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'finish-next-split-day';
const PROGRAM_TITLE = `OVN-${CASE} Split`;
const DAYS = [1, 2, 3].map((i) => ({
  day_index: i,
  title: `OVN-${CASE} Day ${i}`,
  exercise: `OVN-${CASE} Lift ${i}`,
}));
const DAY_MS = 24 * 60 * 60 * 1000;

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

test('finishing today\'s program workout: the next day shows the next day of the split, not the same one', async ({ browser }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);

  const { data: profile } = await db.from('profiles').select('timezone').eq('id', uid).maybeSingle();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateIn = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  const today = dateIn(Date.now());
  const yesterday = dateIn(Date.now() - DAY_MS);

  // Park everything on today that would change what Today shows, restoring it
  // in finally: other active enrollments (Today uses the first active one),
  // today's strength logs ("Logged today" hides Start), today's weigh-in and check-in.
  const { data: otherActive } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  if (otherActive?.length) await db.from('program_enrollments').update({ status: 'paused' }).in('id', otherActive.map((e) => e.id));
  const { data: priorLogs } = await db.from('workout_logs').select('*').eq('created_by', uid).eq('log_date', today);
  if (priorLogs?.length) await db.from('workout_logs').delete().in('id', priorLogs.map((l) => l.id));
  const { data: priorWeights } = await db.from('body_weight_entries').select('*').eq('created_by', uid).eq('recorded_date', today);
  await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', today);
  const { data: priorReadiness } = await db.from('daily_readiness').select('*').eq('created_by', uid).eq('date', today);
  await db.from('daily_readiness').delete().eq('created_by', uid).eq('date', today);

  try {
    const { data: program, error: pErr } = await db.from('programs').insert({
      created_by: uid, title: PROGRAM_TITLE, schema_version: 2, num_cycles: 4,
      duration_weeks: 4, days_per_week: 3, focus: 'strength',
    }).select().single();
    expect(pErr).toBeNull();
    const { error: wErr } = await db.from('program_workouts').insert(DAYS.map((d) => ({
      program_id: program.id, created_by: uid, day_index: d.day_index, title: d.title, focus: 'strength',
      exercises: [{ name: d.exercise, sets: 1, rep_target: '5' }],
    })));
    expect(wErr).toBeNull();
    const { data: enrollment, error: eErr } = await db.from('program_enrollments').insert({
      created_by: uid, program_id: program.id, status: 'active',
      started_at: `${today}T12:00:00Z`, current_cycle: 1, current_day_index: 1,
      current_week: 1, current_day: 1, completed_workouts: [],
    }).select().single();
    expect(eErr).toBeNull();

    // ── Day 1: Today -> Start -> weigh-in -> log a set -> Finish ──
    const day1 = await browser.newContext();
    const p1 = await day1.newPage();
    await signIn(p1, '/today');
    await expect(p1.getByText(DAYS[0].title)).toBeVisible({ timeout: 15000 });
    await p1.getByRole('button', { name: 'Start', exact: true }).click();

    // The weigh-in rides the Start gate (inside the check-in sheet): no weight
    // on record yet, so it asks. Enter one and check in, which continues into
    // the program logger.
    await expect(p1.getByRole('heading', { name: 'Quick check-in first' })).toBeVisible({ timeout: 10000 });
    await p1.getByRole('textbox', { name: /Bodyweight in/ }).fill('181.5');
    await p1.getByRole('button', { name: 'Check In', exact: true }).click();

    await expect(p1).toHaveURL(/workout-detail\?source=program/, { timeout: 10000 });
    await p1.getByRole('button', { name: 'Start Logging Workout' }).first().click();
    await p1.getByLabel(/Set 1 weight in/).first().fill('135');
    await p1.getByLabel(/Set 1 reps$/).first().fill('5');
    await p1.getByRole('checkbox', { name: /Mark set 1/ }).click();
    await expect(p1.getByRole('checkbox', { name: 'Mark set 1 incomplete' })).toBeVisible();
    await p1.getByRole('button', { name: 'Finish', exact: true }).click();
    await p1.getByRole('button', { name: 'Log Workout' }).click();

    let log;
    await expect.poll(async () => {
      const { data } = await db.from('workout_logs').select('*').eq('created_by', uid).eq('log_date', today);
      log = (data || []).find(isMine);
      return !!log;
    }, { timeout: 15000, message: 'Finish should write today\'s log' }).toBe(true);
    expect(log.exercises[0].name).toBe(DAYS[0].exercise);
    const { data: weighIn } = await db.from('body_weight_entries').select('weight').eq('created_by', uid).eq('recorded_date', today);
    expect(weighIn?.map((w) => Number(w.weight))).toEqual([181.5]);

    // The program records the completion for cycle 1 / day 1.
    await expect.poll(async () => {
      const { data } = await db.from('program_enrollments').select('completed_workouts').eq('id', enrollment.id).single();
      return (data?.completed_workouts || []).map((c) => `${c.cycle}-${c.day_index}`);
    }, { timeout: 15000, message: 'Finish should complete cycle 1 / day 1' }).toEqual(['1-1']);

    // Same day, back on Today: done, not another Start for the same workout.
    await p1.goto('/today');
    await expect(p1.getByText('Logged today, nice work.')).toBeVisible({ timeout: 15000 });
    await expect(p1.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
    await day1.close();

    // ── Midnight passes: move day 1's footprint back one calendar day. ──
    // Delete + reinsert with the same id (the BEFORE UPDATE trigger would
    // re-stamp updated_at); the enrollment start only needs a plain update.
    await db.from('program_enrollments').update({ started_at: `${yesterday}T12:00:00Z` }).eq('id', enrollment.id);
    const { data: logs } = await db.from('workout_logs').select('*').eq('created_by', uid).eq('log_date', today);
    for (const row of (logs || []).filter(isMine)) {
      await db.from('workout_logs').delete().eq('id', row.id);
      const { error } = await db.from('workout_logs').insert({
        ...row, log_date: yesterday,
        created_at: new Date(new Date(row.created_at).getTime() - DAY_MS).toISOString(),
      });
      expect(error).toBeNull();
    }
    const { data: sessions } = await db.from('workout_sessions').select('*').eq('created_by', uid);
    for (const row of (sessions || []).filter(isMine)) {
      await db.from('workout_sessions').delete().eq('id', row.id);
      const { error } = await db.from('workout_sessions').insert({
        ...row,
        start_time: new Date(new Date(row.start_time).getTime() - DAY_MS).toISOString(),
        updated_at: new Date(new Date(row.updated_at).getTime() - DAY_MS).toISOString(),
      });
      expect(error).toBeNull();
    }
    // Whatever weigh-in day 1 produced belongs to yesterday too.
    const { data: weights } = await db.from('body_weight_entries').select('*').eq('created_by', uid).eq('recorded_date', today);
    for (const row of weights || []) {
      await db.from('body_weight_entries').delete().eq('id', row.id);
      await db.from('body_weight_entries').insert({ ...row, recorded_date: yesterday });
    }

    // ── Day 2: open Today ──
    const day2 = await browser.newContext();
    const p2 = await day2.newPage();
    await signIn(p2, '/today');
    await expect(p2.getByText(DAYS[1].title)).toBeVisible({ timeout: 15000 });
    await expect(p2.getByText(DAYS[0].title)).toHaveCount(0);
    await expect(p2.getByText('Logged today, nice work.')).toHaveCount(0);
    await expect(p2.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    // Start on the new day goes to the program logger for day 2's workout.
    const { data: pws } = await db.from('program_workouts').select('id, day_index').eq('program_id', program.id);
    const day2Id = pws.find((w) => w.day_index === 2).id;
    await p2.getByRole('button', { name: 'Start', exact: true }).click();
    const skip2 = p2.getByRole('button', { name: 'Skip, straight to the session' });
    if (await skip2.isVisible({ timeout: 5000 }).catch(() => false)) await skip2.click();
    await expect(p2).toHaveURL(new RegExp(`programWorkoutId=${day2Id}`), { timeout: 10000 });
    await day2.close();
  } finally {
    await cleanup(db, uid);
    await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', today);
    await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', yesterday).eq('weight', 181.5);
    await db.from('daily_readiness').delete().eq('created_by', uid).eq('date', today);
    if (priorReadiness?.length) await db.from('daily_readiness').insert(priorReadiness);
    if (priorWeights?.length) await db.from('body_weight_entries').insert(priorWeights.map(({ id, created_at, ...rest }) => rest));
    if (priorLogs?.length) await db.from('workout_logs').insert(priorLogs);
    if (otherActive?.length) await db.from('program_enrollments').update({ status: 'active' }).in('id', otherActive.map((e) => e.id));
  }
});
