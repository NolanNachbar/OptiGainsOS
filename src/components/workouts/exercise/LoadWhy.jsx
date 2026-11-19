import { ReasonLine } from "@/components/ui";

// Basis for the prefilled load, directly under the exercise header.
// Engine rows (buildLoadWhy) win; otherwise the prefill came from the last
// session, so say that. Nothing known renders nothing.
export default function LoadWhy({ loadWhy, lastPerformance, weightUnit }) {
  if (Array.isArray(loadWhy) && loadWhy.length > 0) {
    return (
      <ReasonLine
        className="pb-3"
        detail={loadWhy.length > 1 ? (
          <ul className="space-y-1 tabular-nums">
            {loadWhy.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        ) : undefined}
      >
        {loadWhy[0]}
      </ReasonLine>
    );
  }
  if (lastPerformance?.lastWeight) {
    return (
      <ReasonLine className="pb-3">
        {`Prefill basis: last session ${lastPerformance.lastWeight} ${weightUnit} x ${lastPerformance.lastReps}`}
      </ReasonLine>
    );
  }
  return null;
}
