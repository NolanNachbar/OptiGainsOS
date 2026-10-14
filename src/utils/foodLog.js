// Pure helpers for the food log (FoodTracker, MealTemplates, DataExport).
// Kept free of React/Supabase so they can be unit-checked by bundling alone.

/**
 * Short in-flight guard for one-tap log actions ("Log again", Recent "+").
 *
 * `isPending` from a mutation lags a render behind the tap, so two taps in the
 * same frame both get through, and a fast second tap right after success logs
 * the same food again. This blocks (a) anything while one is in flight and
 * (b) the SAME key for `windowMs` after the previous one settled. It's a
 * double-tap guard, not a debounce: a different food, or the same food after
 * the window, goes straight through.
 */
export function createTapGuard(windowMs = 800, now = () => Date.now()) {
  let busy = false;
  let lastKey = null;
  let lastAt = -Infinity;
  return {
    tryAcquire(key) {
      if (busy) return false;
      if (key === lastKey && now() - lastAt < windowMs) return false;
      busy = true;
      lastKey = key;
      lastAt = now();
      return true;
    },
    release() {
      busy = false;
      lastAt = now();
    },
  };
}

// ── My Foods saves ─────────────────────────────────────────────────────────

// Where a saved food's numbers came from. 'ai_estimate' and 'label_scan' are
// estimates and get a quiet badge; the rest are plain.
export const FOOD_SOURCE_LABELS = {
  ai_estimate: "AI estimate",
  label_scan: "Label scan",
};

const sameName = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const isMass = (u) => u === "g" || u === "ml";

// A food's stored macros are for `serving_size` of `serving_unit`; this is the
// multiplier from per-100 (g/ml) or per-1 (anything else) to that stored amount.
const storedScale = (f) => {
  const unit = String(f.serving_unit || "serving").toLowerCase();
  const size = Number(f.serving_size) > 0 ? Number(f.serving_size) : 1;
  return isMass(unit) ? size / 100 : size;
};

const MACRO_KEYS = ["calories", "protein_grams", "carbs_grams", "fats_grams"];

// Close enough that rounding in the form's base/scale round trip isn't an edit.
const near = (a, b, floor) =>
  Math.abs(a - b) <= Math.max(floor, 0.02 * Math.max(Math.abs(a), Math.abs(b)));

/**
 * Per-100 g/ml (or per-1 unit) macros of `row`, or null when `a` and `b` aren't
 * described in comparable units (so the caller can't tell and must not guess).
 */
function perBase(row) {
  const k = storedScale(row) || 1;
  const out = {};
  for (const key of MACRO_KEYS) out[key] = (Number(row[key]) || 0) / k;
  return out;
}

const unitsComparable = (a, b) => {
  const ua = String(a.serving_unit || "serving").toLowerCase();
  const ub = String(b.serving_unit || "serving").toLowerCase();
  return ua === ub || (isMass(ua) && isMass(ub));
};

const macrosDiffer = (a, b) => {
  const pa = perBase(a);
  const pb = perBase(b);
  return MACRO_KEYS.some((key) => !near(pa[key], pb[key], key === "calories" ? 1 : 0.6));
};

/**
 * Decide what an implicit "save this food to My Foods" should do.
 *
 *  - no same-name food            -> create
 *  - same name, form is editing
 *    that very saved food and its
 *    per-100 / per-unit macros
 *    really changed               -> update, macros only
 *  - same name otherwise          -> keep (never overwrite silently)
 *
 * Macros are compared per 100 g/ml (or per 1 unit), so a food saved as "1
 * serving" and logged as 150 g isn't mistaken for an edit, and units that can't
 * be compared are never treated as one. An update carries only the macro fields,
 * expressed in the saved row's own serving_size/unit: a legacy row's serving
 * definition is never rewritten by logging it. `patch` is that payload.
 */
export function planCustomFoodSave(existing, food, { activeFoodId = null } = {}) {
  const match = (existing || []).find((f) => sameName(f.food_name, food.food_name));
  if (!match) return { action: "create" };
  if (
    activeFoodId && match.id === activeFoodId &&
    unitsComparable(match, food) && macrosDiffer(match, food)
  ) {
    const base = perBase(food);
    const k = storedScale(match);
    const fiberBase = food.fiber_grams == null ? null : (Number(food.fiber_grams) || 0) / (storedScale(food) || 1);
    return {
      action: "update",
      id: match.id,
      match,
      patch: {
        calories: Math.round(base.calories * k),
        protein_grams: r1(base.protein_grams * k),
        carbs_grams: r1(base.carbs_grams * k),
        fats_grams: r1(base.fats_grams * k),
        ...(fiberBase == null ? {} : { fiber_grams: r1(fiberBase * k) }),
      },
    };
  }
  return { action: "keep", id: match.id, match };
}

/** True when a Supabase/PostgREST error is about the named column not existing. */
export function isMissingColumnError(err, column) {
  const msg = String(err?.message || "");
  return (
    msg.includes(column) &&
    (err?.code === "PGRST204" || err?.code === "42703" || /column/i.test(msg))
  );
}

// ── Meal templates ─────────────────────────────────────────────────────────

/**
 * Template items keep the serving as "300 g" (what the edit dialog shows) plus
 * the structured unit/grams. A logged entry's serving_size is a bare number with
 * its unit in a separate column, so saving serving_size alone turned a 300 g
 * item into "300" and re-applied it as "300 serving".
 */
export function templateItemFromEntry(e) {
  const unit = e.serving_unit || null;
  const size = e.serving_size;
  const hasNumber = size != null && size !== "" && Number.isFinite(Number(size));
  return {
    food_name: e.food_name,
    serving_size: hasNumber && unit ? `${Number(size)} ${unit}` : size,
    serving_unit: unit,
    serving_grams: e.serving_grams ?? null,
    calories: e.calories,
    protein_grams: e.protein_grams,
    carbs_grams: e.carbs_grams,
    fats_grams: e.fats_grams,
    fiber_grams: e.fiber_grams ?? null,
    meal_type: e.meal_type,
  };
}

/** Amount + unit of a template item, whichever shape it was saved in. */
export function parseTemplateServing(item) {
  const raw = item?.serving_size;
  const text = String(raw ?? "").trim();
  const parts = text.split(/\s+/);
  const amount = parseFloat(parts[0]) || 1;
  const inline = parts.slice(1).join(" ");
  const unit = inline || item?.serving_unit || "serving";
  return { amount, unit };
}

// ── Food export ────────────────────────────────────────────────────────────

export const FOOD_EXPORT_HEADER = [
  "date", "meal", "eaten_at", "logged_at", "food_name",
  "serving_qty", "serving_unit", "serving_grams",
  "calories", "protein_g", "carbs_g", "fats_g", "fiber_g", "food_source_current",
];

/**
 * CSV rows for the full food export. Planned (not-yet-eaten) rows are left out.
 * `food_source_current` is the CURRENT origin tag of the My Foods item with the same name, blank when
 * the entry has no saved food or the food predates the tag; food_entries itself
 * carries no source column.
 */
export function buildFoodExportRows(entries, customFoods = []) {
  const sourceByName = new Map();
  for (const f of customFoods) {
    if (f.source) sourceByName.set(String(f.food_name || "").trim().toLowerCase(), f.source);
  }
  const eaten = (entries || []).filter((e) => e.planned !== true);
  const sorted = [...eaten].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) ||
    String(a.eaten_at || a.created_at || "").localeCompare(String(b.eaten_at || b.created_at || ""))
  );
  const rows = [FOOD_EXPORT_HEADER];
  for (const e of sorted) {
    rows.push([
      e.date, e.meal_type, e.eaten_at ?? "", e.created_at ?? "", e.food_name,
      e.serving_size ?? "", e.serving_unit ?? "", e.serving_grams ?? "",
      e.calories ?? "", e.protein_grams ?? "", e.carbs_grams ?? "", e.fats_grams ?? "",
      e.fiber_grams ?? "",
      sourceByName.get(String(e.food_name || "").trim().toLowerCase()) ?? "",
    ]);
  }
  return rows;
}

/**
 * Read every row of a query past the 1000-row API cap. `fetchPage(from, to)`
 * must return { data, error } for that inclusive range.
 */
export async function fetchAllPages(fetchPage, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * One CSV cell. Strings that a spreadsheet would run as a formula ("=", "+",
 * "-", "@", tab, CR lead) get a leading apostrophe; real numbers (and numeric
 * strings like "-5") are left alone. Quotes on comma, quote, CR or LF.
 */
export function csvCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows -> CSV text with a UTF-8 BOM so Excel reads non-ASCII food names right. */
export function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
