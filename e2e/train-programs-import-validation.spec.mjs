// Regression for train-programs-r1-03: imported program JSON with a blank
// exercise name and absurd set/rest values passed validation unclamped.
// parseProgramJson is a pure function (no DB/browser needed to exercise it),
// so this drives it directly, the same way the finding was verified.
import { test, expect } from '@playwright/test';
import { parseProgramJson } from '../src/utils/programIO.js';

test('blank exercise names are dropped and sets/rest are clamped on import', () => {
  const json = JSON.stringify({
    program: {
      name: 'OVN-r1-03 import test',
      cycle_length: 1,
      workouts: [
        {
          day_index: 1,
          exercises: [
            { name: '', sets: 9999, rest_seconds: 999999 },
            { name: '   ', sets: 5 },
            { name: 'Real Exercise', sets: -4, rest_seconds: -10 },
          ],
        },
      ],
    },
  });

  const { workouts } = parseProgramJson(json);
  expect(workouts).toHaveLength(1);

  const exercises = workouts[0].exercises;
  // Blank and whitespace-only names are dropped entirely — progression_state
  // is keyed by exercise name, so a blank name would collide across exercises.
  expect(exercises).toHaveLength(1);
  expect(exercises[0].name).toBe('Real Exercise');
  // Clamped to the same 1-20 / 0-900 bounds as cycle_length/num_cycles.
  expect(exercises[0].sets).toBe(1);
  expect(exercises[0].rest_seconds).toBe(0);
});

test('sets/rest upper bounds are clamped, not just the lower bound', () => {
  const json = JSON.stringify({
    program: {
      name: 'OVN-r1-03 import test 2',
      cycle_length: 1,
      workouts: [{ day_index: 1, exercises: [{ name: 'Squat', sets: 9999, rest_seconds: 999999 }] }],
    },
  });

  const { workouts } = parseProgramJson(json);
  expect(workouts[0].exercises[0].sets).toBe(20);
  expect(workouts[0].exercises[0].rest_seconds).toBe(900);
});
