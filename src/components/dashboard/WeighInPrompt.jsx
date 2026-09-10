import { useRef, useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useUserQueries";
import { useLastBodyWeight, useLogWeight, useTodayBodyWeight } from "@/hooks/useWeighIn";
import { getTodayString } from "@/utils/dateUtils";

// A bodyweight outside these is a typo, not a reading (a transposed 1810, a
// pound value typed into a kg profile, a rep count entered in the wrong field).
// Deliberately wide: the point is to catch a slipped digit, not to police a
// range. Rejecting shows the value back rather than silently clamping it,
// because a clamped weight is a lie the trend estimator cannot detect.
const BOUNDS = { lbs: [50, 700], kg: [25, 320] };

// How stale is stale. Under a week reads as a normal gap and gets a neutral
// caption; past that the caption carries the count, because the number of days
// is the only thing that makes a skipped weigh-in feel like a cost.
const STALE_DAYS = 7;

/**
 * The weigh-in ask, sized to be seen.
 *
 * This replaced a label-plus-input row tucked under the completed check-in card.
 * That version was correct and invisible: in the 34 days after it shipped, 17
 * training days went by without a single weight logged, against 39 weigh-ins in
 * the 90 days before. The failure was never the typing — it is four digits off
 * a scale he is already standing on — it was that nothing on screen said to.
 *
 * So the whole component is one instruction. Big field, one button, and a line
 * that states how long it has been. `variant="sheet"` is the pre-session gate,
 * where this is the only thing being asked for and the keyboard should already
 * be up; `variant="card"` is the passive dashboard surface, which must never
 * steal focus on load.
 */
export default function WeighInPrompt({
  today,
  onLogged,
  onSkip,
  skipLabel = "Skip for now",
  variant = "card",
  className = "",
}) {
  const dateStr = today || getTodayString();
  const { profile } = useProfile();
  const { todayWeight, isLoading, isFetching } = useTodayBodyWeight(dateStr);
  const { lastWeight, daysAgo } = useLastBodyWeight(dateStr);
  const logWeight = useLogWeight();

  const [typed, setTyped] = useState("");
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const unit = profile?.weight_unit || "lbs";
  const isSheet = variant === "sheet";

  // Already on record, or not yet known. The card variant renders nothing in
  // both cases: a prompt that flashes for one frame on every dashboard load,
  // then vanishes once the query resolves, teaches him to ignore it. The sheet
  // variant renders through the fetch rather than blanking the dialog, since the
  // gate has already decided a weight is missing by the time it mounts.
  if (!isSheet && (isLoading || isFetching || todayWeight?.weight != null)) return null;

  // The gate reads `needsWeight` off a query that reports false while it is
  // refetching, so the sheet can open on a stale "no entry" and then resolve to
  // a weight already logged today. Asking anyway would be worse than useless:
  // useLogWeight reads-then-updates the existing row, so a second reading typed
  // here silently replaces the real one. Confirm and move on instead.
  if (isSheet && todayWeight?.weight != null) {
    return (
      <div className="glass px-4 sm:px-5 py-4">
        <p className="text-[13px] font-semibold text-secondary">
          Already logged today: <span className="tabular-nums text-ink">{todayWeight.weight} {unit}</span>
        </p>
        <Button
          type="button"
          variant="volt"
          size="lg"
          onClick={() => onLogged?.()}
          className="mt-3 min-h-[50px] w-full text-[15px]"
        >
          Continue to the session
        </Button>
      </div>
    );
  }

  const reference = lastWeight?.weight ?? profile?.current_weight ?? null;

  const submit = (e) => {
    e?.preventDefault?.();
    const raw = String(typed).trim().replace(/,/g, ".");
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter your weight");
      return;
    }
    const [min, max] = BOUNDS[unit] || BOUNDS.lbs;
    if (parsed < min || parsed > max) {
      setError(`That reads as ${parsed} ${unit}. Expected ${min}-${max}.`);
      return;
    }
    setError(null);
    logWeight.mutate(
      { weight: parsed, date: dateStr },
      {
        onSuccess: () => {
          toast.success(`Logged ${parsed} ${unit}`);
          onLogged?.();
        },
        // The typed value stays in the field on failure. Clearing it would make
        // a network blip cost him the reading he is standing there holding.
        onError: () => setError("Didn't save. Tap Log to retry."),
      }
    );
  };

  const staleLine = (() => {
    if (daysAgo == null) return "First weigh-in on record.";
    if (daysAgo <= 1) return `Last: ${lastWeight.weight} ${unit} yesterday.`;
    if (daysAgo < STALE_DAYS) return `Last: ${lastWeight.weight} ${unit}, ${daysAgo} days ago.`;
    return `Last weigh-in was ${daysAgo} days ago (${lastWeight.weight} ${unit}).`;
  })();
  const isStale = daysAgo != null && daysAgo >= STALE_DAYS;

  return (
    <form
      onSubmit={submit}
      className={`glass overflow-hidden ${className}`}
      aria-labelledby="weigh-in-prompt-title"
    >
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isStale ? "bg-[rgb(var(--warn-rgb)/0.14)] text-warn" : "bg-[var(--glass-inset-bg)] text-secondary"
          }`}
        >
          <Scale className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="weigh-in-prompt-title" className="type-display text-[17px] sm:text-[18px]">
            Step on the scale
          </h3>
          <p className={`mt-1 text-[12.5px] font-semibold ${isStale ? "text-warn" : "text-muted-2"}`}>
            {staleLine}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div
          className={`relative flex items-center rounded-2xl border bg-[var(--glass-inset-bg)] transition-colors duration-200 ${
            error ? "border-[rgb(var(--warn-rgb)/0.55)]" : "border-charcoal-border"
          }`}
        >
          <input
            ref={inputRef}
            // Not type="number": it drops a trailing decimal point mid-entry on
            // some engines and its spinners have no place on a phone. text plus
            // inputMode="decimal" gets the numeric pad with a decimal key.
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // The gate exists to be answered right now, so the pad comes up with
            // it. The dashboard card must not: autofocus there would throw the
            // keyboard over the page every time Today loads.
            autoFocus={isSheet}
            placeholder={reference != null ? String(reference) : "--"}
            value={typed}
            onChange={(e) => {
              // Keep the field to what a scale can read. Filtering on input
              // rather than validating on submit means a stray letter never
              // reaches the field, so there is nothing to back out of.
              const next = e.target.value.replace(/[^\d.,]/g, "").slice(0, 6);
              setTyped(next);
              if (error) setError(null);
            }}
            // Tapping a field that already holds a number should replace it, not
            // drop a caret in the middle of it.
            onFocus={(e) => e.target.select()}
            aria-label={`Bodyweight in ${unit}`}
            aria-invalid={!!error}
            className="hero-metric w-full bg-transparent px-4 py-3 text-[34px] text-ink outline-none placeholder:text-ink-faint placeholder:font-semibold"
          />
          <span className="pointer-events-none pr-4 text-[15px] font-bold text-muted-2" aria-hidden="true">
            {unit}
          </span>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-warn">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="volt"
          size="lg"
          disabled={logWeight.isPending || !typed.trim()}
          className="mt-3 min-h-[50px] w-full text-[15px]"
        >
          {logWeight.isPending ? "Saving…" : "Log weight"}
        </Button>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-1 min-h-[44px] w-full text-[12px] font-semibold text-ink-muted transition-colors duration-200 hover:text-ink [transition-timing-function:var(--ease)]"
          >
            {skipLabel}
          </button>
        )}
      </div>
    </form>
  );
}
