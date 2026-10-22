import { describe, it, expect } from "vitest";
import { orderExercisesForFatigue } from "./exerciseOrder";

const names = (list) => list.map((e) => e.name);

describe("orderExercisesForFatigue", () => {
  it("breaks up a run of chest work with back work and keeps the same exercises", () => {
    const input = ["Reverse Grip Incline Smith Machine Press", "Larsen Press", "Weighted Dip",
      "Cable Fly", "Cable Lateral Raise", "Lat Pulldown", "Chest-Supported Row", "Bicep Curl"]
      .map((name) => ({ name }));
    const out = names(orderExercisesForFatigue(input));
    expect([...out].sort()).toEqual(names(input).sort());
    expect(out[0]).toBe(input[0].name);
    const chest = new Set(["Reverse Grip Incline Smith Machine Press", "Larsen Press", "Weighted Dip", "Cable Fly"]);
    for (let i = 1; i < out.length; i++) expect(chest.has(out[i]) && chest.has(out[i - 1])).toBe(false);
  });

  it("keeps a warm-up drill directly ahead of its lift", () => {
    const input = [{ name: "Back Squat" }, { name: "Bottoms-Up Kettlebell Press (single arm)", notes: "Bench warm-up" },
      { name: "Bench Press" }, { name: "Weighted Pull-up" }, { name: "Lateral Raise" }];
    const out = names(orderExercisesForFatigue(input));
    expect(out.indexOf("Bench Press") - out.indexOf("Bottoms-Up Kettlebell Press (single arm)")).toBe(1);
  });

  it("returns short or invalid lists untouched", () => {
    expect(orderExercisesForFatigue([])).toEqual([]);
    expect(orderExercisesForFatigue(undefined)).toBeUndefined();
  });
});
