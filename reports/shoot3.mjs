import { webkit, devices } from 'playwright';
const B='http://localhost:5195', O='reports/redesign-r1/';
const br=await webkit.launch();const ctx=await br.newContext({...devices['iPhone 13 Pro Max']});const p=await ctx.newPage();
const shot=async(n,full=true)=>{await p.waitForTimeout(1500);await p.screenshot({path:O+n+'.png',fullPage:full});console.log('ok',n)};
await p.goto(B+'/quick-workout?bypass_auth=true');await p.waitForTimeout(3500);
try{await p.getByText('Leg Press',{exact:true}).first().click();await shot('logger');
 const w=p.getByLabel(/Set 1 weight in/).first();await w.click({timeout:4000});await shot('sheet-keypad',false)}catch(e){console.log('ERR logger',e.message.split('\n')[0])}
await p.goto(B+'/fuel?tab=body');await p.waitForTimeout(3000);
const btns=await p.getByRole('button').allInnerTexts();console.log(btns.join(' | ').slice(0,800));
await br.close();
