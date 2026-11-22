import { describe, it, expect } from "vitest";
import { canon, displayExercise, exerciseInfo, sameExercise } from "./exerciseCatalog";
import cases from "./exerciseCatalog.cases.json";

describe("exercise catalog", () => {
  it("matches the engine's canon() on every shared case", () => {
    for (const [raw, expected] of Object.entries(cases.canon)) expect(canon(raw)).toBe(expected);
  });
  it("folds set roles into the base lift for display", () => {
    for (const [raw, expected] of Object.entries(cases.display)) expect(displayExercise(raw)).toBe(expected);
  });
  it("knows muscles for catalogued lifts", () => {
    expect(exerciseInfo("Bench Press (Top Set)").primary).toEqual(["chest"]);
    expect(exerciseInfo("Leg Extensions").primary).toEqual(["quads"]);
    expect(exerciseInfo("Some Made Up Lift")).toBeNull();
  });
  it("treats spelling variants as the same exercise", () => {
    expect(sameExercise("Cable Tricep Pushdown", "Cable Triceps Pushdown")).toBe(true);
    expect(sameExercise("Bench Press", "Competition Bench Press - Paused")).toBe(false);
  });
});
