// train-logger-r1-06: Offline at the gym — log a set with no network, then reconnect.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-06';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'Bench Press',
    sets: [1, 2].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  await s.context.setOffline(true);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '155');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '6');
  await checkSet(s.page, 1);
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '155');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '5');
  await checkSet(s.page, 2);

  const errorDialogVisible = await s.page.getByRole('dialog').isVisible().catch(() => false);
  await snap(s.page, 'r1-06-offline-logged');

  await s.page.waitForTimeout(2000); // let failed auto-save attempts fire
  await s.context.setOffline(false);
  await s.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await s.page.waitForTimeout(3000); // let the 'online' retry flush

  const db = await testDb();
  const { data: sessionsAfterFlush } = await db.from('workout_sessions').select('*').eq('workout_id', workout.id);
  const flushedSets = sessionsAfterFlush?.[0]?.exercises?.[0]?.sets ?? [];
  const flushed = flushedSets.filter((st) => st.completed).length === 2
    && flushedSets.every((st) => st.weight === 155);

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);

  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const savedSets = logs?.[0]?.exercises?.[0]?.sets ?? [];
  const savedOk = savedSets.filter((st) => st.completed).length === 2 && savedSets.every((st) => st.weight === 155);

  const rpt = await report(s);
  const ok = !errorDialogVisible && flushed && logs?.length === 1 && savedOk;
  log(ok, CASE, `errorDialogVisible=${errorDialogVisible} flushedAfterOnline=${JSON.stringify(flushedSets)} finalLogRows=${logs?.length} savedSets=${JSON.stringify(savedSets)} problems=${JSON.stringify(rpt.problems)}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: offline logging + reconnect did not reliably flush/save the 2 real sets. flushedAfterOnline=${JSON.stringify(flushedSets)} savedSets=${JSON.stringify(savedSets)}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) { await s.context.setOffline(false).catch(() => {}); await s.close(); }
}
