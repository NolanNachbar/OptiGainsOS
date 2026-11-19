import { webkit, devices } from 'playwright';
const B='http://localhost:5195', O='reports/redesign-r1/';
const br=await webkit.launch();const ctx=await br.newContext({...devices['iPhone 13 Pro Max']});const p=await ctx.newPage();
await p.goto(B+'/fuel?bypass_auth=true');await p.waitForTimeout(3000);
await p.getByTestId('quick-add-button').click();await p.getByRole('menuitem',{name:'Weigh In'}).click();await p.waitForTimeout(1500);await p.screenshot({path:O+'sheet-weigh-in.png'});
await br.close();
