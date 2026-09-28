// today-r1-13: Coach — kill the network between clip upload and the
// analyze-form call. Uses page.route to fail the analyze-form invoke (no
// real Gemini call — zero paid-AI calls this case). Checks: (a) a clear
// error is shown, not a stuck spinner, (b) whether the uploaded clip in the
// 'physique' bucket is cleaned up or left orphaned (Coach.jsx:86-104 has a
// single try/catch around both awaits with no storage.remove on failure).
import { start, report, snap } from '../../../drive.mjs';
import { log } from './_lib2.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'today-r1-13';
let s;
let uploadedPath = null;
try {
  s = await start('/coach');
  await s.page.waitForTimeout(500);

  // Fail only the analyze-form function call; let the storage upload go through for real.
  await s.page.route('**/functions/v1/analyze-form', (route) => route.abort('failed'));

  const exerciseInput = s.page.getByPlaceholder('e.g. Back squat, conventional deadlift');
  await exerciseInput.fill(`OVN-${CASE} test lift`);

  const fileInput = s.page.locator('input[type=file]');
  await fileInput.setInputFiles({
    name: `OVN-${CASE}.mp4`,
    mimeType: 'video/mp4',
    buffer: Buffer.from('ovn-today-r1-13 fake clip bytes not a real video'),
  });
  await s.page.waitForTimeout(500);

  await s.page.getByRole('button', { name: /get critique/i }).click();
  await s.page.waitForTimeout(4000);

  await snap(s.page, 'r1-13-analyze-fail');
  const bodyText = await s.page.locator('body').innerText();
  const stuckWorking = /Working…|Coach is reviewing|Uploading clip/i.test(bodyText) && !/[A-Za-z].*(failed|error|try again)/i.test(bodyText);
  const rpt = await report(s);

  // Find what path the real upload landed at (physique/<uid>/form/<ts>.mp4) so we can check + clean it up.
  const uid = await testUserId();
  const db = await testDb();
  const { data: listing, error: listErr } = await db.storage.from('physique').list(`${uid}/form`, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });
  if (listErr) console.log(`storage list error: ${listErr.message}`);
  const recent = (listing || []).filter((f) => {
    const created = new Date(f.created_at || f.updated_at || 0).getTime();
    return Date.now() - created < 30000;
  });
  console.log(`recent physique/${uid}/form objects (last 30s): ${JSON.stringify(recent.map((f) => f.name))}`);
  const orphanFound = recent.length > 0;
  if (orphanFound) uploadedPath = `${uid}/form/${recent[0].name}`;

  const errorSurfaced = /error|failed|try again/i.test(bodyText);
  const ok = errorSurfaced && !stuckWorking;
  log(ok, CASE, `errorSurfaced=${errorSurfaced} stuckWorking=${stuckWorking} orphanFound=${orphanFound} problems=${rpt.problems.length}`);
  console.log(`FINDING ${CASE}: after analyze-form fails post-upload, errorSurfaced=${errorSurfaced} (${errorSurfaced ? 'good: setError shows a message, Coach.jsx:100-103' : 'BAD: no visible error, stuck spinner'}). Storage cleanup: ${orphanFound ? 'ORPHANED clip confirmed left in physique/' + uploadedPath + ' bucket — Coach.jsx:86-104 catch block never calls supabase.storage.from(\'physique\').remove([path]) on a post-upload failure' : 'no orphan object found in the 30s window (upload itself may not have completed before the abort, or storage listing timing missed it)'}`);
} finally {
  if (uploadedPath) {
    const db = await testDb();
    const { error } = await db.storage.from('physique').remove([uploadedPath]);
    console.log(`CLEANUP ${CASE} removed orphan ${uploadedPath} error=${error?.message || 'none'}`);
  } else {
    console.log(`CLEANUP ${CASE}: no storage object to remove`);
  }
  // also clean any form_reviews row that may have been created despite the abort (shouldn't happen, but be safe)
  const db = await testDb();
  const uid = await testUserId();
  const { data: cleaned } = await db.from('form_reviews').delete().eq('created_by', uid).ilike('exercise', `OVN-${CASE}%`).select('id');
  console.log(`CLEANUP ${CASE} form_reviews deleted=${cleaned?.length || 0}`);
  if (s) await s.close();
}
