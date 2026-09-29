// Verify step: diff test account vs baseline.json (read-only).
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { readFileSync } from 'node:fs';
const b = JSON.parse(readFileSync(new URL('../baseline.json', import.meta.url)));
const db = await testDb(); const uid = await testUserId();
async function all(t, cols='*') { const { data, error } = await db.from(t).select(cols).eq('created_by', uid); if (error) throw error; return data; }
const enr = await all('program_enrollments'); const progs = await all('programs','id,title,created_at');
const pw = await all('program_workouts','id,program_id,scheduled_date,locked,override_source,title');
const wk = await all('workouts','id,title,created_at'); const ses = await all('workout_sessions','id,created_at,status,enrollment_id');
const logs = await all('workout_logs','id,program_id,log_date,created_at');
const diff = (name, cur, base) => { const s=new Set(base); const extra=cur.filter(r=>!s.has(r.id)); const cs=new Set(cur.map(r=>r.id)); const missing=base.filter(id=>!cs.has(id)); console.log(name, 'cur', cur.length, 'base', base.length, 'extra', JSON.stringify(extra), 'missing', JSON.stringify(missing)); };
diff('enrollments', enr, b.enrollmentIds.map(e=>e.id));
for (const e of b.allEnrollmentsFull) { const c = enr.find(x=>x.id===e.id); if (c && JSON.stringify(c)!==JSON.stringify(e)) { const ks=Object.keys(e).filter(k=>JSON.stringify(c[k])!==JSON.stringify(e[k])); console.log('enrollment changed', e.id, ks.map(k=>`${k}: ${JSON.stringify(e[k]).slice(0,80)} -> ${JSON.stringify(c[k]).slice(0,80)}`)); } }
diff('programs', progs, b.programIds);
diff('workouts', wk, b.libraryWorkoutIds);
diff('sessions', ses, b.workoutSessionIds);
diff('logs', logs, b.workoutLogIds);
console.log('program_workouts total', pw.length, 'lockedOrOverride', JSON.stringify(pw.filter(r=>r.locked||r.override_source)), 'scheduled future', pw.filter(r=>r.scheduled_date && r.scheduled_date>='2026-09-28').length);
