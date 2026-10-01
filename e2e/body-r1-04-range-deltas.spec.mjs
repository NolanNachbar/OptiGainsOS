// Body page: the weight module's 1W/1M/3M/6M/1Y/All range control (over the
// scatter+trend chart) and the delta triples below it (1W/1M/3M change,
// computed from the EWMA trend over ALL weigh-ins, not the range-windowed
// chart data). Seeds a controlled, monotonically-decreasing run of weigh-ins
// anchored in the FUTURE (not around "today") so these seeded rows are
// unambiguously the most recent entries for the account — the component
// anchors its "latest" point and its deltas on whichever row has the newest
// recorded_date across the WHOLE table, and the shared test account's real
// history (or other specs' backdated fixtures) could otherwise silently
// become "latest" (or get picked up as a 1W/1M/3M comparison point) and
// make the deltas this test asserts on non-deterministic. The seeded run
// reaches back far enough (95 days) that all three delta windows resolve
// against seeded rows, not the account's uncontrolled real history.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'body-r1-04';
const NOTE = `OVN-${CASE}`;

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 20 points, every 5 days, from +5 to +100 days out — safely past any real
// "today" data (so none of this is mistaken for, or collides with, the
// shared test account's actual history), but still reaching back far enough
// that even the 3M (90-day) cutoff from the latest point lands on a seeded
// row rather than falling through to the account's real, uncontrolled past.
// Weight declines ~1 lb/day between points, so the EWMA trend has an
// unambiguous, deterministic downward slope across all three delta windows.
const OFFSETS = [];
for (let d = 5; d <= 100; d += 5) OFFSETS.push(d);
const DATES = OFFSETS.map(dateOffset);
const rows = OFFSETS.map((offset) => ({
  recorded_date: dateOffset(offset),
  weight: 300 - offset, // offset 5 -> 295 lbs, offset 100 -> 200 lbs
  notes: NOTE,
}));

async function cleanup(uid, db) {
  await db.from('body_weight_entries').delete().eq('created_by', uid).in('recorded_date', DATES);
}

test('Body page range control and delta triples reflect a seeded weight trend', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    const { error: insertError } = await db
      .from('body_weight_entries')
      .insert(rows.map((r) => ({ ...r, created_by: uid })));
    expect(insertError).toBeFalsy();

    // Confirm the seed landed before loading the page.
    await expect.poll(async () => {
      const { data } = await db.from('body_weight_entries')
        .select('id').eq('created_by', uid).in('recorded_date', DATES);
      return data?.length || 0;
    }).toBe(rows.length);

    await signIn(page, '/fuel?tab=body');
    await page.waitForLoadState('networkidle');

    // Range control: 6 segments, 1M selected by default (useState("1M")).
    const oneMonth = page.getByRole('button', { name: '1M', exact: true });
    const oneWeek = page.getByRole('button', { name: '1W', exact: true });
    await expect(oneMonth).toHaveAttribute('aria-pressed', 'true');
    await expect(oneWeek).toHaveAttribute('aria-pressed', 'false');

    await oneWeek.click();
    await expect(oneWeek).toHaveAttribute('aria-pressed', 'true');
    await expect(oneMonth).toHaveAttribute('aria-pressed', 'false');

    // Delta triples (unaffected by the range control -- DeltaTriples is fed
    // allTrended, not the range-windowed chart data). All three periods fall
    // inside the seeded 95-day decline, so each must show a real,
    // negative-signed value with a down arrow -- never an em dash standing
    // in for missing history, and never a brand-colored hue on this data.
    const triples = page.locator('div.flex.items-center.gap-5.mt-3');
    await expect(triples).toBeVisible();

    for (const label of ['1W', '1M', '3M']) {
      const delta = triples.locator('div', { has: page.locator('span', { hasText: label }) }).first();
      await expect(delta).toContainText(/-\d/); // a real, negative numeric value
      await expect(delta.locator('svg')).toBeVisible(); // down-arrow icon present
    }
  } finally {
    await cleanup(uid, db);
  }
});
