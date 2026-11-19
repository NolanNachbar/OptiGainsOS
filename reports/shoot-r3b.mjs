import { webkit, devices } from 'playwright';
const B='http://localhost:5197', O='/Users/nolan/NolanBrain/.claude/loop/optigains-redesign/shots-r3/';
const br=await webkit.launch();const ctx=await br.newContext({...devices['iPhone 13 Pro Max']});const p=await ctx.newPage();
await p.goto(B+'/today?bypass_auth=true');await p.waitForTimeout(6000);await p.screenshot({path:O+'today.png',fullPage:true});
for(const n of ['lifts','physique']){await p.goto(B+'/'+n);await p.waitForTimeout(7000);await p.screenshot({path:O+n+'.png',fullPage:true});console.log('ok',n)}
await br.close();
