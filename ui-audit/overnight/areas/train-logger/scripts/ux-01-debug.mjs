import { start, controls } from '../../../drive.mjs';

const s = await start('/quick-workout');
await s.page.waitForTimeout(500);

const startFresh = s.page.getByRole('button', { name: /start fresh/i });
if (await startFresh.isVisible().catch(() => false)) {
  await startFresh.click();
  await s.page.waitForTimeout(500);
}

const input = s.page.getByPlaceholder('Exercise name');
if (await input.isVisible().catch(() => false)) {
  await input.fill('OVN-ux-01 Bench Press');
  await input.press('Enter');
  await s.page.waitForTimeout(800);
}

console.log(await controls(s.page));
await s.close();
