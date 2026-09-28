// Regression for body-r1-11: analyze-physique (and estimate-meal,
// read-nutrition-label, estimate-food-macros, analyze-form) answered the CORS
// preflight with Access-Control-Allow-Headers: "authorization, content-type",
// but supabase-js 2.x sends `apikey` and `x-client-info` on every
// functions.invoke call, so the preflight failed and every call to these
// functions was silently broken in prod (verified: 0 POSTs reaching
// analyze-physique in 24h of function logs, only failed OPTIONS). Fix: match
// usda-proxy's allowlist, which already includes both headers.
//
// This is a static source check, not a live network test (SOURCE ONLY per
// the fix scope — deploying the functions is a separate, manual step).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const FUNCTIONS = [
  'analyze-physique',
  'estimate-meal',
  'read-nutrition-label',
  'estimate-food-macros',
  'analyze-form',
];

for (const fn of FUNCTIONS) {
  test(`${fn}/index.ts Access-Control-Allow-Headers includes apikey and x-client-info`, () => {
    const filePath = path.join(REPO_ROOT, 'supabase', 'functions', fn, 'index.ts');
    const src = readFileSync(filePath, 'utf8');
    const match = src.match(/Access-Control-Allow-Headers["']?\s*:\s*["']([^"']+)["']/);
    expect(match, `no Access-Control-Allow-Headers line found in ${fn}/index.ts`).not.toBeNull();
    const headers = match[1].split(',').map((h) => h.trim().toLowerCase());
    expect(headers).toContain('apikey');
    expect(headers).toContain('x-client-info');
    expect(headers).toContain('authorization');
    expect(headers).toContain('content-type');
  });
}
