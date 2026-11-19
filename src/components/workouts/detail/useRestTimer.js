import { useState, useEffect, useRef } from "react";

// Rest timer state for the logger. Extracted from WorkoutDetail.jsx
// (no behavior change).
export function useRestTimer() {
  const [restTimer, setRestTimer] = useState(null); // seconds remaining for rest (display only)
  const [restDuration, setRestDuration] = useState(90); // default rest duration
  const restTimerRef = useRef(null); // setInterval handle
  const restTimerEndRef = useRef(null); // absolute end timestamp for the rest timer

  // Hand the rest deadline to the service worker, which is the only thing here
  // that can still fire once the phone locks. See the message handler in
  // /home/nolan/projects/OptiGains/public/sw.js.
  const postRest = (message) => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage(message))
      .catch(() => {});
  };

  // Rest timer — uses absolute end timestamp so it's accurate when tab is backgrounded or revisited
  useEffect(() => {
    const tick = () => {
      if (restTimerEndRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((restTimerEndRef.current - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) {
        restTimerEndRef.current = null;
        // Deliberately no notification here. This tick only runs while the page
        // is alive and visible, and in that state the countdown he is looking at
        // has just hit zero on its own. The worker covers the case that actually
        // needs an alert — screen off, app backgrounded — and skips when a window
        // is visible, so exactly one of the two speaks at any moment.
      }
    };
    restTimerRef.current = setInterval(tick, 500);
    return () => clearInterval(restTimerRef.current);
  }, []);

  // A scheduled rest alarm outlives the page. Cancel it on unmount so leaving
  // mid-rest does not buzz him three minutes into whatever he did next.
  useEffect(() => () => postRest({ type: "CANCEL_REST" }), []);

  const startRestTimer = (duration) => {
    setRestDuration(duration);
    const endsAt = Date.now() + duration * 1000;
    restTimerEndRef.current = endsAt;
    setRestTimer(duration);
    postRest({ type: "SCHEDULE_REST", at: endsAt });
  };

  const skipRestTimer = () => {
    restTimerEndRef.current = null;
    setRestTimer(null);
    postRest({ type: "CANCEL_REST" });
  };

  const addRestTime = (seconds) => {
    if (restTimerEndRef.current !== null) {
      restTimerEndRef.current += seconds * 1000;
      postRest({ type: "SCHEDULE_REST", at: restTimerEndRef.current });
      setRestDuration(prev => prev + seconds);
    }
  };

  return { restTimer, restDuration, startRestTimer, skipRestTimer, addRestTime };
}
