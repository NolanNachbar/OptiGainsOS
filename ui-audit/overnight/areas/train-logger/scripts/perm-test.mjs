import { start, controls, report } from '/home/nolan/projects/OptiGains/ui-audit/overnight/drive.mjs';
const s = await start('/train');
console.log((await controls(s.page)).split('\n').slice(0, 5).join('\n'));
await report(s); await s.close();
