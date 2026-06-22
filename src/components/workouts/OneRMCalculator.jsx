import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 1RM calculation using Brzycki formula
const calculate1RM = (weight, reps) => {
  if (reps === 1) return weight;
  if (reps > 12) return null; // Less accurate for high reps
  return Math.round(weight * (36 / (37 - reps)));
};

// Calculate weight for target reps given 1RM
const calculateWeightForReps = (oneRM, targetReps) => {
  if (targetReps === 1) return oneRM;
  return Math.round(oneRM * ((37 - targetReps) / 36));
};

export default function OneRMCalculator({ weightUnit }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  // Live-compute: derive the estimate from inputs (no Calculate button) so the
  // 1RM tab matches the Working/Plates interaction model in CalculatorsModal.
  const oneRM = (() => {
    const w = parseFloat(weight);
    const r = parseInt(reps);
    if (w > 0 && r > 0 && r <= 12) return calculate1RM(w, r);
    return null;
  })();

  const repsTooHigh = parseInt(reps) > 12;

  const repRanges = [1, 3, 5, 8, 10, 12];

  return (
    <Card className="border-none shadow-none">
      <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Weight ({weightUnit})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="135"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Reps (1-12)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="5"
                min="1"
                max="12"
                className="mt-1"
              />
            </div>
          </div>

          {repsTooHigh && (
            <p className="text-xs text-ink-muted text-center">
              For accuracy, use 12 reps or fewer.
            </p>
          )}

          {oneRM ? (
            <Card className="surface border-none rise-in">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center">
                  <div className="text-sm text-ink-muted mb-1">Estimated 1 Rep Max</div>
                  <div className="hero-metric text-4xl text-ink">
                    {oneRM} <span className="text-2xl text-ink-muted">{weightUnit}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t hairline">
                  <p className="section-label">Weight for target reps</p>
                  <div className="grid grid-cols-3 gap-2">
                    {repRanges.map((targetReps) => (
                      <div key={targetReps} className="text-center p-2 glass-inset">
                        <div className="text-xs text-ink-muted">{targetReps} rep{targetReps > 1 ? 's' : ''}</div>
                        <div className="font-semibold text-ink font-technical">
                          {calculateWeightForReps(oneRM, targetReps)} {weightUnit}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Quiet placeholder scaffold — keeps the sheet content-sized and shows
               the shape of the result (muted hero dash + greyed rep-range grid)
               before inputs are filled, so the tab never opens to a large empty band. */
            <Card className="surface border-none" aria-hidden="true">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center">
                  <div className="text-sm text-ink-faint mb-1">Estimated 1 Rep Max</div>
                  <div className="hero-metric text-4xl text-ink-faint">
                    —
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t hairline">
                  <p className="section-label text-ink-faint">Weight for target reps</p>
                  <div className="grid grid-cols-3 gap-2">
                    {repRanges.map((targetReps) => (
                      <div key={targetReps} className="text-center p-2 glass-inset opacity-50">
                        <div className="text-xs text-ink-faint">{targetReps} rep{targetReps > 1 ? 's' : ''}</div>
                        <div className="font-semibold text-ink-faint font-technical">—</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-ink-muted text-center">
            Uses Brzycki formula. Most accurate for 1-12 reps.
          </p>
        </CardContent>
      </Card>
  );
}
