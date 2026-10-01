import { useEffect, useRef, useState } from "react";
import WeighInGateDialog from "@/components/dashboard/WeighInGateDialog";
import { useTodayBodyWeight } from "@/hooks/useWeighIn";
import { getTodayString } from "@/utils/dateUtils";

/**
 * The single choke point for "a logging session is about to begin — has
 * today's weight been recorded?", reused by every way a session can start
 * (PrescribedSessionCard's own Start/Begin Session, the Train tab, program
 * detail, a workout's detail page, Quick Workout). Previously only the Today
 * card's session CTA asked, so starting a workout any other way never
 * prompted and the weight trend quietly lost days.
 *
 * guardStart(startFn) is the gate itself: call it with the function that
 * actually begins the session (navigate, or create the workout_sessions
 * row). It fires startFn right away once today's weight is known to be on
 * record (or `skip` is set — the caller already ran this gate, e.g. Today
 * navigated here with a `weighInGated` flag in location.state). Otherwise it
 * opens the shared weigh-in sheet and defers startFn until Log or Skip.
 *
 * The decision is made once the weight query *settles*, not at call time —
 * calling guardStart before useTodayBodyWeight has resolved (e.g. from an
 * effect that fires on mount, before the query has had a chance to load)
 * must not race past the gate on a still-loading "no entry yet" value. The
 * pending start is stashed and an effect below fires it (or opens the sheet)
 * the moment the query settles.
 *
 * guardStart never re-fires: once a start has been dispatched (immediately
 * or via the sheet) it is the only one this hook instance will ever issue —
 * callers that call it more than once (QuickWorkout's session-recovery
 * effect branches) are deciding between mutually exclusive paths, not asking
 * to start twice.
 */
export function useWeighInGate(today, { skip = false } = {}) {
  const dateStr = today || getTodayString();
  const { todayWeight, isLoading, isFetching } = useTodayBodyWeight(dateStr);
  const settled = !isLoading && !isFetching;
  const needsWeight = !skip && settled && todayWeight?.weight == null;

  const pendingRef = useRef(null);
  const firedRef = useRef(false);
  const [waiting, setWaiting] = useState(false);

  const fire = (fn) => {
    firedRef.current = true;
    pendingRef.current = null;
    setWaiting(false);
    fn();
  };

  const guardStart = (startFn) => {
    if (firedRef.current) return;
    if (skip || (settled && !needsWeight)) {
      fire(startFn);
      return;
    }
    // Not settled yet, or settled and needsWeight: stash it. The effect below
    // resolves it once the query settles (immediately, if it already has).
    pendingRef.current = startFn;
    if (settled && needsWeight) setWaiting(true);
  };

  // Resolve a stashed start the moment the query settles — covers the case
  // where guardStart was called before isLoading/isFetching had flipped.
  useEffect(() => {
    if (firedRef.current || !pendingRef.current || !settled) return;
    if (needsWeight) {
      setWaiting(true);
    } else {
      fire(pendingRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, needsWeight]);

  const proceed = () => {
    const fn = pendingRef.current;
    fire(fn || (() => {}));
  };

  const gateSheet = waiting ? (
    <WeighInGateDialog today={dateStr} onLogged={proceed} onSkip={proceed} />
  ) : null;

  return { guardStart, gateSheet, needsWeight };
}
