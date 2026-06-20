import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calculator, Scale, Dumbbell, Disc } from "lucide-react";
import OneRMCalculator from "@/components/workouts/OneRMCalculator";

const STANDARD_PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

function PlateCalculator({ weightUnit = 'lbs' }) {
  const [targetWeight, setTargetWeight] = useState("");
  const [barWeight, setBarWeight] = useState(weightUnit === 'lbs' ? '45' : '20');

  const standardPlates = weightUnit === 'lbs' ? STANDARD_PLATES_LBS : STANDARD_PLATES_KG;

  const calculatePlates = () => {
    const target = parseFloat(targetWeight);
    const bar = parseFloat(barWeight);

    if (!target || !bar || target <= bar) return null;

    const weightPerSide = (target - bar) / 2;
    let remaining = weightPerSide;
    const platesNeeded = [];

    for (const plate of standardPlates) {
      const count = Math.floor(remaining / plate);
      if (count > 0) {
        platesNeeded.push({ weight: plate, count });
        remaining -= count * plate;
      }
    }

    return {
      platesNeeded,
      exact: remaining < 0.1,
      remainder: remaining
    };
  };

  const result = calculatePlates();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block">
            Target Weight ({weightUnit})
          </Label>
          <Input
            type="number"
            step="0.5"
            placeholder={`e.g., ${weightUnit === 'lbs' ? '225' : '100'}`}
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
          />
        </div>

        <div>
          <Label className="mb-2 block">
            Bar Weight ({weightUnit})
          </Label>
          <Select value={barWeight} onValueChange={setBarWeight}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weightUnit === 'lbs' ? (
                <>
                  <SelectItem value="45">Standard Bar (45 lbs)</SelectItem>
                  <SelectItem value="35">Women's Bar (35 lbs)</SelectItem>
                  <SelectItem value="15">Training Bar (15 lbs)</SelectItem>
                  <SelectItem value="0">Custom (0 lbs)</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="20">Standard Bar (20 kg)</SelectItem>
                  <SelectItem value="15">Women's Bar (15 kg)</SelectItem>
                  <SelectItem value="10">Training Bar (10 kg)</SelectItem>
                  <SelectItem value="0">Custom (0 kg)</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {result && (
        <Card className="surface border-none rise-in">
          <CardContent className="pt-6 space-y-4">
            <p className="section-label">Plates Per Side</p>
            {result.platesNeeded.length > 0 ? (
              <div className="space-y-3">
                {result.platesNeeded.map((plate, index) => (
                  <div key={index} className="flex items-center justify-between p-3 glass-inset">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 glass-inset rounded-full flex items-center justify-center text-ink font-bold font-technical">
                        {plate.count}×
                      </div>
                      <div>
                        <div className="font-semibold text-ink font-technical">
                          {plate.weight} {weightUnit}
                        </div>
                        <div className="text-sm text-ink-muted">
                          {plate.count} plate{plate.count > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <span className="font-technical text-ink-muted">
                      {(plate.weight * plate.count).toFixed(1)} {weightUnit}
                    </span>
                  </div>
                ))}

                {!result.exact && result.remainder > 0.1 && (
                  <div className="p-3 glass-inset text-sm text-ink-muted">
                    <strong className="text-ink">Note:</strong> Can't load exactly. Missing {result.remainder.toFixed(1)} {weightUnit} per side.
                  </div>
                )}

                <div className="pt-3 border-t hairline">
                  <div className="text-sm text-ink-muted mb-1">Total loaded:</div>
                  <div className="hero-metric text-4xl text-ink">
                    {parseFloat(barWeight) + (result.platesNeeded.reduce((sum, p) => sum + (p.weight * p.count), 0) * 2)} {weightUnit}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-ink-muted">
                Bar weight is equal to or greater than target. No plates needed!
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!result && targetWeight && (
        <div className="text-center py-8 text-ink-muted">
          Enter a target weight greater than the bar weight to calculate plates.
        </div>
      )}
    </div>
  );
}

function brzyckiPct(effectiveReps) {
  if (effectiveReps <= 1) return 100;
  if (effectiveReps > 36) return null;
  return (37 - effectiveReps) / 36 * 100;
}

function WorkingWeightCalculator({ weightUnit = 'lbs' }) {
  const [knownWeight, setKnownWeight] = useState("");
  const [knownReps, setKnownReps] = useState("");
  const [knownRir, setKnownRir] = useState("");
  const [targetReps, setTargetReps] = useState("");
  const [targetRir, setTargetRir] = useState("");

  const increment = weightUnit === 'lbs' ? 2.5 : 1.25;

  const result = (() => {
    const w = parseFloat(knownWeight);
    const kr = parseInt(knownReps);
    const krir = parseInt(knownRir);
    const tr = parseInt(targetReps);
    const trir = parseInt(targetRir);
    if (!w || !kr || isNaN(krir) || !tr || isNaN(trir)) return null;

    const knownEffective = kr + krir;
    const targetEffective = tr + trir;

    const knownPct = brzyckiPct(knownEffective);
    const targetPct = brzyckiPct(targetEffective);
    if (!knownPct || !targetPct) return null;

    const estimatedOneRM = w / (knownPct / 100);
    const exact = estimatedOneRM * (targetPct / 100);
    const rounded = Math.round(exact / increment) * increment;

    return { estimatedOneRM, targetPct, exact, rounded };
  })();

  return (
    <div className="space-y-5">
      {/* Known performance */}
      <div>
        <p className="section-label mb-3">What you know</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="mb-1.5 block">
              Weight ({weightUnit})
            </Label>
            <Input type="number" inputMode="decimal" step="0.5" placeholder={weightUnit === 'lbs' ? "225" : "100"}
              value={knownWeight} onChange={(e) => setKnownWeight(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Reps done</Label>
            <Input type="number" inputMode="numeric" min="1" max="36" placeholder="5"
              value={knownReps} onChange={(e) => setKnownReps(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">RIR left</Label>
            <Input type="number" inputMode="numeric" min="0" max="10" placeholder="2"
              value={knownRir} onChange={(e) => setKnownRir(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Target */}
      <div>
        <p className="section-label mb-3">What you want to do</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Target reps</Label>
            <Input type="number" inputMode="numeric" min="1" max="36" placeholder="3"
              value={targetReps} onChange={(e) => setTargetReps(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Target RIR</Label>
            <Input type="number" inputMode="numeric" min="0" max="10" placeholder="2"
              value={targetRir} onChange={(e) => setTargetRir(e.target.value)} />
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-muted text-center">
        Estimates 1RM from your known set, then calculates target weight. Uses Brzycki formula.
      </p>

      {result && (
        <Card className="surface border-none rise-in">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <div className="text-sm text-ink-muted mb-1">Working Weight</div>
              <div className="hero-metric text-4xl text-ink">
                {result.rounded} <span className="text-2xl text-ink-muted">{weightUnit}</span>
              </div>
              <div className="text-sm text-ink-muted mt-1">
                rounded to nearest {increment} {weightUnit}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t hairline">
              <div className="text-center">
                <div className="text-xs text-ink-muted mb-0.5">Est. 1RM</div>
                <div className="font-semibold text-ink font-technical">{result.estimatedOneRM.toFixed(1)} {weightUnit}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-ink-muted mb-0.5">% of 1RM</div>
                <div className="font-semibold text-ink font-technical">{result.targetPct.toFixed(1)}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-ink-muted mb-0.5">Exact weight</div>
                <div className="font-semibold text-ink font-technical">{result.exact.toFixed(1)} {weightUnit}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CalculatorsModal({ isOpen, onClose, weightUnit = 'lbs' }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-ink-muted" />
            Lifting Calculators
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="1rm" className="w-full">
          <TabsList className="w-full h-auto mb-4 gap-1 rounded-xl border-b-0 glass-inset p-1">
            <TabsTrigger variant="segment" value="1rm" className="flex-1">
              <Scale className="w-4 h-4 mr-2" />
              1RM
            </TabsTrigger>
            <TabsTrigger variant="segment" value="working" className="flex-1">
              <Dumbbell className="w-4 h-4 mr-2" />
              Working
            </TabsTrigger>
            <TabsTrigger variant="segment" value="plates" className="flex-1">
              <Disc className="w-4 h-4 mr-2" />
              Plates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="1rm">
            <OneRMCalculator weightUnit={weightUnit} embedded />
          </TabsContent>

          <TabsContent value="working">
            <WorkingWeightCalculator weightUnit={weightUnit} />
          </TabsContent>

          <TabsContent value="plates">
            <PlateCalculator weightUnit={weightUnit} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
