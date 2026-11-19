import { webkit, devices } from 'playwright';
const B='http://localhost:5195', O='reports/redesign-r1/';
const dev=devices['iPhone 13 Pro Max'];
const br=await webkit.launch();
const ctx=await br.newContext({...dev});
const p=await ctx.newPage();
const shot=async(n)=>{await p.waitForTimeout(2500);await p.screenshot({path:O+n+'.png',fullPage:true});console.log('ok',n)};
await p.goto(B+'/today?bypass_auth=true');await shot('today');
const routes=[['train','/train'],['train-library','/train?tab=library'],['train-programs','/train?tab=programs'],['train-activity','/train?tab=activity'],['fuel','/fuel'],['fuel-hydration','/fuel?tab=hydration'],['fuel-body','/fuel?tab=body'],['lifts','/lifts'],['physique','/physique'],['weekly-schedule','/weekly-schedule'],['program-builder','/program-builder'],['athlete-state','/athlete-state'],['recovery','/recovery'],['brief-history','/brief-history'],['insights','/insights'],['mind','/mind'],['career','/career'],['coach','/coach'],['profile','/profile'],['food-tracker','/food-tracker']];
for(const [n,r] of routes){try{await p.goto(B+r);await shot(n)}catch(e){console.log('ERR',n,e.message)}}
// program detail
try{await p.goto(B+'/train?tab=programs');await p.waitForTimeout(2000);const l=p.locator('a[href^="/program/"]').first();if(await l.count()){await l.click();await shot('program-detail')}else{const c=p.getByRole('button',{name:/view|open|details/i}).first();if(await c.count()){await c.click();await shot('program-detail')}else console.log('no program link')}}catch(e){console.log('ERR pd',e.message)}
// sheets
const tryClick=async(name,re)=>{try{const b=p.getByRole('button',{name:re}).first();await b.click({timeout:4000});await shot(name);await p.keyboard.press('Escape');}catch(e){console.log('ERR',name,e.message.split('\n')[0])}};
await p.goto(B+'/fuel');await p.waitForTimeout(2000);await tryClick('sheet-add-food',/add food|log food|^add$/i);
await p.goto(B+'/fuel?tab=body');await p.waitForTimeout(2000);await tryClick('sheet-weigh-in',/weigh|log weight|add weight/i);
// logger
try{await p.goto(B+'/quick-workout');await shot('logger-start');
 const s=p.getByRole('button',{name:/start|begin/i}).first(); if(await s.count()){await s.click();await p.waitForTimeout(1500)}
 await tryClick('logger-add-exercise',/add exercise/i);
 const opt=p.getByRole('option').first().or(p.locator('[role=dialog] button').nth(2));
 try{await p.locator('[role=dialog] li, [role=dialog] [role=option]').first().click({timeout:3000});}catch{}
 await shot('logger');
 try{await p.locator('input[inputmode="decimal"], input[type=number]').first().click({timeout:3000});await shot('sheet-keypad')}catch(e){console.log('ERR keypad')}
}catch(e){console.log('ERR logger',e.message)}
const c2=await br.newContext({...dev});const p2=await c2.newPage();await p2.goto(B+'/login');await p2.waitForTimeout(2500);await p2.screenshot({path:O+'login.png',fullPage:true});console.log('ok login');
await br.close();
