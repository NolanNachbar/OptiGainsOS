// Shared setup/cleanup for body r1 attack scripts.
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

export async function dismissKeyboard(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- body_weight_entries ----
export async function deleteWeightByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('body_weight_entries').delete()
    .eq('created_by', uid).eq('recorded_date', date).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function weightRowsByNote(pattern) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('body_weight_entries').select('*')
    .eq('created_by', uid).ilike('notes', pattern).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
export async function weightRowsByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('body_weight_entries').select('*')
    .eq('created_by', uid).eq('recorded_date', date);
  if (error) throw error;
  return data;
}
export async function deleteWeightIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('body_weight_entries').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}

// ---- measurements ----
export async function measurementRowsByNote(pattern) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('measurements').select('*')
    .eq('created_by', uid).ilike('notes', pattern).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
export async function deleteMeasurementIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('measurements').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}

// ---- water_logs ----
export async function newWaterLogsSince(sinceIso) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('water_logs').select('*')
    .eq('created_by', uid).gt('logged_at', sinceIso).order('logged_at', { ascending: true });
  if (error) throw error;
  return data;
}
export async function deleteWaterIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('water_logs').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}

// ---- supplement_types / supplement_logs ----
export async function supplementTypeByName(name) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('supplement_types').select('*')
    .eq('created_by', uid).eq('name', name).maybeSingle();
  if (error) throw error;
  return data;
}
export async function insertSupplementType(fields) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('supplement_types').insert({ created_by: uid, ...fields }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteSupplementLogIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('supplement_logs').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function deleteSupplementTypeIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('supplement_types').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function supplementLogsByType(typeId, sinceIso) {
  const db = await testDb();
  const uid = await testUserId();
  let q = db.from('supplement_logs').select('*').eq('created_by', uid).eq('supplement_type_id', typeId);
  if (sinceIso) q = q.gt('taken_at', sinceIso);
  const { data, error } = await q.order('taken_at', { ascending: true });
  if (error) throw error;
  return data;
}

// ---- daily_readiness / soreness_logs ----
export async function readinessByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('daily_readiness').select('*')
    .eq('created_by', uid).eq('date', date).maybeSingle();
  if (error) throw error;
  return data;
}
export async function sorenessByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('soreness_logs').select('*')
    .eq('created_by', uid).eq('date', date);
  if (error) throw error;
  return data;
}
export async function deleteReadinessByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('daily_readiness').delete()
    .eq('created_by', uid).eq('date', date).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function deleteSorenessByDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('soreness_logs').delete()
    .eq('created_by', uid).eq('date', date).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function upsertReadiness(row) {
  const db = await testDb();
  const { error } = await db.from('daily_readiness').upsert(row, { onConflict: 'created_by,date' });
  if (error) throw error;
}
export async function upsertSoreness(row) {
  const db = await testDb();
  const { error } = await db.from('soreness_logs').upsert(row, { onConflict: 'created_by,date,muscle_group' });
  if (error) throw error;
}

// ---- profile ----
export async function getProfile() {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('user_profiles').select('*').eq('created_by', uid).maybeSingle();
  if (error) throw error;
  return data;
}
export async function setCurrentWeight(value) {
  const db = await testDb();
  const uid = await testUserId();
  const { error } = await db.from('user_profiles').update({ current_weight: value }).eq('created_by', uid);
  if (error) throw error;
}

// ---- physique ----
export async function physiqueEntriesSince(sinceIso) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('physique_entries').select('*')
    .eq('created_by', uid).gt('created_at', sinceIso).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
export async function deletePhysiqueIds(ids) {
  if (!ids?.length) return 0;
  const db = await testDb();
  const { data, error } = await db.from('physique_entries').delete().in('id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}
export async function listPhysiqueStorage(prefix) {
  const db = await testDb();
  const { data, error } = await db.storage.from('physique').list(prefix);
  if (error) throw error;
  return data || [];
}
export async function removePhysiqueStorage(paths) {
  if (!paths?.length) return { error: null };
  const db = await testDb();
  return db.storage.from('physique').remove(paths);
}

export { todayStr };
