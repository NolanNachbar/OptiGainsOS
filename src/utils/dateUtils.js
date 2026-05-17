import { TZDate } from '@date-fns/tz';
import { startOfWeek, endOfWeek, format } from 'date-fns';

// Returns a Date-like object representing "now" in the given IANA timezone.
// All date-fns functions (format, startOfWeek, etc.) work with it correctly.
export function nowInTz(timezone) {
  return new TZDate(new Date(), timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function getTodayString(timezone) {
  return format(nowInTz(timezone), 'yyyy-MM-dd');
}

export function getWeekStart(timezone, weekStartsOn = 1) {
  return startOfWeek(nowInTz(timezone), { weekStartsOn });
}

export function getWeekEnd(timezone, weekStartsOn = 0) {
  return endOfWeek(nowInTz(timezone), { weekStartsOn });
}
