// Assertions for the pure nutrition helpers. Run: node scripts/test_food_log.mjs
// Bundles each module with esbuild in memory, so no build output is written.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(rel) {
  const out = await build({
    entryPoints: [path.join(root, rel)],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "error",
    plugins: [{
      name: "stub-usda",
      setup(b) {
        b.onResolve({ filter: /^\.\/usda$/ }, () => ({ path: "usda-stub", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export async function lookupByGtin(){return null}",
          loader: "js",
        }));
      },
    }],
  });
  const code = out.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const F = await load("src/utils/foodLog.js");
const N = await load("src/utils/nutritionUtils.js");
const O = await load("src/api/openFoodFacts.js");

// ── tap guard
{
  let t = 0;
  const g = F.createTapGuard(800, () => t);
  assert.equal(g.tryAcquire("a"), true);
  assert.equal(g.tryAcquire("a"), false);
  assert.equal(g.tryAcquire("b"), false);
  g.release(); t = 100;
  assert.equal(g.tryAcquire("a"), false);
  assert.equal(g.tryAcquire("b"), true);
  g.release(); t = 2000;
  assert.equal(g.tryAcquire("a"), true);
}

// ── planCustomFoodSave
{
  const per100 = { id: 1, food_name: "Rice", serving_size: 100, serving_unit: "g", serving_grams: null, calories: 130, protein_grams: 2.7, carbs_grams: 28, fats_grams: 0.3 };
  const legacy = { id: 2, food_name: "Egg", serving_size: 1, serving_unit: "serving", serving_grams: 50, calories: 70, protein_grams: 6, carbs_grams: 0.5, fats_grams: 5 };
  assert.equal(F.planCustomFoodSave([], { food_name: "egg" }).action, "create");
  // different macros, not editing it -> keep
  assert.equal(F.planCustomFoodSave([legacy], { food_name: "EGG", serving_size: 1, serving_unit: "serving", calories: 90, protein_grams: 1, carbs_grams: 0, fats_grams: 0 }).action, "keep");
  // editing it, unchanged macros -> keep
  assert.equal(F.planCustomFoodSave([legacy], { ...legacy }, { activeFoodId: 2 }).action, "keep");
  // saved per 100 g, form payload is 100 g with rounding noise -> keep
  assert.equal(F.planCustomFoodSave([per100], { food_name: "rice", serving_size: 100, serving_unit: "g", calories: 130, protein_grams: 2.7, carbs_grams: 28.2, fats_grams: 0.3 }, { activeFoodId: 1 }).action, "keep");
  // legacy 'serving' row, form switched to grams: units not comparable -> keep, never rewrite
  assert.equal(F.planCustomFoodSave([legacy], { food_name: "egg", serving_size: 100, serving_unit: "g", calories: 140, protein_grams: 12, carbs_grams: 1, fats_grams: 10 }, { activeFoodId: 2 }).action, "keep");
  // real edit -> update with macros only, in the row's own unit
  const up = F.planCustomFoodSave([legacy], { food_name: "egg", serving_size: 1, serving_unit: "serving", serving_grams: 60, calories: 90, protein_grams: 7, carbs_grams: 0.5, fats_grams: 6 }, { activeFoodId: 2 });
  assert.equal(up.action, "update");
  assert.deepEqual(Object.keys(up.patch).sort(), ["calories", "carbs_grams", "fats_grams", "protein_grams"]);
  assert.equal(up.patch.calories, 90);
  // edit expressed per 100 g onto a per-50 g row is rescaled to the row's unit
  const half = { id: 3, food_name: "Oats", serving_size: 50, serving_unit: "g", calories: 190, protein_grams: 6, carbs_grams: 33, fats_grams: 3.5 };
  const up2 = F.planCustomFoodSave([half], { food_name: "oats", serving_size: 100, serving_unit: "g", calories: 400, protein_grams: 12, carbs_grams: 66, fats_grams: 7 }, { activeFoodId: 3 });
  assert.equal(up2.action, "update");
  assert.equal(up2.patch.calories, 200);
  assert.equal(F.isMissingColumnError({ code: "PGRST204", message: "Could not find the 'source' column of 'custom_foods'" }, "source"), true);
  assert.equal(F.isMissingColumnError({ message: "network down" }, "source"), false);
}

// ── templates
{
  const it = F.templateItemFromEntry({ food_name: "Rice", serving_size: 300, serving_unit: "g", serving_grams: 300, calories: 390, fiber_grams: 1 });
  assert.equal(it.serving_size, "300 g");
  assert.deepEqual(F.parseTemplateServing(it), { amount: 300, unit: "g" });
  assert.deepEqual(F.parseTemplateServing({ serving_size: 300, serving_unit: "g" }), { amount: 300, unit: "g" });
  assert.deepEqual(F.parseTemplateServing({ serving_size: "2 slice" }), { amount: 2, unit: "slice" });
}

// ── Open Food Facts
{
  assert.equal(O.mapOffProduct({ product_name: "X", nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 } }).servingSize, null);
  assert.equal(O.mapOffProduct({ product_name: "X", serving_size: "30 g", nutriments: { "energy-kcal_100g": 100 } }).servingSize, 30);
}

// ── eatenOnly
{
  const es = [
    { date: "2026-10-13", calories: 500, planned: false, created_at: "2026-10-13T10:00Z", food_name: "a" },
    { date: "2026-10-13", calories: 700, planned: true, created_at: "2026-10-13T11:00Z", food_name: "b" },
  ];
  assert.equal(N.eatenOnly(es).length, 1);
  assert.deepEqual(N.getRecentFoods(es).map((e) => e.food_name), ["a"]);
  const ds = new Intl.DateTimeFormat("en-CA").format(new Date());
  const tr = N.getDailyCalorieTrend([{ date: ds, calories: 400, planned: false }, { date: ds, calories: 900, planned: true }], 1);
  assert.equal(tr[0].calories, 400);
}

// ── export rows + paging
{
  const rows = F.buildFoodExportRows([
    { date: "2026-10-02", meal_type: "lunch", food_name: "Rice", serving_size: 300, serving_unit: "g", calories: 390, fiber_grams: 2, created_at: "b", eaten_at: "b" },
    { date: "2026-10-01", meal_type: "dinner", food_name: "Plan", planned: true, calories: 1 },
    { date: "2026-10-01", meal_type: "snack", food_name: "Bar", calories: 200, created_at: "a" },
  ], [{ food_name: "bar", source: "label_scan" }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][13], "food_source_current");
  assert.equal(rows[1][4], "Bar");
  assert.equal(rows[1][13], "label_scan");
  assert.equal(rows[2][5], 300);
  assert.equal(rows[2][12], 2);
  const pages = [];
  const all = await F.fetchAllPages(async (from, to) => {
    pages.push([from, to]);
    const n = Math.max(0, Math.min(to + 1, 2500) - from);
    return { data: Array.from({ length: n }, (_, i) => from + i), error: null };
  });
  assert.equal(all.length, 2500);
  assert.equal(pages.length, 3);
}

// ── CSV cells
{
  assert.equal(F.csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(F.csvCell("+1 cmd"), "'+1 cmd");
  assert.equal(F.csvCell("-2+3"), "'-2+3");
  assert.equal(F.csvCell("@x"), "'@x");
  assert.equal(F.csvCell("\tx"), "'\tx");
  assert.equal(F.csvCell(-5), "-5");
  assert.equal(F.csvCell("-5"), "-5");
  assert.equal(F.csvCell("1.5"), "1.5");
  assert.equal(F.csvCell("a,b"), '"a,b"');
  assert.equal(F.csvCell("a\rb"), '"a\rb"');
  assert.equal(F.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(F.csvCell(null), "");
  assert.equal(F.csvCell("2026-10-13"), "2026-10-13");
  assert.equal(F.toCsv([["a", "=b"]]), "﻿a,'=b");
}

console.log("test_food_log: ALL OK");
