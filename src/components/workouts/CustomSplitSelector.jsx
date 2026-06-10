import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";

// Preset split options for each day count
const PRESET_SPLITS = {
  1: [
    { id: 'full', name: 'Full Body 1x', split: ["Full Body"] },
  ],
  2: [
    { id: 'full', name: 'Full Body 2x', split: ["Full Body", "Full Body"] },
    { id: 'ul', name: 'Upper/Lower', split: ["Upper", "Lower"] },
  ],
  3: [
    { id: 'full', name: 'Full Body 3x', split: ["Full Body", "Full Body", "Full Body"] },
    { id: 'ppl', name: 'Push/Pull/Legs', split: ["Push", "Pull", "Legs"] },
    { id: 'ulf', name: 'Upper/Lower/Full', split: ["Upper", "Lower", "Full Body"] },
  ],
  4: [
    { id: 'ul', name: 'Upper/Lower 2x', split: ["Upper", "Lower", "Upper", "Lower"] },
    { id: 'pplf', name: 'Push/Pull/Legs/Full', split: ["Push", "Pull", "Legs", "Full Body"] },
  ],
  5: [
    { id: 'ppl', name: 'PPL + Full Body', split: ["Push", "Pull", "Legs", "Full Body", "Full Body"] },
    { id: 'ppl2', name: 'PPL x2 (5 day)', split: ["Push", "Pull", "Legs", "Push", "Pull"] },
    { id: 'ulppl', name: 'Upper/Lower/PPL', split: ["Upper", "Lower", "Push", "Pull", "Legs"] },
  ],
  6: [
    { id: 'ppl', name: 'PPL x2', split: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"] },
    { id: 'arnold', name: 'Arnold Split', split: ["Chest/Back", "Shoulders/Arms", "Legs", "Chest/Back", "Shoulders/Arms", "Legs"] },
  ],
  7: [
    { id: 'ppl_full', name: 'PPL x2 + Full Body', split: ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Full Body"] },
    { id: 'bro', name: 'Bro Split', split: ["Chest", "Back", "Shoulders", "Legs", "Arms", "Full Body", "Full Body"] },
  ]
};

// Available day focuses for custom building
const DAY_FOCUSES = [
  "Push",
  "Pull",
  "Legs",
  "Upper",
  "Lower",
  "Full Body",
  "Chest/Back",
  "Shoulders/Arms",
  "Chest",
  "Back",
  "Shoulders",
  "Arms"
];

export default function CustomSplitSelector({ daysPerWeek, duration, onSelectSplit, onCancel }) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customSplit, setCustomSplit] = useState(
    new Array(daysPerWeek).fill("Full Body")
  );

  // Only show the exercises-per-day picker when user has 60+ min
  const is60Plus = String(duration || "").includes("60");
  const [exercisesPerDay, setExercisesPerDay] = useState(7);

  const presets = PRESET_SPLITS[daysPerWeek] || [];

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    setIsCustomMode(false);
  };

  const handleConfirm = () => {
    const chosenSplit = isCustomMode
      ? customSplit
      : presets.find(p => p.id === selectedPreset)?.split;
    if (!chosenSplit) return;
    onSelectSplit(chosenSplit, is60Plus ? exercisesPerDay : null);
  };

  const handleCustomDayChange = (dayIndex, focus) => {
    const newSplit = [...customSplit];
    newSplit[dayIndex] = focus;
    setCustomSplit(newSplit);
  };

  const startCustomMode = () => {
    setIsCustomMode(true);
    setSelectedPreset(null);
  };

  const isValid = selectedPreset || (isCustomMode && customSplit.every(day => day));

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col">
        <DialogHeader className="flex-shrink-0 border-b p-6 pb-4">
          <DialogTitle>Choose Your {daysPerWeek}-Day Split</DialogTitle>
          <p className="text-sm text-ink-muted  mt-1">
            Select a preset or build your own custom schedule
          </p>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 min-h-0 p-6">
          {/* Preset Splits - hidden when in custom mode */}
          {presets.length > 0 && !isCustomMode && (
            <div>
              <h3 className="font-semibold mb-3 text-ink">Preset Splits</h3>
              <div className="space-y-3">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedPreset === preset.id && !isCustomMode
                        ? 'border-brand bg-brand/[5%]'
                        : 'border-charcoal-border  hover:border-brand/30 bg-charcoal-surface '
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-ink">{preset.name}</span>
                      {selectedPreset === preset.id && !isCustomMode && (
                        <Check className="w-5 h-5 text-brand" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preset.split.map((day, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          Day {idx + 1}: {day}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Split Builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink">Custom Split</h3>
              {!isCustomMode ? (
                <Button variant="outline" size="sm" onClick={startCustomMode}>
                  Build Custom
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setIsCustomMode(false)}>
                  Back to Presets
                </Button>
              )}
            </div>

            {isCustomMode && (
              <div className="p-4 border-2 border-brand/30 rounded-lg bg-brand/[5%]/50">
                <p className="text-sm text-ink-muted  mb-3">
                  Choose the focus for each day of your split
                </p>
                <div className="space-y-3">
                  {Array.from({ length: daysPerWeek }).map((_, dayIndex) => (
                    <div key={dayIndex} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-ink-muted  min-w-[60px]">
                        Day {dayIndex + 1}:
                      </span>
                      <Select value={customSplit[dayIndex]} onValueChange={(value) => handleCustomDayChange(dayIndex, value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_FOCUSES.map((focus) => (
                            <SelectItem key={focus} value={focus}>
                              {focus}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 border-t px-6 py-4 space-y-4">
          {/* Exercises per day — only shown for 60+ min users */}
          {is60Plus && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Exercises per day
                  </p>
                  <p className="text-xs text-ink-muted">
                    You have 60+ min — choose how many exercises per session
                  </p>
                </div>
                <span className="text-lg font-bold text-brand">{exercisesPerDay}</span>
              </div>
              <div className="flex gap-2">
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setExercisesPerDay(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                      exercisesPerDay === n
                        ? "border-brand/50 bg-brand text-[var(--color-action-dark)] font-bold"
                        : "border-charcoal-border text-ink-muted hover:border-brand/30  "
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!isValid}
              variant="primary"
              className="flex-1"
            >
              Generate Workouts
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
