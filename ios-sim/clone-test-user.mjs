// Clones the real athlete's data into a clearly-labeled TEST auth user, so the
// ios-sim harness has realistic-looking screens without ever touching the real
// login. Run this ONCE, locally, in a terminal where only you hold the
// service-role key — it bypasses RLS and writes directly to production.
//
// Usage:
//   SUPABASE_URL=https://fizdftijlbcnjmemrvao.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key, never share/paste this> \
//   node ios-sim/clone-test-user.mjs
//
// Idempotent: re-running deletes and re-clones the test user's rows, it does
// not duplicate them on a second run.

import { createClient } from '@supabase/supabase-js';

const REAL_USER_ID = '169d2f0b-cf5a-44fb-8551-845004725a26'; // nvtnachbar@gmail.com, the real athlete
const TEST_EMAIL = 'optigains-sim-test@example.invalid';
const TEST_PASSWORD = 'OptiGainsSimTest_2026!';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (in your own shell, not shared with anyone).');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Tables that drive what the Today/Train/Fuel/Profile/Schedule screens show.
// Clone order matters: tables other rows reference by id (programs,
// program_enrollments) go first so their new ids exist before we remap FKs.
const TABLES = [
  { name: 'user_profiles' },
  { name: 'programs' },
  { name: 'program_enrollments', fkRemap: { program_id: 'programs' } },
  { name: 'program_workouts', fkRemap: { program_id: 'programs' } },
  { name: 'workout_logs', fkRemap: { program_id: 'programs', enrollment_id: 'program_enrollments' } },
  { name: 'body_weight_entries' },
  { name: 'food_entries' },
  { name: 'daily_readiness' },
  { name: 'recovery_metrics' },
  { name: 'garmin_activities' },
];

const SENSITIVE_KEY_RE = /token|secret|password|api_key/i;

function sanitize(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    out[k] = v;
  }
  return out;
}

async function main() {
  console.log(`Creating test auth user ${TEST_EMAIL} ...`);
  const { data: existingList } = await sb.auth.admin.listUsers();
  const existing = existingList?.users?.find((u) => u.email === TEST_EMAIL);

  const { data: created, error: createErr } = existing
    ? { data: { user: existing }, error: null }
    : await sb.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: {
          is_test_account: true,
          note: 'ios-sim harness test clone of the real athlete — not a real person, safe to delete',
        },
      });
  if (createErr) throw createErr;
  const testUserId = created.user.id;
  console.log(`Test user id: ${testUserId}`);

  // Clear any rows already belonging to this test user — both from a prior
  // run of this script, and from any DB trigger that auto-creates a blank
  // user_profiles row on signup — so the clone below never collides with them.
  console.log('Clearing any existing rows for the test user before cloning...');
  for (const { name } of TABLES) {
    await sb.from(name).delete().eq('created_by', testUserId);
  }

  const idMaps = {}; // tableName -> Map(oldId -> newId)

  for (const { name, fkRemap } of TABLES) {
    const { data: rows, error } = await sb.from(name).select('*').eq('created_by', REAL_USER_ID);
    if (error) {
      console.warn(`[skip] ${name}: ${error.message}`);
      continue;
    }
    if (!rows || rows.length === 0) {
      console.log(`[ok] ${name}: nothing to clone`);
      continue;
    }

    const map = new Map();
    const toInsert = rows.map((row) => {
      const clean = sanitize(row);
      const oldId = clean.id;
      delete clean.id; // let the DB generate a fresh primary key
      clean.created_by = testUserId;
      if (fkRemap) {
        for (const [col, refTable] of Object.entries(fkRemap)) {
          if (clean[col] != null && idMaps[refTable]) {
            clean[col] = idMaps[refTable].get(clean[col]) ?? null;
          }
        }
      }
      return { oldId, clean };
    });

    const { data: inserted, error: insErr } = await sb
      .from(name)
      .insert(toInsert.map((r) => r.clean))
      .select('id');
    if (insErr) {
      console.warn(`[fail] ${name}: ${insErr.message}`);
      continue;
    }

    inserted.forEach((row, i) => map.set(toInsert[i].oldId, row.id));
    idMaps[name] = map;
    console.log(`[ok] ${name}: cloned ${inserted.length} row(s)`);
  }

  // Make it unmistakable in the UI that this is a test account.
  await sb
    .from('user_profiles')
    .update({ display_name: 'TEST ACCOUNT (ios-sim clone)', username: 'optigains_test_clone' })
    .eq('created_by', testUserId);

  console.log('\nDone.');
  console.log(`SIM_EMAIL=${TEST_EMAIL}`);
  console.log(`SIM_PASSWORD=${TEST_PASSWORD}`);
}

main().catch((e) => {
  console.error('Clone failed:', e);
  process.exit(1);
});
