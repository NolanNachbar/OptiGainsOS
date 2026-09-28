// Shared setup/cleanup for today-area r1 attack scripts (cases 09-15 slice:
// readiness/athlete-state, mind skills, coach).
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

export function log(pass, title, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${title} :: ${detail}`);
}

// ── skills ──────────────────────────────────────────────────────────────────
export async function insertTaggedSkill(fields) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('skills').insert({ created_by: uid, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function taggedSkills(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('skills').select('*')
    .eq('created_by', uid)
    .ilike('name', `OVN-${caseId}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function cleanupSkills(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('skills').delete()
    .eq('created_by', uid)
    .ilike('name', `OVN-${caseId}%`)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

// ── form_reviews (coach) ────────────────────────────────────────────────────
export async function insertTaggedReview(fields) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('form_reviews').insert({ created_by: uid, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function taggedReviews(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('form_reviews').select('*')
    .eq('created_by', uid)
    .ilike('clip_path', `%${caseId}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function cleanupReviews(caseId) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('form_reviews').delete()
    .eq('created_by', uid)
    .ilike('clip_path', `%${caseId}%`)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

// ── read-only helpers (athlete_state / engine_params / training_prescription) ─
export async function latestAthleteState(day) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('athlete_state').select('*')
    .eq('created_by', uid).lte('date', day).order('date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function latestEngineParams(day) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('engine_params').select('*')
    .eq('created_by', uid).lte('date', day).order('date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function todayPrescription(day) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('training_prescription').select('*')
    .eq('created_by', uid).eq('date', day).maybeSingle();
  if (error) throw error;
  return data;
}
