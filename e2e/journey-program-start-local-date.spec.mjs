// Daily-loop journey: starting a program in the evening (local date != UTC
// date) must stamp the LOCAL date as the enrollment start. The schedule reader
// (getProgramSchedule / Today) counts days from started_at as a local calendar
// date, so a UTC-derived stamp shifts the whole schedule a day: Today would
// show nothing / the wrong day instead of Day 1.
//
// No clock games (moving the browser clock breaks Supabase auth with a 429).
// The browser context gets a timezoneId chosen at runtime so the local date
// differs from the UTC date RIGHT NOW (see journey-food-after-midnight).
//
// Asserts: enroll through the real program page -> started_at is the local
// date in that zone (not the UTC date) -> Today shows Day 1 of the program.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'program-start-local-date';
const PROGRAM_TITLE = `OVN-${CASE} Split`;
const DAY1_TITLE = `OVN-${CASE} Day 1`;

const ymdIn = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

const utcDate = ymdIn('UTC');
const TZ = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Pacific/Auckland', 'America/Denver']
  .find((tz) => ymdIn(tz) !== utcDate);
const localToday = ymdIn(TZ);

test.use({ timezoneId: TZ });

async function cleanup(db, uid) {
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).eq('title', PROGRAM_TITLE);
  const pIds = (progs || []).map((p) => p.id);
  if (pIds.length) {
    await db.from('program_enrollments').delete().in('program_id', pIds);
    await db.from('program_workouts').delete().in('program_id', pIds);
    await db.from('programs').delete().in('id', pIds);
  }
}

test('starting a program when local date != UTC date stamps the local date and Today shows Day 1', async ({ page }) => {
  expect(TZ, 'a zone whose date differs from UTC right now').toBeTruthy();
  expect(localToday).not.toBe(utcDate);
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(db, uid);

  // Today uses the first active enrollment: park the test account's others,
  // restoring them in finally.
  const { data: otherActive } = await db.from('program_enrollments').select('id').eq('created_by', uid).eq('status', 'active');
  if (otherActive?.length) await db.from('program_enrollments').update({ status: 'paused' }).in('id', otherActive.map((e) => e.id));

  // Today resolves "today" in the PROFILE timezone (test account: America/Denver,
  // which only straddles UTC for part of the day). Align it with the browser
  // zone for the run so the two agree, and restore it in finally.
  const { data: prof } = await db.from('user_profiles').select('timezone').eq('created_by', uid).maybeSingle();
  const origTz = prof?.timezone ?? null;
  if (prof) await db.from('user_profiles').update({ timezone: TZ }).eq('created_by', uid);

  try {
    const { data: program, error: pErr } = await db.from('programs').insert({
      created_by: uid, title: PROGRAM_TITLE, schema_version: 2, num_cycles: 4,
      duration_weeks: 4, days_per_week: 3, focus: 'strength',
    }).select().single();
    expect(pErr).toBeNull();
    const { error: wErr } = await db.from('program_workouts').insert([1, 2, 3].map((i) => ({
      program_id: program.id, created_by: uid, day_index: i, title: `OVN-${CASE} Day ${i}`, focus: 'strength',
      exercises: [{ name: `OVN-${CASE} Lift ${i}`, sets: 1, rep_target: '5' }],
    })));
    expect(wErr).toBeNull();

    // ── Enroll through the real UI, accepting the default start date ──
    await signIn(page, `/program/${program.id}`);
    await page.getByRole('button', { name: 'Start Program', exact: true }).first().click();
    // The enroll sheet is not exposed as role=dialog; key off its date input.
    await expect(page.locator('input[type="date"]')).toHaveValue(localToday);
    await page.getByRole('button', { name: 'Start Program', exact: true }).last().click();

    let enr;
    await expect.poll(async () => {
      const { data } = await db.from('program_enrollments').select('*').eq('program_id', program.id);
      enr = data?.[0];
      return data?.length ?? 0;
    }, { timeout: 10000, message: 'the UI should create one enrollment' }).toBe(1);
    expect(String(enr.started_at).slice(0, 10)).toBe(localToday);

    // ── Today reads it back as Day 1 ──
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(DAY1_TITLE)).toBeVisible({ timeout: 15000 });
  } finally {
    await cleanup(db, uid);
    if (prof) await db.from('user_profiles').update({ timezone: origTz }).eq('created_by', uid);
    if (otherActive?.length) await db.from('program_enrollments').update({ status: 'active' }).in('id', otherActive.map((e) => e.id));
  }
});
