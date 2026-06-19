import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, X } from "lucide-react";

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

export default function OneRMCalculator({ onClose, weightUnit, embedded = false }) {
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

  const content = (
    <Card className={embedded ? "border-none shadow-none" : "w-full max-w-md border-none"}>
      {!embedded && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              1RM Calculator
            </CardTitle>
            <Button variant="dim" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
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

          {oneRM && (
            <div className="space-y-3 pt-2 rise-in">
              <div className="text-center p-4 glass-inset">
                <div className="text-sm text-ink-muted">Estimated 1 Rep Max</div>
                <div className="hero-metric text-4xl text-ink">{oneRM} {weightUnit}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-ink-muted">Weight for target reps:</div>
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
            </div>
          )}

          <p className="text-xs text-ink-muted text-center">
            Uses Brzycki formula. Most accurate for 1-12 reps.
          </p>
        </CardContent>
      </Card>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {content}
    </div>
  );
}
