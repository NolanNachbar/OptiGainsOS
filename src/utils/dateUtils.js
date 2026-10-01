import { TZDate } from '@date-fns/tz';
import { startOfWeek, endOfWeek, format, addDays } from 'date-fns';

// The signed-in user's own timezone (user_profiles.timezone), registered by
// useProfile. One rule for "today" everywhere: an explicit timezone arg wins,
// else the profile timezone, else the device zone. Without this, no-arg
// callers (writes like food_entries.date) used the device zone while reads
// passed profile.timezone, so a just-logged item could land on a day the
// screen wasn't showing.
let userTimezone = null;
export function setUserTimezone(tz) {
  userTimezone = tz || null;
}
export function getUserTimezone() {
  return userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Returns a Date-like object representing "now" in the given IANA timezone.
// All date-fns functions (format, startOfWeek, etc.) work with it correctly.
export function nowInTz(timezone) {
  return new TZDate(new Date(), timezone || getUserTimezone());
}

export function getTodayString(timezone) {
  return format(nowInTz(timezone), 'yyyy-MM-dd');
}

// The local calendar date of a past instant. getTodayString answers "what day
// is it", this answers "what day was that" — the auto-finisher back-dates a
// log to the session that earned it, and stamping it with today would file a
// forgotten Tuesday workout under Wednesday.
export function localDateOf(instant, timezone) {
  const tz = timezone || getUserTimezone();
  return format(new TZDate(new Date(instant), tz), 'yyyy-MM-dd');
}

// UTC instants bounding the given calendar day in the given IANA timezone.
// Use with .gte(col, start) / .lt(col, end) on timestamptz columns.
export function dayWindowUtc(dateStr, timezone) {
  const tz = timezone || getUserTimezone();
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new TZDate(y, m - 1, d, tz);
  return { start: start.toISOString(), end: addDays(start, 1).toISOString() };
}

export function getWeekStart(timezone, weekStartsOn = 1) {
  return startOfWeek(nowInTz(timezone), { weekStartsOn });
}

export function getWeekEnd(timezone, weekStartsOn = 0) {
  return endOfWeek(nowInTz(timezone), { weekStartsOn });
}
