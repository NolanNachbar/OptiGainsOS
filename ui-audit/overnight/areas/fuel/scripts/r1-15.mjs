// fuel-r1-15: barcode scan not_found -> label-photo fallback -> cancel ->
// rescan doesn't leak stale scan data into the manual/label form.
//
// SCOPE CAVEAT (documented per the runbook's transparency expectation): this
// headless test environment has no real camera and no synthesized fake video
// device wired into the Playwright launch, so BrowserMultiFormatReader can
// never decode a real barcode. getUserMedia fails with NotFoundError, which
// BarcodeScanner.jsx routes to scanState="error" (src/components/nutrition/
// BarcodeScanner.jsx:47-61), NOT scanState="not_found". Both states share the
// exact same onNotFound(foundBarcode) callback wiring (error: line ~294,
// not_found: line ~257) into FoodTracker.jsx's handler (:3897-3901,
// setSearchQuery(barcode)), so "error" is used as the reachable proxy to
// exercise that shared plumbing. This does NOT exercise: the "Photograph the
// label" -> onScanLabel button (not_found-only, no error-state equivalent),
// or foundBarcode being non-empty (error-path foundBarcode is always "" —
// the failure happens before any decode). Those two are left untested here
// and called out as a residual gap rather than silently skipped.
//
// What IS verified empirically: (a) reopening the scanner after "Enter
// manually" starts a genuinely fresh attempt rather than reusing a cached
// error/not_found panel, and (b) the search field never accumulates or
// leaks stale text across repeated open/fail/enter-manually cycles — which
// is what the case's core concern (state bleeding between scans) is about.
//
// Source-level cross-check for the untested not_found path: FoodTracker.jsx's
// onNotFound always does `setSearchQuery(barcode)` with the CURRENT scan's
// barcode (an overwrite, not an append/merge), and resetForm() (called
// whenever Add Food is opened fresh) also clears searchQuery — so a second,
// different not_found barcode would overwrite rather than concatenate with
// the first. No accumulation bug is visible in the source for that path either.
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard } from './_lib.mjs';

const CASE = 'fuel-r1-15';

let s;
try {
  s = await start('/fuel');
  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);

  const scanBtn = s.page.getByRole('button', { name: 'Scan barcode' });
  await scanBtn.waitFor({ state: 'visible', timeout: 5000 });
  await scanBtn.click();
  await s.page.waitForTimeout(2500);

  const bodyText1 = await s.page.locator('body').innerText();
  const sawErrorState1 = /Camera unavailable/i.test(bodyText1);
  const sawNotFoundState1 = /Product not found/i.test(bodyText1);
  console.log(`${CASE} first scan attempt: sawErrorState=${sawErrorState1} sawNotFoundState=${sawNotFoundState1}`);
  if (!sawErrorState1 && !sawNotFoundState1) {
    console.log(`${CASE} bodySnippet="${bodyText1.slice(0, 300).replace(/\n/g, ' ')}"`);
    throw new Error('scanner reached neither error nor not_found state — cannot proceed');
  }

  // Whichever reachable failure state we landed on, tap its "Enter manually"
  // (both states expose this exact label -> onNotFound(foundBarcode)).
  const enterManuallyBtn = s.page.getByRole('button', { name: 'Enter manually' });
  await enterManuallyBtn.waitFor({ state: 'visible', timeout: 5000 });
  await enterManuallyBtn.click();
  await s.page.waitForTimeout(600);

  const scannerClosedAfterEnterManually = await s.page.getByRole('button', { name: 'Close scanner' }).isVisible().catch(() => false);
  const searchFieldValueAfterFirst = await s.page.locator('input[placeholder*="Search" i]').first().inputValue().catch(() => '(no search input found)');
  const bodyTextAfterEnterManually = await s.page.locator('body').innerText();
  // "Enter manually" from the error state fires the exact same toast as the
  // not_found path's own "Enter manually": FoodTracker.jsx's onNotFound
  // (:3897-3901) is a single handler shared by both scanState="error" and
  // scanState="not_found", and it unconditionally shows toast.info("Product
  // not found. Try searching manually."). In the error path no barcode was
  // ever decoded (the camera never started) — nothing was "not found", the
  // scanner simply never ran. This toast misinforms the user about what
  // actually happened.
  const sawMisleadingNotFoundToast = /Product not found\. Try searching manually\./i.test(bodyTextAfterEnterManually) && sawErrorState1;
  console.log(`${CASE} after Enter manually: scannerClosed=${!scannerClosedAfterEnterManually} searchFieldValue="${searchFieldValueAfterFirst}" sawMisleadingNotFoundToast=${sawMisleadingNotFoundToast}`);

  // Let the toast clear, then reopen the scanner a second time from the SAME
  // still-open Add Food dialog and confirm it starts a genuinely fresh
  // attempt (not a cached/stuck panel left over from the first failure).
  await s.page.waitForTimeout(3500);
  await dismissKeyboard(s.page);
  await scanBtn.click();
  await s.page.waitForTimeout(2500);
  const bodyText2 = await s.page.locator('body').innerText();
  const sawErrorState2 = /Camera unavailable/i.test(bodyText2);
  const staleToastStillVisible = /Product not found\. Try searching manually\./i.test(bodyText2);
  console.log(`${CASE} second scan attempt settled: sawErrorState2=${sawErrorState2} staleToastStillVisible=${staleToastStillVisible}`);

  await snap(s.page, 'r1-15-second-attempt');
  const rpt = await report(s);
  const noPageErrors = rpt.problems.filter((p) => p.type === 'pageerror').length === 0;

  // Judge: scanner resets cleanly between attempts (fresh state each open, no
  // stuck stale panel/toast), search field never accumulates stale text, and
  // — the confirmed bug — the "Enter manually" recovery action never claims
  // something specific ("Product not found") happened when it didn't.
  const cleanReset = !staleToastStillVisible && sawErrorState2 === sawErrorState1;
  const searchFieldClean = searchFieldValueAfterFirst === '' || searchFieldValueAfterFirst === '(no search input found)';
  const ok = cleanReset && searchFieldClean && noPageErrors && !sawMisleadingNotFoundToast;

  log(ok, CASE,
    `sawErrorState1=${sawErrorState1} sawNotFoundState1=${sawNotFoundState1} searchFieldValueAfterFirst="${searchFieldValueAfterFirst}" ` +
    `searchFieldClean=${searchFieldClean} sawMisleadingNotFoundToast=${sawMisleadingNotFoundToast} cleanReset=${cleanReset} ` +
    `sawErrorState2=${sawErrorState2} noPageErrors=${noPageErrors} ` +
    `(NOTE: not_found/onScanLabel path untested — no camera hardware, see script header)`);

  if (!ok) {
    console.log(`FINDING ${CASE}: onNotFound is a single handler shared by BarcodeScanner's "error" (camera never started/no barcode ever ` +
      `decoded) and "not_found" (a real barcode was decoded and looked up but matched no product) states. Its toast — ` +
      `"Product not found. Try searching manually." — is hardcoded regardless of which state triggered it. Reproduced live: with no camera ` +
      `available, tapping the barcode-scan icon lands on scanState="error" ("Camera unavailable" + errorMessage), and tapping its "Enter ` +
      `manually" button still shows "Product not found. Try searching manually." — telling the athlete their product wasn't found when in ` +
      `fact no scan or lookup ever happened at all. sawMisleadingNotFoundToast=${sawMisleadingNotFoundToast}. ` +
      `staleToastStillVisible=${staleToastStillVisible} searchFieldClean=${searchFieldClean} cleanReset=${cleanReset}. ` +
      `src/pages/FoodTracker.jsx:3897-3901 (onNotFound handler, single toast.info for both states) and ` +
      `src/components/nutrition/BarcodeScanner.jsx:264 (not_found "Enter manually") / :294 (error "Enter manually") both call the same ` +
      `onNotFound(foundBarcode) with no state-specific message.`);
  }
} finally {
  if (s) await s.close();
}
