import { describe, it, expect } from 'vitest';
import { singleStepWeight, doubleWeight, doubleSeed, blockProgressionWeight, exerciseProgressionWeight } from './progressionRules';

const log = (date, name, sets, extra = {}) => ({ log_date: date, exercises: [{ name, sets }], ...extra });
const top = (weight, reps, completed = true) => ({ set_type: 'top_set', weight, reps, completed });
const ss = { type: 'single_step', step: 5 };
const ex = { name: 'Squat' };

describe('singleStepWeight', () => {
  it('made single -> +step', () => {
    expect(singleStepWeight([log('2026-01-02', 'Squat', [top(300, 1)])], ex, ss)).toBe(305);
  });
  it('uses the most recent log', () => {
    const logs = [log('2026-01-01', 'Squat', [top(290, 1)]), log('2026-01-08', 'Squat', [top(300, 1)])];
    expect(singleStepWeight(logs, ex, ss)).toBe(305);
  });
  it('missed -> last made top single', () => {
    const logs = [log('2026-01-01', 'Squat', [top(295, 1)]), log('2026-01-08', 'Squat', [top(305, 0, false)])];
    expect(singleStepWeight(logs, ex, ss)).toBe(295);
  });
  it('missed with no prior made -> null (e1RM fallback)', () => {
    expect(singleStepWeight([log('2026-01-08', 'Squat', [top(305, 0, false)])], ex, ss)).toBeNull();
  });
  it('no qualifying log -> null', () => {
    expect(singleStepWeight([], ex, ss)).toBeNull();
    expect(singleStepWeight([log('2026-01-08', 'Squat', [{ set_type: 'backoff', weight: 250, reps: 5, completed: true }])], ex, ss)).toBeNull();
  });
  it('anchor ignores older logs', () => {
    const logs = [log('2026-01-01', 'Squat', [top(300, 1)])];
    expect(singleStepWeight(logs, { ...ex, e1rm_anchor: { value: 330, date: '2026-02-01' } }, ss)).toBeNull();
  });
  it('matches name case-insensitively and components; created_at breaks date ties', () => {
    const logs = [
      log('2026-01-08', 'squat', [top(300, 1)], { created_at: '2026-01-08T10:00:00Z' }),
      log('2026-01-08', 'Box Squat', [top(310, 1)], { created_at: '2026-01-08T12:00:00Z' }),
    ];
    expect(singleStepWeight(logs, { name: 'SQUAT', components: ['Box Squat'] }, ss)).toBe(315);
  });
  it('block progression wins over exercise; absent -> null', () => {
    const logs = [log('2026-01-08', 'Squat', [top(300, 1)])];
    expect(blockProgressionWeight(logs, ex, { progression: { type: 'single_step', step: 10 } })).toBe(310);
    expect(blockProgressionWeight(logs, ex, {})).toBeNull();
  });
});

describe('doubleWeight', () => {
  const dex = { name: 'Dip', sets: 3, rep_target: '8-12', progression: { type: 'double', step: 5 } };
  const w = (weight, reps) => ({ set_type: 'working', weight, reps, completed: true });
  it('all sets at top -> +step', () => {
    expect(doubleWeight([log('2026-01-01', 'Dip', [w(25, 12), w(25, 12), w(25, 12)])], dex)).toBe(30);
  });
  it('one short -> hold', () => {
    expect(doubleWeight([log('2026-01-01', 'Dip', [w(25, 12), w(25, 11), w(25, 12)])], dex)).toBe(25);
  });
  it('fewer sets than prescribed -> hold', () => {
    expect(doubleWeight([log('2026-01-01', 'Dip', [w(25, 12), w(25, 12)])], dex)).toBe(25);
  });
  it('ignores warmups', () => {
    const sets = [{ set_type: 'warmup', weight: 10, reps: 5, completed: true }, w(25, 12), w(25, 12), w(25, 12)];
    expect(doubleWeight([log('2026-01-01', 'Dip', sets)], dex)).toBe(30);
  });
  it('no history -> null', () => {
    expect(doubleWeight([], dex)).toBeNull();
    expect(exerciseProgressionWeight([], dex)).toBeNull();
  });
  it('no progression -> null', () => {
    expect(exerciseProgressionWeight([log('2026-01-01', 'Dip', [w(25, 12)])], { name: 'Dip', sets: 3, rep_target: '8-12' })).toBeNull();
  });
});

describe('doubleSeed', () => {
  const dex = { name: 'Row', sets: 2, rep_target: '8-10', progression: { type: 'double', step: 5 } };
  const w = (weight, reps, n) => ({ set_type: 'working', weight, reps, completed: true, set_number: n });
  const seed = (sets) => doubleSeed([log('2026-01-01', 'Row', sets)], dex);
  it('same reps -> add a rep', () => {
    expect(seed([w(40, 8, 1), w(40, 8, 2)])).toEqual({ weight: 40, reps: [9, 9] });
  });
  it('per-set +1, clamped at hi', () => {
    expect(seed([w(40, 8, 1), w(40, 10, 2)])).toEqual({ weight: 40, reps: [9, 10] });
  });
  it('all at hi -> +step, reps reset to lo', () => {
    expect(seed([w(40, 10, 1), w(40, 10, 2)])).toEqual({ weight: 45, reps: [8, 8] });
  });
  it('missing sets use min logged + 1', () => {
    expect(seed([w(40, 9, 1)])).toEqual({ weight: 40, reps: [10, 10] });
  });
  it('clamps reps above hi and below lo', () => {
    expect(seed([w(40, 12, 1), w(40, 5, 2)])).toEqual({ weight: 40, reps: [10, 8] });
  });
  it('no history / non-double -> null', () => {
    expect(doubleSeed([], dex)).toBeNull();
    expect(doubleSeed([log('2026-01-01', 'Row', [w(40, 8, 1)])], { ...dex, progression: { type: 'single_step', step: 5 } })).toBeNull();
  });
});

describe('set marks', () => {
  it('a top single marked failure still counts as the missed top set', () => {
    const logs = [
      log('2026-01-01', 'Squat', [top(300, 1)]),
      log('2026-01-02', 'Squat', [{ set_type: 'failure', set_type_base: 'top_set', weight: 305, reps: 0, completed: true }]),
    ];
    expect(singleStepWeight(logs, ex, ss)).toBe(300);
  });
  it('drop and warm-up sets do not feed double progression', () => {
    const dex = { name: 'Row', sets: 2, rep_target: '8-10', progression: { type: 'double', step: 5 } };
    const sets = [
      { set_type: 'warmup', set_type_base: 'working', weight: 60, reps: 10, completed: true, set_number: 1 },
      { set_type: 'working', weight: 40, reps: 10, completed: true, set_number: 2 },
      { set_type: 'working', weight: 40, reps: 10, completed: true, set_number: 3 },
      { set_type: 'drop', set_type_base: 'working', weight: 25, reps: 6, completed: true, set_number: 4 },
    ];
    expect(doubleSeed([log('2026-01-01', 'Row', sets)], dex)).toEqual({ weight: 45, reps: [8, 8] });
  });
});
