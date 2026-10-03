// Daily-loop journey: enrolling in a new program must pause the previous
// active enrollment (the same 'paused' state ProgramDetail's Pause uses, so the
// old program can resume). Before the fix useEnrollInProgram left it 'active'
// and Today's `find(status === 'active')` could pick the old program.
//
// Asserts: enroll in A, then B, both through the real program page -> A is
// 'paused', B is the only 'active' one, Today shows B's Day 1 and not A's.
// Second test: if two enrollments ever ARE active, Today picks the most
// recently started one regardless of row order.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'enroll-supersedes';
const TITLE = (k) => `OVN-${CASE} ${k}`;
const DAY = (k, i) => `OVN-${CASE} ${k} Day ${i}`;
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanup(db, uid) {
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).like('title', `OVN-${CASE} %`);
  const pIds = (progs || []).map((p) => p.id);
  if (pIds.length) {
    await db.from('program_enrollments').delete().in('program_id', pIds);
    await db.from('program_workouts').delete().in('program_id', pIds);
    await db.from('programs').delete().in('id', pIds);
  }
}

async function seedProgram(db, uid, k) {
  const { data: program, error } = await db.from('programs').insert({
    created_by: uid, title: TITLE(k), schema_version: 2, num_cycles: 4,
    duration_weeks: 4, days_per_week: 3, focus: 'strength',
  }).select().single();
  expect(error).toBeNull();
  const { error: wErr } = await db.from('program_workouts').insert([1, 2, 3].map((i) => ({
    program_id: program.id, created_by: uid, day_index: i, title: DAY(k, i), focus: 'strength',
    exercises: [{ name: `OVN-${CASE} ${k} Lift ${i}`, sets: 1, rep_target: '5' }],
  })));
  expect(wErr).toBeNull();
  return program;
}

async function enrollViaUi(page, programId) {
  await page.goto(`/program/${programId}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Start Program', exact: true }).first().click();
  await expect(page.locator('input[type="date"]')).toBeVisible();
  await page.getByRole('button', { name: 'Start Program', exact: true }).last().click();
}


let parked;
test.beforeEach(async () => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);
  const { data } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  parked = data || [];
  if (parked.length) await db.from('program_enrollments').update({ status: 'paused' }).in('id', parked.map((e) => e.id));
});
test.afterEach(async () => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);
  if (parked?.length) await db.from('program_enrollments').update({ status: 'active' }).in('id', parked.map((e) => e.id));
});

test('enrolling in B pauses A and Today shows B', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const a = await seedProgram(db, uid, 'A');
  const b = await seedProgram(db, uid, 'B');

  await signIn(page, '/today');
  await enrollViaUi(page, a.id);
  await expect.poll(async () => {
    const { data } = await db.from('program_enrollments').select('status').eq('program_id', a.id);
    return data?.map((e) => e.status);
  }, { timeout: 10000 }).toEqual(['active']);

  await enrollViaUi(page, b.id);
  await expect.poll(async () => {
    const { data } = await db.from('program_enrollments').select('status').eq('program_id', b.id);
    return data?.map((e) => e.status);
  }, { timeout: 10000 }).toEqual(['active']);

  await expect.poll(async () => {
    const { data } = await db.from('program_enrollments').select('status').eq('program_id', a.id);
    return data?.map((e) => e.status);
  }, { timeout: 10000, message: 'enrolling in B should pause A' }).toEqual(['paused']);
  const { data: active } = await db.from('program_enrollments').select('program_id').eq('created_by', uid).eq('status', 'active');
  expect(active.map((e) => e.program_id)).toEqual([b.id]);

  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(DAY('B', 1))).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(DAY('A', 1))).toHaveCount(0);
});

test('two active enrollments: Today picks the most recently started', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const a = await seedProgram(db, uid, 'A');
  const b = await seedProgram(db, uid, 'B');
  const { data: prof } = await db.from('profiles').select('timezone').eq('id', uid).maybeSingle();
  const tz = prof?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateIn = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  const base = { created_by: uid, status: 'active', current_cycle: 1, current_day_index: 1, current_week: 1, current_day: 1, completed_workouts: [] };
  // The more recently started one (B) is inserted FIRST, so row order favors A.
  const ins = await db.from('program_enrollments').insert({ ...base, program_id: b.id, started_at: `${dateIn(Date.now())}T12:00:00Z` });
  expect(ins.error).toBeNull();
  const ins2 = await db.from('program_enrollments').insert({ ...base, program_id: a.id, started_at: `${dateIn(Date.now() - 1 * DAY_MS)}T12:00:00Z` });
  expect(ins2.error).toBeNull();

  await signIn(page, '/today');
  await expect(page.getByText(DAY('B', 1))).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(DAY('A', 2))).toHaveCount(0);
});
