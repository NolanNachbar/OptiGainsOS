import { TZDate } from '@date-fns/tz';
import { startOfWeek, endOfWeek, format, addDays } from 'date-fns';

// Returns a Date-like object representing "now" in the given IANA timezone.
// All date-fns functions (format, startOfWeek, etc.) work with it correctly.
export function nowInTz(timezone) {
  return new TZDate(new Date(), timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function getTodayString(timezone) {
  return format(nowInTz(timezone), 'yyyy-MM-dd');
}

// UTC instants bounding the given calendar day in the given IANA timezone.
// Use with .gte(col, start) / .lt(col, end) on timestamptz columns.
export function dayWindowUtc(dateStr, timezone) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
