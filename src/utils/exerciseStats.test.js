import { describe, it, expect } from "vitest";
import { getLoggedExerciseSummaries } from "./exerciseStats";

const s = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });
const log = (log_date, sets, name = "Chest-Supported Row") => ({ log_date, exercises: [{ name, sets }] });
const row = (logs) => getLoggedExerciseSummaries(logs)[0];

describe("getLoggedExerciseSummaries change4w", () => {
  it("is null when the load basis changes between windows (test account Chest-Supported Row)", () => {
    // Shape of the test athlete's real data: 410 lb machine through May, then
    // 270/230 on a different setup from June. The old code reported -222.7.
    const logs = [
      log("2026-05-12", [s(410, 8), s(410, 8)]),
      log("2026-05-16", [s(410, 10), s(410, 10)]),
      log("2026-05-18", [s(360, 10), s(360, 10)]),
      log("2026-05-20", [s(360, 10), s(360, 9)]),
      log("2026-06-06", [s(270, 8), s(270, 8)]),
      log("2026-06-08", [s(270, 6), s(270, 6)]),
      log("2026-06-10", [s(270, 6), s(270, 6)]),
      log("2026-06-15", [s(230, 8), s(230, 8)]),
      log("2026-06-17", [s(230, 8), s(230, 8)]),
      log("2026-06-19", [s(230, 6), s(230, 6)]),
      log("2026-06-21", [s(230, 7), s(230, 7)]),
    ];
    const r = row(logs);
    expect(r.change4w).toBeNull();
  });

  it("reports a like-for-like change on a steady load basis", () => {
    const logs = [
      log("2026-05-10", [s(200, 5)]),
      log("2026-05-17", [s(205, 5)]),
      log("2026-05-24", [s(210, 5)]),
      log("2026-05-31", [s(215, 5)]),
      log("2026-06-07", [s(220, 5)]),
    ];
    const r = row(logs);
    // current best 220x5 = 256.7, prior best (05-10) 200x5 = 233.3
    expect(r.change4w).toBeCloseTo(23.3, 1);
  });

  it("ignores warm-up and unticked sets on both sides", () => {
    const logs = [
      log("2026-05-10", [s(100, 5, { set_type: "warmup" }), s(200, 5), s(400, 3, { completed: false })]),
      log("2026-06-07", [s(100, 5, { set_type: "warmup" }), s(210, 5)]),
    ];
    expect(row(logs).change4w).toBeCloseTo(11.7, 1);
  });

  it("is null when the prior window has no eligible data", () => {
    const logs = [log("2026-05-30", [s(200, 5)]), log("2026-06-07", [s(210, 5)])];
    expect(row(logs).change4w).toBeNull();
  });

  it("is null when the prior window has only high-rep sets", () => {
    const logs = [log("2026-05-10", [s(100, 20)]), log("2026-06-07", [s(210, 5)])];
    expect(row(logs).change4w).toBeNull();
  });

  it("still reports a real drop inside the same load basis", () => {
    const logs = [
      log("2026-05-10", [s(200, 8)]),
      log("2026-05-24", [s(190, 6)]),
      log("2026-06-07", [s(185, 5)]),
    ];
    // 185x5 = 215.8 vs 200x8 = 253.3
    expect(row(logs).change4w).toBeCloseTo(-37.5, 1);
  });
});
