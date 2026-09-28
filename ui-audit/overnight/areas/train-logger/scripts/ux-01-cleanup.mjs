// Deletes any workout_sessions rows tagged OVN-ux-01 left by the menu-order
// screenshot script (autosave creates a session as soon as an exercise is
// added, before Finish is ever tapped).
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const db = await testDb();
const uid = await testUserId();

const { data, error } = await db
  .from('workout_sessions')
  .select('id, exercises')
  .eq('created_by', uid)
  .eq('status', 'in_progress');
if (error) throw error;

const toDelete = (data || []).filter((r) =>
  JSON.stringify(r.exercises || '').includes('OVN-ux-01')
);
console.log(`found ${toDelete.length} tagged session(s) to delete`);
for (const row of toDelete) {
  const { error: delErr } = await db.from('workout_sessions').delete().eq('id', row.id);
  if (delErr) throw delErr;
  console.log('deleted', row.id);
}
