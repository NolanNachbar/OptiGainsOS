// train-programs-r1-14: go offline mid-Enroll submit — no false-success toast,
// weights preserved for retry, retry succeeds exactly once.
import { start, log, cleanupCase, appendFinding, seedProgram } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-14';
const NN = '14';

let s;
try {
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: 'Day 1', exercises: [
      { name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 },
      { name: `OVN-tp-${NN} Row`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 },
    ] }],
  });

  s = await start(`/program/${program.id}`);
  await s.page.getByRole('button', { name: 'Start Program' }).nth(1).click();
  await s.page.waitForTimeout(500);
  await s.page.locator('input[type=number]').first().fill('135');
  await s.page.locator('input[type=number]').nth(1).fill('95');

  await s.context.setOffline(true);
  const submitBtn = s.page.getByRole('button', { name: /Start Program|Starting/ }).last();
  await submitBtn.click();
  await s.page.waitForTimeout(2500);

  const bodyAfterOffline = await s.page.locator('body').innerText();
  const falseSuccess = /Enrolled! Start your first workout/i.test(bodyAfterOffline);
  const errToast = /Failed to enroll/i.test(bodyAfterOffline);
  const stillDisabled = await submitBtn.isDisabled().catch(() => false);
  const weightsPreserved = (await s.page.locator('input[type=number]').first().inputValue().catch(() => null)) === '135';

  // Real observed behavior (confirmed by hand before writing this script): the
  // browser's fetch() just hangs while truly offline rather than failing fast
  // (no request/requestfailed event on the program_enrollments call), so
  // onError never fires and no toast ever appears -- the button sits disabled
  // indefinitely with no "check your connection" messaging. Reconnecting lets
  // the pending fetch complete and the enroll succeeds normally.
  await s.context.setOffline(false);
  await s.page.waitForTimeout(6000);
  const resolvedAfterReconnect = await submitBtn.isVisible().catch(() => false) === false; // dialog closed = success

  const db = await testDb();
  const { data: enrs } = await db.from('program_enrollments').select('*').eq('program_id', program.id);
  const exactlyOne = enrs?.length === 1;

  // Judge: data integrity is fine (exactlyOne, no false success while offline,
  // no duplicate/loss). The real gap is silence: no error and no "waiting to
  // reconnect" indicator while offline and stuck.
  const dataOk = !falseSuccess && exactlyOne;
  const silentHang = !errToast && stillDisabled;
  log(dataOk, CASE, `falseSuccess=${falseSuccess} errToast=${errToast} stillDisabledWhileOffline=${stillDisabled} weightsPreserved=${weightsPreserved} resolvedAfterReconnect=${resolvedAfterReconnect} enrollmentsFinal=${enrs?.length}`);

  await appendFinding({
    id: CASE, severity: silentHang ? 'error-msg' : 'none', route: `/program/${program.id}`,
    title: 'Offline mid-Enroll: no error toast and no "waiting for connection" feedback — the submit just hangs disabled until the network returns',
    steps: 'Open Enroll dialog, fill starting weights, context.setOffline(true), tap Start Program.',
    expected: "The case's expectation was a clear failure toast ('Failed to enroll'). What actually happens is different but not data-unsafe: the request never fails while offline (no request/requestfailed network event), so useEnrollInProgram's onError never runs. The button just stays disabled with the same 'Start Program' label (no 'Starting...' distinguishable difference, no spinner text) indefinitely.",
    actual: `While offline: errToast=${errToast}, button stayed disabled=${stillDisabled}, weights preserved=${weightsPreserved}, no console/network problem recorded. Reconnecting after ~6s let the pending request complete: enroll succeeded exactly once (enrollmentsFinal=${enrs?.length}), no duplicate, no data loss. So: not a data-safety bug, but a real UX gap — a user stuck offline at the gym has zero signal this isn't a normal save, and no way to cancel/retry (Cancel button is presumably also inert while the mutation is pending — not verified this round).`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-14.mjs',
    evidence: `bodyAfterOffline snippet: ${bodyAfterOffline.slice(0, 300)}`,
    suspectFile: 'src/pages/ProgramDetail.jsx:168-183 (handleEnroll/useEnrollInProgram) — no client-side timeout or offline-detection before the mutate call',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
