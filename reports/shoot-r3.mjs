import { webkit, devices } from 'playwright';
const B='http://localhost:5197', O='/Users/nolan/NolanBrain/.claude/loop/optigains-redesign/shots-r3/';
const dev=devices['iPhone 13 Pro Max'];
const br=await webkit.launch();const ctx=await br.newContext({...dev});const p=await ctx.newPage();
const shot=async(n,full=true)=>{await p.waitForTimeout(2200);await p.screenshot({path:O+n+'.png',fullPage:full});const w=await p.evaluate(()=>document.documentElement.scrollWidth);console.log('ok',n,'sw',w)};
const E=(n,e)=>console.log('ERR',n,e.message.split('\n')[0]);
await p.goto(B+'/today?bypass_auth=true');await shot('today');await shot('today-fold',false);
const routes=[['train','/train'],['train-library','/train?tab=library'],['train-programs','/train?tab=programs'],['train-activity','/train?tab=activity'],['fuel','/fuel'],['fuel-hydration','/fuel?tab=hydration'],['fuel-body','/fuel?tab=body'],['lifts','/lifts'],['physique','/physique'],['weekly-schedule','/weekly-schedule'],['program-builder','/program-builder'],['athlete-state','/athlete-state'],['recovery','/recovery'],['brief-history','/brief-history'],['insights','/insights'],['mind','/mind'],['career','/career'],['coach','/coach'],['profile','/profile'],['food-tracker','/food-tracker']];
for(const [n,r] of routes){try{await p.goto(B+r);await p.waitForTimeout(3000);console.log(n,'->',new URL(p.url()).pathname+new URL(p.url()).search);await shot(n)}catch(e){E(n,e)}}
try{await p.goto(B+'/train?tab=programs');await p.waitForTimeout(2000);await p.locator('a[href^="/program/"]').first().click();await shot('program-detail')}catch(e){E('pd',e)}
try{await p.goto(B+'/today');await p.waitForTimeout(2500);await p.getByRole('button',{name:'Account menu'}).click();await shot('sheet-account-menu',false);await p.keyboard.press('Escape')}catch(e){E('acct',e)}
await p.goto(B+'/fuel');await p.waitForTimeout(3000);
try{await p.getByTestId('quick-add-button').click();await shot('sheet-quick-add-menu',false);await p.getByRole('menuitem',{name:/Log Food/i}).click();await shot('sheet-add-food',false);await p.keyboard.press('Escape')}catch(e){E('food',e)}
try{await p.goto(B+'/fuel');await p.waitForTimeout(3000);await p.getByTestId('quick-add-button').click();await p.getByRole('menuitem',{name:/Weigh/i}).click();await shot('sheet-weigh-in',false)}catch(e){E('weigh',e)}
try{await p.goto(B+'/today');await p.waitForTimeout(3000);await p.getByRole('button',{name:'Start',exact:true}).click({timeout:4000});await shot('sheet-checkin',false);await p.keyboard.press('Escape')}catch(e){E('checkin',e)}
try{await p.goto(B+'/quick-workout');await shot('logger-start',false);await p.getByText('Leg Press',{exact:true}).first().click({timeout:5000});await shot('logger');
 await p.getByLabel(/Set 1 weight in/).first().click({timeout:4000});await shot('sheet-keypad',false)}catch(e){E('logger',e)}
const c2=await br.newContext({...dev});const p2=await c2.newPage();await p2.goto(B+'/login');await p2.waitForTimeout(2500);await p2.screenshot({path:O+'login.png',fullPage:true});console.log('ok login');
await br.close();
