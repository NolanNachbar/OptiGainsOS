// body-r1-09: rapid soreness-pill cycling. BLOCKED — same root cause as
// r1-08: MorningCheckin (which hosts the soreness pills) is unreachable via
// /today right now because Today.jsx:500 suppresses PrescribedSessionCard
// whenever an in-progress workout session exists and today has no engine
// prescription, and there is no alternate route to the check-in form
// anywhere in the app (grep across src/ confirms MorningCheckin is only
// imported by PrescribedSessionCard.jsx). Two in-progress workout_sessions
// rows exist on the shared account (one tagged OVN-r1-03 Lift, a leftover
// from an earlier round; one untagged, possibly another agent's live work) —
// neither was touched, per ground rules. See findings-r1-1.json body-r1-08
// for the full writeup (r1-09 references the same finding rather than
// duplicating it).
console.log('SKIPPED body-r1-09: blocked by same root cause as body-r1-08 (see that finding). No DB writes attempted, nothing to clean up.');
