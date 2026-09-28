// Shared setup/cleanup for train-programs r1 attack scripts.
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { ORIGIN } from '../../../drive.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

export function log(pass, title, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${title} :: ${detail}`);
}

export async function start(path = '/today') {
  const s = await launchIPhone({ appOrigin: ORIGIN, mode: 'standalone' });
  const problems = [];
  s.problems = problems;
  s.page.on('pageerror', (e) => problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  if (path !== '/today') { await s.page.goto(ORIGIN + path); await s.page.waitForTimeout(2000); }
  return s;
}

export const tag = (caseId, suffix = '') => `OVN-train-programs-r1-${caseId.replace('train-programs-r1-', '')}${suffix ? ' ' + suffix : ''}`;

export async function dismissKeyboard(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
}

// Insert a tagged v2 program + program_workouts directly (bypasses the
// PGRST204 notes bug — never send `notes`).
export async function seedProgram(nn, { days = [{ day_index: 1, title: 'Day 1', exercises: [{ name: 'Bench Press', sets: 3, rep_target: '5', rir_target: '2', rest_seconds: 120 }] }], numCycles = 1, durationWeeks = 1, daysPerWeek = days.length } = {}) {
  const db = await testDb();
  const uid = await testUserId();
  const title = `OVN-train-programs-r1-${nn}`;
  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid, title, schema_version: 2, num_cycles: numCycles,
    duration_weeks: durationWeeks, days_per_week: daysPerWeek, focus: 'strength',
  }).select().single();
  if (pErr) throw pErr;
  const rows = days.map((d) => ({ ...d, program_id: program.id, created_by: uid }));
  const { data: workouts, error: wErr } = await db.from('program_workouts').insert(rows).select();
  if (wErr) throw wErr;
  return { program, workouts };
}

export async function seedLibraryWorkout(nn, { exercises = [{ name: 'Squat', sets: 3, rep_target: '5' }], folder = null } = {}) {
  const db = await testDb();
  const uid = await testUserId();
  const title = `OVN-train-programs-r1-${nn} lib`;
  const { data, error } = await db.from('workouts').insert({ created_by: uid, title, exercises, folder }).select().single();
  if (error) throw error;
  return data;
}

export async function enrollDirect(nn, programId, progressionState = {}) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('program_enrollments').insert({
    created_by: uid, program_id: programId, status: 'active', current_cycle: 1,
    current_day_index: 1, current_week: 1, current_day: 1,
    progression_state: progressionState, completed_workouts: [],
    started_at: new Date().toISOString().slice(0, 10),
  }).select().single();
  if (error) throw error;
  return data;
}

// Cleanup: delete everything this case created, by title/tag linkage. FK-safe
// order: sessions/logs -> program_workouts -> enrollments -> programs -> library workouts.
export async function cleanupCase(nn) {
  const db = await testDb();
  const uid = await testUserId();
  const t = `OVN-train-programs-r1-${nn}`;
  const deleted = {};

  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `${t}%`);
  const progIds = (progs || []).map((p) => p.id);

  if (progIds.length) {
    const { data: enrs } = await db.from('program_enrollments').select('id').in('program_id', progIds);
    const enrIds = (enrs || []).map((e) => e.id);
    if (enrIds.length) {
      const { data: sess } = await db.from('workout_sessions').select('id').in('enrollment_id', enrIds).eq('created_by', uid);
      deleted.sessions = (sess || []).length;
      if (sess?.length) await db.from('workout_sessions').delete().in('id', sess.map((s) => s.id));
    }
    // workout_logs has NO title column (created_by, workout_id, program_id,
    // enrollment_id, log_date, exercises, duration_seconds, notes, pre_note,
    // post_note only) -- link by program_id, before the program row is
    // deleted below. A prior version of this filter used a nonexistent
    // `workout_title` column and silently deleted 0 rows every run; fixed
    // after finding an orphaned log left by r1-05-06's Finish click.
    const { data: logsDel } = await db.from('workout_logs').delete().in('program_id', progIds).select('id');
    deleted.workoutLogs = (logsDel || []).length;
    const { data: pw } = await db.from('program_workouts').delete().in('program_id', progIds).select('id');
    deleted.programWorkouts = (pw || []).length;
    const { data: enrDel } = await db.from('program_enrollments').delete().in('program_id', progIds).select('id');
    deleted.enrollments = (enrDel || []).length;
    const { data: progDel } = await db.from('programs').delete().in('id', progIds).select('id');
    deleted.programs = (progDel || []).length;
  } else {
    deleted.workoutLogs = 0;
  }

  const { data: libDel } = await db.from('workouts').delete().eq('created_by', uid).ilike('title', `${t}%`).select('id');
  deleted.libraryWorkouts = (libDel || []).length;

  return deleted;
}

export async function getEnrollment(id) {
  const db = await testDb();
  const { data, error } = await db.from('program_enrollments').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

const FINDINGS_PATH = new URL('../findings-r1-1.json', import.meta.url);
export async function appendFinding(finding) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  let arr = [];
  try { arr = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8')); } catch {}
  arr.push(finding);
  writeFileSync(FINDINGS_PATH, JSON.stringify(arr, null, 2));
}

const WISHES_PATH = new URL('../wishes.json', import.meta.url);
export async function appendWish(wish) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  let arr = [];
  try { arr = JSON.parse(readFileSync(WISHES_PATH, 'utf8')); } catch {}
  arr.push(wish);
  writeFileSync(WISHES_PATH, JSON.stringify(arr, null, 2));
}

// Simulates migration 20260928000000 being applied: intercepts POST/PATCH to
// program_workouts and strips the `notes` key from the request body so the
// PGRST204 (unapplied migration) doesn't block every create/update. Used only
// to exercise flows the migration blocks today; scripts using this note it in
// their finding's `evidence`.
export async function stripNotesRoute(page) {
  await page.route('**/rest/v1/program_workouts*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const data = req.postDataJSON();
      const strip = (o) => { if (o && typeof o === 'object') delete o.notes; return o; };
      const stripped = Array.isArray(data) ? data.map(strip) : strip(data);
      // PostgREST validates the insert against the `columns=` URL param too
      // (supabase-js sets it from the payload's keys), not just the body —
      // strip `notes` there as well or the 400 persists unchanged.
      let url = req.url();
      if (url.includes('columns=')) {
        const u = new URL(url);
        const cols = u.searchParams.get('columns');
        if (cols) {
          const kept = cols.split(',').filter((c) => decodeURIComponent(c.replace(/^"|"$/g, '')) !== 'notes');
          u.searchParams.set('columns', kept.join(','));
          url = u.toString();
        }
      }
      await route.continue({ postData: JSON.stringify(stripped), url });
    } else {
      await route.continue();
    }
  });
}

export async function getProgramWorkouts(programId) {
  const db = await testDb();
  const { data, error } = await db.from('program_workouts').select('*').eq('program_id', programId);
  if (error) throw error;
  return data;
}
