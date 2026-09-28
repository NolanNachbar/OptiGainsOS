// Regression for today-r1-09.
//
// AthleteState.jsx called useEngineParams()/useTodayPrescription() with no
// date argument, so they fell back to the browser/device timezone instead of
// profile.timezone (the same "which day is it" resolution Today.jsx already
// uses). An athlete whose profile timezone differs from their device's
// (traveling, or a device set to a different zone) could load /athlete-state
// and find no row for "today" at all, even though the engine computed one.
// Fix: AthleteState.jsx now resolves `today` via getTodayString(profile?.timezone)
// and threads it into AdaptiveEnginePanel (and its own useEngineParams call).
//
// This deliberately does not fake the clock: page.clock + this app's
// TZDate-based getTodayString() don't mix reliably in this WebKit harness
// (TZDate's getters read the faked Date's device-local fields instead of the
// requested zone's), a harness artifact, not an app bug — confirmed by
// comparing against a clock-free Intl.DateTimeFormat computation of the same
// instant, which resolves correctly. Real time is used instead: the test
// harness's default device timezone is America/Denver, and Pacific/Kiritimati
// (UTC+14) is far enough ahead that its calendar date differs from Denver's
// for all but a few early-morning Denver hours. A training_prescription row
// is seeded only under the profile-timezone date (an exact eq('date', ...)
// lookup, unlike engine_params' lte-with-fallback query, so it cleanly
// distinguishes which timezone resolution the page used).
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const PROFILE_TZ = 'Pacific/Kiritimati';

function ymdInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

test('athlete-state resolves "today" via profile timezone, not the device timezone', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const now = new Date();
  const browserToday = ymdInTz(now, 'America/Denver');
  const profileToday = ymdInTz(now, PROFILE_TZ);
  // Rare (~a few hours a day near Denver's early morning): skip rather than
  // flake if the two zones happen to agree on the calendar date right now.
  test.skip(profileToday === browserToday, 'Denver and Kiritimati agree on the date right now');

  const CONFIDENCE = 0.87;

  const { data: origProfile, error: profErr } = await db
    .from('user_profiles').select('id, timezone').eq('created_by', uid).maybeSingle();
  expect(profErr).toBeNull();
  expect(origProfile).toBeTruthy();

  async function cleanup() {
    await db.from('training_prescription').delete().eq('created_by', uid).eq('date', profileToday);
    await db.from('training_prescription').delete().eq('created_by', uid).eq('date', browserToday);
    await db.from('user_profiles').update({ timezone: origProfile.timezone }).eq('id', origProfile.id);
  }
  await cleanup();

  try {
    await db.from('user_profiles').update({ timezone: PROFILE_TZ }).eq('id', origProfile.id);
    const { error: insErr } = await db.from('training_prescription').insert({
      created_by: uid, date: profileToday, session_type: 'rest',
      banister_state: { confidence: CONFIDENCE },
    });
    expect(insErr).toBeNull();

    // Engine internals panel is inline (no accordion tap needed) on desktop
    // widths; force that layout before anything mounts.
    await page.setViewportSize({ width: 1280, height: 900 });

    await signIn(page, '/athlete-state');
    await page.goto('/athlete-state');

    await expect(page.getByText('Model Confidence').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('87%').first()).toBeVisible({ timeout: 8000 });
  } finally {
    await cleanup();
  }
});
