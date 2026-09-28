// READ-ONLY: row counts of Nolan's real usage per table (count only, no row
// data), to rank features by how often he uses them. Run by the orchestrator
// once; agents read usage.json and never touch the service key.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tables = [...new Set(execSync(`grep -rhoE "from\\(['\\"][a-z_]+['\\"]\\)" src`).toString().match(/[a-z_]+(?=['"]\))/g))].sort();
const since = new Date(Date.now() - 90 * 864e5).toISOString();
const out = {};
for (const t of tables) {
  let col, all;
  for (col of ['created_by', 'user_id']) { all = await db.from(t).select('*', { head: true, count: 'exact' }).eq(col, env.USER_ID); if (!all.error) break; }
  if (all.error) { out[t] = 'n/a (no owner column)'; continue; }
  const recent = await db.from(t).select('*', { head: true, count: 'exact' }).eq(col, env.USER_ID).gte('created_at', since);
  out[t] = { total: all.count, last90d: recent.error ? null : recent.count };
}
writeFileSync(new URL('./usage.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(out).filter(([, v]) => typeof v === 'object').map(([k, v]) => `${k} ${v.total}/${v.last90d}`).join('  '));
