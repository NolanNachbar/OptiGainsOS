// verify r1: typed 516 in the edit dialog's Amount, saw 425 saved in r1-11.
// Isolate: tagged 258 g row, edit Amount -> 516, log locator target + values.
import { format } from 'date-fns';
import { start, report } from '../../../drive.mjs';
import { dismissKeyboard, insertTaggedEntry, taggedRows, cleanupByTag } from './_lib.mjs';
const CASE = 'fuel-v1-edit';
const variant = process.argv[2] || 'planned';
let s;
try {
  await insertTaggedEntry({ food_name: `OVN-${CASE} eggs`, date: format(new Date(), 'yyyy-MM-dd'), meal_type: 'breakfast',
    calories: 361, protein_grams: 31, carbs_grams: 0, fats_grams: 25.8, serving_size: 258, serving_unit: 'g', serving_grams: 290,
    planned: variant === 'planned' });
  s = await start('/fuel');
  const p = s.page;
  const row = p.locator(`text=OVN-${CASE} eggs`).first().locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.getByRole('button', { name: 'Edit entry' }).click();
  for (const t of [300]) {
    await p.waitForTimeout(t);
    console.log('t+', t, JSON.stringify(await p.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === 'Amount'); const i = l?.parentElement?.querySelector('input'); const trig = l?.parentElement?.querySelector('[role=combobox],select'); return { amt: i?.value, unit: trig?.innerText || trig?.value, focused: document.activeElement === i, active: document.activeElement?.id || document.activeElement?.tagName }; })));
  }
  console.log('inputs', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('input,select,button[role=combobox]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => { const l = e.id && document.querySelector(`label[for="${e.id}"]`); const lab = l?.innerText || e.closest('div')?.parentElement?.querySelector('label')?.innerText; return `${lab || '?'}|${e.id}|${e.value || e.innerText}`; }))));
  const amount = p.locator('label:text-is("Amount")').first().locator('xpath=following-sibling::div[1]//input[@type="number"]');
  const cnt = await amount.count();
  const desc = await amount.first().evaluate((e) => ({ id: e.id, inDialog: !!e.closest('[role=dialog]'), value: e.value, all: [...document.querySelectorAll('[role=dialog] input')].map((i) => `${i.id || i.name || i.type}=${i.value}`) }));
  console.log('locator count', cnt, JSON.stringify(desc));
  await amount.first().fill('516');
  const afterFill = await amount.first().inputValue();
  await p.waitForTimeout(200);
  await dismissKeyboard(p);
  const afterBlur = await amount.first().inputValue();
  const cal = await p.locator('#calories').inputValue().catch(() => 'n/a');
  console.log('afterFill', afterFill, 'afterBlur', afterBlur, 'calories field', cal);
  console.log('inputs before save', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('input')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => `${e.id}|${e.value}`))));
  p.on('console', (m) => { if (m.text().startsWith('AMT')) console.log(m.text()); });
  await p.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === 'Amount'); const i = l.parentElement.querySelector('input');
    for (const ev of ['input', 'change', 'wheel', 'keydown', 'focus']) i.addEventListener(ev, (e) => console.log('AMT', ev, e.inputType || e.key || e.deltaY || '', i.value), true); });
  const saveBtn = p.getByRole('button', { name: 'Save Changes' });
  await saveBtn.scrollIntoViewIfNeeded();
  console.log('amt after scroll to save', await amount.first().inputValue());
  await saveBtn.click({ timeout: 8000 });
  await p.waitForTimeout(1500);
  const rows = await taggedRows(CASE);
  console.log('saved', JSON.stringify(rows.map((r) => ({ serving_size: r.serving_size, calories: r.calories, serving_grams: r.serving_grams, unit: r.serving_unit }))));
  const rpt = await report(s);
} finally {
  console.log('CLEANUP', await cleanupByTag(CASE));
  if (s) await s.close();
}
