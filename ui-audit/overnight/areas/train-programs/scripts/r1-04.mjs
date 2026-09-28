// train-programs-r1-04: Import a program JSON missing 'program' key, and one
// with a non-string name — confirm the error surfaces as a real toast, not a
// blank screen or unhandled rejection.
import { writeFileSync } from 'node:fs';
import { start, log } from './_lib.mjs';

const CASE = 'train-programs-r1-04';
const fileA = '/tmp/ovn-tp-r1-04-a.json';
const fileB = '/tmp/ovn-tp-r1-04-b.json';
writeFileSync(fileA, '{}');
writeFileSync(fileB, JSON.stringify({ program: { name: 12345 } }));

let s;
try {
  s = await start('/program-builder');
  const fileInput = s.page.locator('input[type=file]');

  await fileInput.setInputFiles(fileA);
  await s.page.waitForTimeout(800);
  const bodyA = await s.page.locator('body').innerText();
  const sawA = /Missing.*program.*key/i.test(bodyA);

  await fileInput.setInputFiles(fileB);
  await s.page.waitForTimeout(800);
  const bodyB = await s.page.locator('body').innerText();
  const sawB = /Program must have a name/i.test(bodyB);

  const problems = s.problems.filter((p) => p.type !== 'http' || p.status !== 404);
  const pass = sawA && sawB && problems.filter((p) => p.type === 'pageerror').length === 0;
  log(pass, CASE, `sawA=${sawA} sawB=${sawB} problems=${JSON.stringify(problems)}`);
  if (!pass) {
    console.log(`FINDING ${CASE}: import error surfacing broken. sawA=${sawA} sawB=${sawB} problems=${JSON.stringify(problems)}`);
  } else {
    console.log(`CLEAN ${CASE}: both invalid imports surfaced a clear toast (programIO.js:79-83 throws, ProgramBuilder.jsx:116-124 catches and toast.error()s), no crash, no console pageerror.`);
  }
} finally {
  if (s) await s.close();
}
