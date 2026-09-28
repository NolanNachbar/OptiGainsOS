// verify variant of today-r1-08: NO client-side route delay. Tap Add, then
// reload after N ms, and check whether the real request (already on the wire)
// still lands. Separates a harness artifact (request held in the browser by
// page.route) from real in-flight loss.
import { start, report } from '../../../drive.mjs';
import { log, openAddTodo, dismissKeyboard, cleanupByTag, taggedRows } from './_lib1.mjs';
const CASE = 'today-r1-08v';
let s;
const results = [];
try {
  s = await start('/today');
  for (const delay of (process.env.DELAYS || "0,30,150").split(",").map(Number)) {
    const TEXT = `OVN-${CASE} d${delay}`;
    await openAddTodo(s.page);
    await s.page.getByPlaceholder('Add a task...').fill(TEXT);
    await dismissKeyboard(s.page);
    let sentAt = null;
    let respAt = null;
    const onReq = (r) => { if (r.method() === "POST" && r.url().includes("/todos")) sentAt = Date.now(); };
    const onResp = (r) => { if (r.request().method() === "POST" && r.url().includes("/todos")) respAt = Date.now(); };
    s.page.on("request", onReq); s.page.on("response", onResp);
    const t0 = Date.now();
    await s.page.getByRole('button', { name: 'Add', exact: true }).click();
    if (delay) await s.page.waitForTimeout(delay);
    await s.page.reload();
    await s.page.waitForTimeout(4500);
    const rows = (await taggedRows(CASE)).filter((r) => r.text === TEXT);
    const visible = await s.page.getByText(TEXT).count();
    s.page.off("request", onReq); s.page.off("response", onResp);
    results.push({ delay, requestSentMs: sentAt ? sentAt - t0 : null, responseMs: respAt ? respAt - t0 : null, rows: rows.length, visibleAfterReload: visible });
  }
  const rpt = await report(s);
  log(results.every((r) => r.rows === 1), CASE, JSON.stringify(results) + ` problems=${rpt.problems.length}`);
} finally {
  console.log(`CLEANUP ${CASE} deleted=${await cleanupByTag(CASE)}`);
  if (s) await s.close();
}
