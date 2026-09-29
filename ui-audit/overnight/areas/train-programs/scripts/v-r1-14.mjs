// VERIFY r1-14: offline enroll, click scoped to the dialog's confirm button.
import { start, cleanupCase, seedProgram } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
const NN = '14';
let s;
try {
  const { program } = await seedProgram(NN, { days: [{ day_index: 1, title: 'Day 1', exercises: [{ name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] }] });
  s = await start(`/program/${program.id}`);
  const sp = s.page.getByRole('button', { name: 'Start Program' });
  await sp.first().waitFor({ timeout: 10000 });
  console.log('startProgram buttons', await sp.count());
  for (let i = 0; i < await sp.count(); i++) { const b = sp.nth(i); const box = await b.boundingBox(); console.log(i, JSON.stringify(box)); }
  const hit = await s.page.evaluate(() => { const b=[...document.querySelectorAll('button')].filter(x=>x.innerText.includes('Start Program'))[1]; const r=b.getBoundingClientRect(); const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return e?.outerHTML.slice(0,160); });
  console.log('hit', hit);
  await sp.nth(1).click();
  await s.page.waitForTimeout(800);
  await s.page.screenshot({ path: '/tmp/claude-1000/-home-nolan-projects-SkyWyo/d06355e5-2a10-4383-9ef1-2cf100418235/scratchpad/v14.png' });
  await s.page.waitForTimeout(1500);
  console.log('dialogs', await s.page.locator('[role=dialog]').count(), 'hasTitle', await s.page.getByText('Starting weight', { exact: false }).count());
  const dlg = s.page;
  await dlg.locator('input[type=number]').first().fill('135');
  await s.page.evaluate(() => document.activeElement?.blur()); await s.page.waitForTimeout(800);
  if (!process.env.ONLINE) await s.context.setOffline(true);
  const btn = s.page.getByRole('button', { name: /^(Start Program|Starting\.\.\.)$/ }).last();
  console.log('confirm box', JSON.stringify(await btn.boundingBox()));
  console.log('confirmHit', await s.page.evaluate(() => { const bs=[...document.querySelectorAll('button')].filter(x=>/^(Start Program|Starting\.\.\.)$/.test(x.innerText.trim())); const b=bs[bs.length-1]; const r=b.getBoundingClientRect(); const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return JSON.stringify({n:bs.length, r:[r.x,r.y,r.width,r.height], same: e===b||b.contains(e), hit: e?.outerHTML.slice(0,120), vv: [window.innerHeight, visualViewport.height]}); }));
  await btn.click();
  await s.page.waitForTimeout(300);
  await s.page.screenshot({ path: '/tmp/claude-1000/-home-nolan-projects-SkyWyo/d06355e5-2a10-4383-9ef1-2cf100418235/scratchpad/v14b.png' });
  const samples = [];
  for (let i = 0; i < 4; i++) { await s.page.waitForTimeout(2500); samples.push({ t: (i+1)*2.5, label: await btn.innerText().catch(()=>null), disabled: await btn.isDisabled().catch(()=>null), errToast: /Failed to enroll/.test(await s.page.locator('body').innerText()) }); }
  const db = await testDb();
  const mid = (await db.from('program_enrollments').select('id').eq('program_id', program.id)).data.length;
  await s.context.setOffline(false);
  await s.page.waitForTimeout(8000);
  const dialogOpen = await s.page.getByText('Enter your current working weight').isVisible().catch(() => false);
  const okToast = /Enrolled!/.test(await s.page.locator('body').innerText());
  const fin = (await db.from('program_enrollments').select('id').eq('program_id', program.id)).data.length;
  console.log(JSON.stringify({ samples, enrollmentsWhileOffline: mid, afterReconnect: { dialogOpen, okToast, enrollments: fin } }));
} finally {
  console.log('cleanup', JSON.stringify(await cleanupCase(NN)));
  if (s) await s.close();
}
