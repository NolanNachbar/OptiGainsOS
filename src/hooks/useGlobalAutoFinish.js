import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { autoFinishStaleSession } from "@/lib/autoFinishSession";
import { isActivelyLoggingSession } from "@/lib/activeLoggingSessions";
import { sessionSilenceMs } from "@/lib/buildWorkoutLogFromSession";
import { AUTO_FINISH_STALE_MS, AUTO_FINISH_MAX_AGE_MS, setWorkoutActive } from "@/lib/workoutSessionFlag";
import { invalidateWorkoutLogs } from "@/lib/queryKeys";

/**
 * App-wide backstop for the 3h auto-finish rule.
 *
 * WorkoutDetail/QuickWorkout only run the stale check for the ONE workout
 * whose page happens to get reopened -- scoped by workout_id/program_workout_id.
 * If he forgets Finish and goes to Today or Fuel instead, that session sits
 * in_progress indefinitely; the per-workout check never sees it. This hook
 * runs the identical rule against EVERY in_progress session on mount and
 * whenever the tab regains visibility, so the gap closes no matter which page
 * he opens next.
 *
 * Up to AUTO_FINISH_MAX_AGE_MS (48h), not 24h (Nolan, 2026-09-30): a session
 * he started yesterday and never finished is logged on the next open, filed
 * under its start date and timestamped 3h after its last change. A >24h session left
 * for a manual Log/Discard meant he went to Train instead of Today's Start and
 * skipped the weigh-in, and the stale session pinned the engine on yesterday's
 * day.
 *
 * Skips only the session id(s) actually registered as open right now
 * (isActivelyLoggingSession, src/lib/activeLoggingSessions.js) -- not a
 * whole-sweep bail on "some logger is open somewhere" the way
 * body[data-logging-active] used to be checked here. He trains twice in a
 * day often enough that a second, separately-stale session must still get
 * swept while today's session stays open and untouched; that old check also
 * only ever got set by WorkoutDetail, so a backgrounded QuickWorkout session
 * was never skipped at all.
 * autoFinishStaleSession itself holds a module-level in-flight guard, so this
 * and a page-level call for the same session id can never double-write a
 * workout_log even if both fire in the same tick.
 *
 * `ready` gates the sweep on the caller's profile query having settled.
 * Without it, the very first sweep after a cold launch can race the profile
 * fetch and run with `timezone` undefined, which localDateOf then silently
 * resolves to the DEVICE's runtime timezone instead of his actual profile
 * timezone -- risking a workout filed under the wrong calendar day. Passing
 * `ready: false` while the profile is loading is inert (no queries fire, no
 * extra re-render loop): the sweep just waits for the next `ready` flip.
 */
export function useGlobalAutoFinish(timezone, ready = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user || !ready) return;

    const sweep = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        // Unscoped by workout on purpose -- he trains twice in a day often
        // enough that a single most-recent-session query would silently miss
        // a second, separately-stale one.
        const { data, error } = await supabase
          .from("workout_sessions")
          .select("*")
          .eq("created_by", user.id)
          .eq("status", "in_progress");
        if (error || !data?.length) return;

        let anyFinished = false;
        for (const session of data) {
          if (isActivelyLoggingSession(session.id)) continue;
          const ageMs = Date.now() - new Date(session.start_time).getTime();
          const silenceMs = sessionSilenceMs(session);
          // null (updated_at missing), quiet for under 3h, or older than 48h:
          // leave it exactly as the page-level check would.
          if (silenceMs === null) continue;
          if (silenceMs < AUTO_FINISH_STALE_MS || ageMs >= AUTO_FINISH_MAX_AGE_MS) continue;

          const result = await autoFinishStaleSession(session, timezone);
          if (result === "logged") {
            anyFinished = true;
            const when = new Date(session.start_time).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
            toast.info(`Logged your workout from ${when} — you didn't press Finish`);
          } else if (result === "cancelled") {
            // Closed with no log written -- nothing worth a toast, but it
            // still counts toward releasing the cross-cutting flag below.
            anyFinished = true;
          }
        }

        if (anyFinished) {
          invalidateWorkoutLogs(queryClient);
          queryClient.invalidateQueries({ queryKey: ["activeWorkoutSession"] });
          // Only clear the cross-cutting flag if nothing else is still live --
          // a second in_progress session (same day, different workout) must
          // keep the flag set.
          const { data: stillActive } = await supabase
            .from("workout_sessions")
            .select("id")
            .eq("created_by", user.id)
            .eq("status", "in_progress")
            .limit(1);
          if (!stillActive?.length) setWorkoutActive(false);
        }
      } finally {
        runningRef.current = false;
      }
    };

    sweep();
    const onVisible = () => {
      if (document.visibilityState === "visible") sweep();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, timezone, ready]);
}
