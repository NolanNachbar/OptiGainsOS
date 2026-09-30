// r5 review, minor: e2e coverage gaps for the auto-finish rewrite (Part 3).
// Three cases the existing today-global-auto-finish-stale-session.spec.mjs
// doesn't exercise:
//   (a) the per-session active-logging registry actually SKIPS a session
//       that's open in a page right now, while a separate stale session in
//       parallel still gets swept (the old body[data-logging-active] bail
//       used to skip the whole sweep for BOTH once any logger was open).
//   (b) an empty stale session (silent 3h+, zero completed sets) closes
//       through the cancel path instead of sitting in_progress forever.
//   (c) two overlapping callers (the page's own mount check and the global
//       sweep) racing the same stale session id produce exactly one
//       workout_log, not two.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hasMarkerExercise(row, marker) {
  return Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === marker);
}

async function cleanupMarkers(uid, db, markers) {
  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const staleSessionIds = (sessions || [])
    .filter((s) => markers.some((m) => hasMarkerExercise(s, m)))
    .map((s) => s.id);
  if (staleSessionIds.length) await db.from('workout_sessions').delete().in('id', staleSessionIds);

  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const staleLogIds = (logs || [])
    .filter((l) => markers.some((m) => hasMarkerExercise(l, m)))
    .map((l) => l.id);
  if (staleLogIds.length) await db.from('workout_logs').delete().in('id', staleLogIds);
}

// The shared test account is used serially across the whole suite (workers:
// 1), but a leftover in_progress quick session from an unrelated spec would
// still confuse checkForActiveSession's unscoped-quick-workout query here, so
// every test in this file clears ALL in_progress quick sessions (workout_id
// and program_workout_id both null) up front, not just its own markers.
async function cleanupAnyQuickSession(uid, db) {
  await db
    .from('workout_sessions')
    .delete()
    .eq('created_by', uid)
    .eq('status', 'in_progress')
    .is('workout_id', null)
    .is('program_workout_id', null);
}

test.describe('r5 e2e coverage gaps', () => {
  test('A/B: an actively-open session is skipped by the sweep while a separate stale session is still auto-finished', async ({ page }) => {
    const CASE = 'r5ab';
    const A_MARKER = `OVN-${CASE}-A Lift`;
    const B_MARKER = `OVN-${CASE}-B Lift`;
    const uid = await testUserId();
    const db = await testDb();
    await cleanupAnyQuickSession(uid, db);
    await cleanupMarkers(uid, db, [A_MARKER, B_MARKER]);

    try {
      // Mount /quick-workout with nothing in-progress -- its own mount effect
      // creates a fresh session (A) and registers A's id in the active-logging
      // registry (src/lib/activeLoggingSessions.js) for as long as this page
      // stays mounted.
      await signIn(page, '/quick-workout');
      await page.waitForLoadState('networkidle');

      let aRow;
      await expect
        .poll(
          async () => {
            const { data } = await db
              .from('workout_sessions')
              .select('*')
              .eq('created_by', uid)
              .eq('status', 'in_progress')
              .is('workout_id', null)
              .is('program_workout_id', null)
              .order('created_at', { ascending: false })
              .limit(1);
            aRow = data?.[0];
            return !!aRow;
          },
          { timeout: 10000, message: 'QuickWorkout should create session A on mount' }
        )
        .toBe(true);
      const aId = aRow.id;
      const aUpdatedAt = isoHoursAgo(4);

      // Make A look stale to the sweep (silenceMs 4h >= 3h, ageMs 5h < 24h)
      // WITHOUT an UPDATE -- trg_workout_sessions_updated is a BEFORE UPDATE
      // trigger that stamps updated_at to now() unconditionally, so any
      // UPDATE here would immediately erase the backdate. Delete + reinsert
      // with the SAME id instead (no FK references workout_sessions.id, so
      // this is safe) -- INSERT never fires that trigger.
      await db.from('workout_sessions').delete().eq('id', aId);
      const { error: aErr } = await db.from('workout_sessions').insert({
        id: aId,
        created_by: uid,
        workout_id: null,
        program_workout_id: null,
        status: 'in_progress',
        start_time: isoHoursAgo(5),
        updated_at: aUpdatedAt,
        exercises: [{ name: A_MARKER, sets: [{ weight: 100, reps: 5, completed: true }] }],
      });
      expect(aErr).toBeNull();

      // A separate, separately-stale session B -- never opened in any page,
      // so nothing registers it. This is the one the sweep must still catch.
      const { data: bRow, error: bErr } = await db
        .from('workout_sessions')
        .insert({
          created_by: uid,
          workout_id: null,
          program_workout_id: null,
          status: 'in_progress',
          start_time: isoHoursAgo(5),
          updated_at: isoHoursAgo(4),
          exercises: [{ name: B_MARKER, sets: [{ weight: 100, reps: 5, completed: true }] }],
        })
        .select()
        .single();
      expect(bErr).toBeNull();
      const bId = bRow.id;

      // Drive the sweep. It already ran once on mount (before B existed), so
      // force another pass via visibilitychange, retrying since runningRef
      // silently drops an overlapping call.
      await expect
        .poll(
          async () => {
            await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            const { data } = await db.from('workout_sessions').select('status').eq('id', bId).single();
            return data?.status;
          },
          { timeout: 20000, message: 'B should auto-finish to completed' }
        )
        .toBe('completed');

      const { data: bLogs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
      expect((bLogs || []).filter((l) => hasMarkerExercise(l, B_MARKER)).length).toBe(1);

      // A: still open, untouched -- the registry skipped it, not the
      // staleness check (it qualifies exactly like B does).
      const { data: aAfter } = await db.from('workout_sessions').select('status, updated_at').eq('id', aId).single();
      expect(aAfter.status).toBe('in_progress');
      expect(new Date(aAfter.updated_at).getTime()).toBe(new Date(aUpdatedAt).getTime());
      expect((bLogs || []).filter((l) => hasMarkerExercise(l, A_MARKER)).length).toBe(0);
    } finally {
      await cleanupMarkers(uid, db, [A_MARKER, B_MARKER]);
      await cleanupAnyQuickSession(uid, db);
    }
  });

  test('an empty stale session (zero completed sets) is closed via cancel, not left in_progress forever', async ({ page }) => {
    const CASE = 'r5empty';
    const MARKER = `OVN-${CASE} Lift`;
    const uid = await testUserId();
    const db = await testDb();
    await cleanupAnyQuickSession(uid, db);
    await cleanupMarkers(uid, db, [MARKER]);

    try {
      const { data: row, error } = await db
        .from('workout_sessions')
        .insert({
          created_by: uid,
          workout_id: null,
          program_workout_id: null,
          status: 'in_progress',
          start_time: isoHoursAgo(5),
          updated_at: isoHoursAgo(4),
          // Zero COMPLETED sets -- sessionHasLoggedSets must read this as
          // empty even though an exercise row exists.
          exercises: [{ name: MARKER, sets: [{ weight: 100, reps: 5, completed: false }] }],
        })
        .select()
        .single();
      expect(error).toBeNull();
      const id = row.id;

      // Simulate the symptom the finding named: the cross-cutting flag was
      // left set (as if a session were still live) before this run's sweep,
      // via an init script so it lands before the app's own scripts run and
      // before Layout's first sweep fires.
      await page.addInitScript(() => localStorage.setItem('optigains-workout-active', '1'));
      await signIn(page, '/today');
      await page.waitForLoadState('networkidle');

      await expect
        .poll(
          async () => {
            const { data } = await db.from('workout_sessions').select('status').eq('id', id).single();
            return data?.status;
          },
          { timeout: 15000, message: 'empty stale session should close via cancel, not auto-finish' }
        )
        .toBe('cancelled');

      const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
      expect((logs || []).filter((l) => hasMarkerExercise(l, MARKER)).length).toBe(0);

      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('optigains-workout-active')), {
          timeout: 5000,
          message: 'optigains-workout-active should clear once the only in_progress session closes',
        })
        .toBe(null);
    } finally {
      await cleanupMarkers(uid, db, [MARKER]);
      await cleanupAnyQuickSession(uid, db);
    }
  });

  test('a double-invoke race (page mount check + global sweep on the same stale session) writes exactly one workout_log', async ({ page }) => {
    const CASE = 'r5race';
    const MARKER = `OVN-${CASE} Lift`;
    const uid = await testUserId();
    const db = await testDb();
    await cleanupAnyQuickSession(uid, db);
    await cleanupMarkers(uid, db, [MARKER]);

    try {
      const { data: row, error } = await db
        .from('workout_sessions')
        .insert({
          created_by: uid,
          workout_id: null,
          program_workout_id: null,
          status: 'in_progress',
          start_time: isoHoursAgo(5),
          updated_at: isoHoursAgo(4),
          exercises: [{ name: MARKER, sets: [{ weight: 100, reps: 5, completed: true }] }],
        })
        .select()
        .single();
      expect(error).toBeNull();
      const id = row.id;

      // Widen the window where QuickWorkout's own mount-time check and
      // Layout's global sweep are both mid-flight against this same session:
      // both paths read workout_logs (the same-day duplicate check inside
      // autoFinishStaleSession) before deciding whether to write. Delaying
      // that GET keeps both callers in-flight at once, which is exactly what
      // the in-flight Map in autoFinishSession.js has to survive without
      // producing two workout_logs rows.
      await page.route('**/rest/v1/workout_logs*', async (route) => {
        if (route.request().method() === 'GET') {
          await new Promise((r) => setTimeout(r, 1500));
        }
        await route.continue();
      });

      await signIn(page, '/quick-workout');
      await page.waitForLoadState('networkidle');

      await expect
        .poll(
          async () => {
            const { data } = await db.from('workout_sessions').select('status').eq('id', id).single();
            return data?.status;
          },
          { timeout: 20000, message: 'the raced session should still end up completed exactly once' }
        )
        .toBe('completed');

      // Give any second, slightly-delayed write a moment to have landed if
      // the dedup failed, then assert there's exactly one.
      await page.waitForTimeout(1000);
      const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
      expect((logs || []).filter((l) => hasMarkerExercise(l, MARKER)).length).toBe(1);

      // QuickWorkout re-checked the live status before showing Resume, so the
      // page should have moved straight past it into a fresh empty session,
      // never showing the dialog for a session the sweep already closed.
      await expect(page.getByText('Resume Workout?')).not.toBeVisible();
    } finally {
      await cleanupMarkers(uid, db, [MARKER]);
      await cleanupAnyQuickSession(uid, db);
    }
  });
});
