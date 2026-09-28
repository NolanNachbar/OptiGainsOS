// UX move 1 screenshot helper: open Quick Workout, add a tagged exercise, open
// its overflow menu, screenshot. Usage: node ux-01-menu-shot.mjs <before|after>
import { start, snap } from '../../../drive.mjs';

const tag = process.argv[2] || 'before';
const CASE = 'ux-01';

const s = await start('/quick-workout');
await s.page.waitForTimeout(500);

// Dismiss a resume dialog if one appears, starting fresh.
const startFresh = s.page.getByRole('button', { name: /start fresh/i });
if (await startFresh.isVisible().catch(() => false)) {
  await startFresh.click();
  await s.page.waitForTimeout(500);
}

// Add a tagged exercise via the add-exercise combobox. The dock overlaps the
// "Add exercise" button's hit target at this viewport, so submit with Enter.
const input = s.page.getByPlaceholder('Exercise name');
if (await input.isVisible().catch(() => false)) {
  await input.fill(`OVN-${CASE} Bench Press`);
  await input.press('Enter');
  await s.page.waitForTimeout(800);
}

// Open the exercise card's overflow menu (the unlabeled MoreVertical trigger
// beside the drag handle).
const menuBtn = s.page.locator('div.relative > button').first();
await menuBtn.click({ timeout: 5000 });
await s.page.waitForTimeout(400);

await snap(s.page, `tl-ux-exercise-menu-${tag}`);

await s.close();
