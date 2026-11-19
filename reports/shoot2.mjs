import { webkit, devices } from 'playwright';
const B='http://localhost:5195', O='reports/redesign-r1/';
const br=await webkit.launch();const ctx=await br.newContext({...devices['iPhone 13 Pro Max']});const p=await ctx.newPage();
const shot=async(n,full=true)=>{await p.waitForTimeout(1500);await p.screenshot({path:O+n+'.png',fullPage:full});console.log('ok',n)};
await p.goto(B+'/fuel?bypass_auth=true');await p.waitForTimeout(3000);
try{await p.getByTestId('quick-add-button').click();await shot('sheet-quick-add-menu',false);await p.getByRole('menuitem',{name:'Log Food'}).click();await shot('sheet-add-food',false);await p.keyboard.press('Escape')}catch(e){console.log('ERR food',e.message.split('\n')[0])}
await p.goto(B+'/fuel?tab=body');await p.waitForTimeout(3000);
try{await p.getByTestId('weight-log-value').first().scrollIntoViewIfNeeded();await p.getByTestId('weight-log-value').first().click();await shot('sheet-weigh-in',false)}catch(e){console.log('ERR weigh',e.message.split('\n')[0])}
await p.goto(B+'/today');await p.waitForTimeout(3000);
try{await p.getByRole('button',{name:'Start',exact:true}).click({timeout:4000});await shot('sheet-checkin',false);await p.keyboard.press('Escape')}catch(e){console.log('ERR checkin',e.message.split('\n')[0])}
await p.goto(B+'/quick-workout');await p.waitForTimeout(3000);
try{await p.getByRole('button',{name:/add exercise/i}).first().click();await p.waitForTimeout(1200);await p.locator('[role=dialog] button').filter({hasText:/press|squat|curl|row/i}).first().click({timeout:4000});await p.waitForTimeout(1500);await shot('logger');
 const w=p.getByLabel(/Set 1 weight in/).first();await w.click({timeout:4000});await shot('sheet-keypad',false)}catch(e){console.log('ERR logger',e.message.split('\n')[0])}
await br.close();
