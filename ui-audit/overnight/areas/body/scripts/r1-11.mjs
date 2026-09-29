// body-r1-11: A same-day unrelated physique photo silently shifts the
// session-averaged BF% shown as the headline "est. BF" for an earlier
// same-day upload. Two sequential AI-vision calls (Groq budget) — run alone.
import { start, snap, report } from '../../../drive.mjs';
import { log, physiqueEntriesSince, deletePhysiqueIds, removePhysiqueStorage } from './_lib.mjs';
import { testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'body-r1-11';
const SCRATCH = '/tmp/claude-1000/-home-nolan-projects-SkyWyo/d06355e5-2a10-4383-9ef1-2cf100418235/scratchpad';
let s;
let createdPaths = [];
try {
  const sinceIso = new Date(Date.now() - 5000).toISOString();
  const uid = await testUserId();

  s = await start('/physique');
  await s.page.waitForTimeout(1000);

  // Upload #1: front-relaxed.
  await s.page.getByRole('button', { name: 'Front relaxed', exact: true }).click();
  await s.page.waitForTimeout(300);
  const fileInput = s.page.locator('input[type="file"]');
  await fileInput.setInputFiles(`${SCRATCH}/ovn-body-0.jpg`);
  await s.page.waitForTimeout(800);
  await snap(s.page, 'r1-11-upload1-review');

  await s.page.getByRole('button', { name: /^analyze$/i }).click();
  await s.page.waitForTimeout(20000); // AI vision call
  await snap(s.page, 'r1-11-upload1-done');

  let rpt = await report(s);
  let entries1 = await physiqueEntriesSince(sinceIso);
  if (entries1.length !== 1) {
    // CONFIRMED (2 consecutive runs): the analyze-physique edge function call
    // fails with a CORS preflight rejection ("Request header field apikey is
    // not allowed by Access-Control-Allow-Headers"), thrown as a pageerror.
    // Storage upload (which happens BEFORE the analyze call in confirmUpload,
    // PhysiqueTracker.jsx:222-232) still succeeds, orphaning a storage object
    // with no physique_entries row. This blocks r1-11's actual question
    // (session-averaging) entirely — analysis never completes even once.
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'analyze-physique edge function call fails CORS preflight ("apikey" header rejected) — physique photo analysis is completely broken, and the failed upload orphans a storage object',
      severity: 'crash', route: '/physique',
      steps: 'Open /physique, select a pose, upload a photo, tap Analyze.',
      expected: 'Photo is analyzed and a physique_entries row is created with the bodyfat estimate.',
      actual: `Analyze always fails: pageerror "...functions/v1/analyze-physique due to access control checks." / console "Request header field apikey is not allowed by Access-Control-Allow-Headers." Reproduced on 2 consecutive attempts. The storage upload (which runs before the analyze call) still succeeds each time, leaving an orphaned object in the 'physique' bucket with no corresponding DB row and no entry ever appearing in the UI.`,
      suspectFile: 'src/pages/PhysiqueTracker.jsx:39-58 (invokeAnalyzePhysique), :213-232 (confirmUpload: storage upload precedes the analyze call, no compensating cleanup on analyze failure) — likely a CORS header allowlist gap on the analyze-physique Supabase Edge Function itself, not app code.',
    })}`);
    log(false, CASE, `analyze-physique CORS failure blocks the whole flow; session-averaging question (this case's actual target) could not be tested. entries1=${entries1.length}`);
    throw new Error('BLOCKED: analyze-physique CORS failure, see FINDING above');
  }
  createdPaths.push(entries1[0].photo_path);
  const bf1 = entries1[0].bodyfat_estimate;

  const bodyTextBefore = await s.page.locator('body').innerText();
  const headlineBefore = (bodyTextBefore.match(/est\.?\s*BF[^\n]*?(\d+(\.\d+)?)\s*%/i) || [])[1];

  // Upload #2: unrelated pose, same day.
  await s.page.getByRole('button', { name: 'Back relaxed', exact: true }).click();
  await s.page.waitForTimeout(300);
  await fileInput.setInputFiles(`${SCRATCH}/ovn-body-1.jpg`);
  await s.page.waitForTimeout(800);
  await snap(s.page, 'r1-11-upload2-review');
  await s.page.getByRole('button', { name: /^analyze$/i }).click();
  await s.page.waitForTimeout(20000);
  await snap(s.page, 'r1-11-upload2-done');

  rpt = await report(s);
  const entries2 = await physiqueEntriesSince(sinceIso);
  if (entries2.length !== 2) throw new Error(`expected 2 entries after upload 2, got ${entries2.length}`);
  entries2.forEach(e => { if (!createdPaths.includes(e.photo_path)) createdPaths.push(e.photo_path); });

  const bodyTextAfter = await s.page.locator('body').innerText();
  const headlineAfter = (bodyTextAfter.match(/est\.?\s*BF[^\n]*?(\d+(\.\d+)?)\s*%/i) || [])[1];

  const changed = headlineBefore && headlineAfter && headlineBefore !== headlineAfter;
  const uiExplainsAveraging = /average|combined|session/i.test(bodyTextAfter);

  log(true, CASE, `bf1=${bf1} headlineBefore=${headlineBefore} headlineAfter=${headlineAfter} changed=${changed} uiExplainsAveraging=${uiExplainsAveraging}`);

  if (changed && !uiExplainsAveraging) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: 'A second, unrelated same-day physique photo silently shifts the headline "est. BF" (session-averaging with no UI explanation)',
      severity: 'error-msg', route: '/physique',
      steps: 'Upload one physique photo (pose: front-relaxed), note the headline est. BF. Later the same day upload a second, unrelated-pose photo.',
      expected: 'Either the UI explains multiple same-day shots are averaged into one session number, or it is visually obvious this is a multi-pose check-in — not a silent unexplained number change.',
      actual: `Headline est. BF changed from ${headlineBefore}% to ${headlineAfter}% after the second, unrelated upload, with no UI text distinguishing "averaged session" from "separate entries."`,
      suspectFile: 'src/pages/PhysiqueTracker.jsx:269-289',
    })}`);
  }
} finally {
  const entries = await physiqueEntriesSince(new Date(Date.now() - 120000).toISOString());
  if (entries.length) await deletePhysiqueIds(entries.map(e => e.id));
  if (createdPaths.length) await removePhysiqueStorage(createdPaths);
  console.log(`CLEANUP ${CASE} entriesDeleted=${entries.length} storageDeleted=${createdPaths.length}`);
  if (s) await s.close();
}
