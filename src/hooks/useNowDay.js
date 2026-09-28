import { useEffect, useReducer } from "react";
import { getTodayString } from "@/utils/dateUtils";

// Re-derives "today" (as a date string, in the given timezone) whenever the
// tab regains visibility/focus, on a 60s interval, or on mount — so a page
// left open (or an iOS home-screen app backgrounded) across local midnight
// doesn't keep reading a stale prior-day string with no on-screen indication.
// Unlike a `useState(getTodayString(tz))` seed, this recomputes on every
// render, so it can't freeze a not-yet-loaded (undefined) timezone the way a
// one-time initializer would. Shared by Today (today-r1-05) and Fuel's
// FoodTracker (fuel-r1-01, commit 5331532b), which has its own
// wasOnToday-gated rollForward — this hook only bumps a render, it doesn't
// own selectedDate state, so it's safe to reuse anywhere "today" is a derived
// value, not user-chosen state.
export function useNowDay(timezone) {
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", bump);
    const interval = setInterval(bump, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", bump);
      clearInterval(interval);
    };
  }, []);
  return getTodayString(timezone);
}
