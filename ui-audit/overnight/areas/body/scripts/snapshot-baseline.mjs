import { writeFileSync } from 'node:fs';
import { getProfile, weightRowsByDate, readinessByDate, sorenessByDate, todayStr } from './_lib.mjs';

const today = todayStr();
const profile = await getProfile();
const weightToday = await weightRowsByDate(today);
const readinessToday = await readinessByDate(today);
const sorenessToday = await sorenessByDate(today);

const baseline = {
  capturedAt: new Date().toISOString(),
  today,
  profile: { id: profile.id, current_weight: profile.current_weight, weight_unit: profile.weight_unit },
  body_weight_entries_today: weightToday,
  daily_readiness_today: readinessToday,
  soreness_logs_today: sorenessToday,
};
writeFileSync(new URL('../baseline.json', import.meta.url), JSON.stringify(baseline, null, 2));
console.log('BASELINE ' + JSON.stringify(baseline));
