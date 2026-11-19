import { webkit, devices } from 'playwright';
const B='http://localhost:5197', O='/Users/nolan/NolanBrain/.claude/loop/optigains-redesign/shots-r3/';
const br=await webkit.launch();const ctx=await br.newContext({...devices['iPhone 13 Pro Max']});const p=await ctx.newPage();
const E=(n,e)=>console.log('ERR',n,e.message.split('\n')[0]);
await p.goto(B+'/today?bypass_auth=true');await p.waitForTimeout(3000);
try{await p.goto(B+'/quick-workout');await p.waitForTimeout(3000);await p.getByText(/Skip, straight/).click({timeout:4000}).catch(()=>{});await p.waitForTimeout(800);
await p.getByText('Leg Press',{exact:true}).first().click({timeout:5000});await p.waitForTimeout(2000);await p.screenshot({path:O+'logger.png',fullPage:true});
await p.getByLabel(/Set 1 weight in/).first().click({timeout:4000});await p.waitForTimeout(1500);await p.screenshot({path:O+'sheet-keypad.png'});console.log('ok logger')}catch(e){E('logger',e)}
await br.close();
