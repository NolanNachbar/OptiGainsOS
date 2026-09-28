// Regression for fuel-r1-15: BarcodeScanner's "Enter manually" button on the
// camera-unavailable error state (getUserMedia fails/denied) calls the same
// onNotFound(foundBarcode) handler as the real not_found path, with
// foundBarcode still '' (its initial value, since nothing was ever scanned).
// FoodTracker's onNotFound toasted "Product not found" unconditionally, so
// an athlete who never got camera access was told their product "wasn't
// found" when no lookup ever happened. Fix: only toast when barcode is
// non-empty.
import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('camera-unavailable "Enter manually" does not show a misleading "Product not found" toast', async ({ page }) => {
  await signIn(page, '/fuel');

  await page.getByRole('button', { name: 'Add food' }).click();
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Scan barcode' }).click();

  // No real camera in this environment: getUserMedia fails and the scanner
  // lands on its "error" state.
  await expect(page.getByText('Camera unavailable')).toBeVisible({ timeout: 8000 });

  await page.getByRole('button', { name: 'Enter manually' }).click();

  // Check right away with a short, non-default timeout: sonner toasts
  // auto-dismiss after a few seconds, so a bare toHaveCount(0) with the
  // default 5s polling window would pass either way once it disappears on
  // its own — that isn't evidence the bug is fixed.
  await page.waitForTimeout(300);
  await expect(page.getByText('Product not found. Try searching manually.')).toHaveCount(0, { timeout: 500 });
});
