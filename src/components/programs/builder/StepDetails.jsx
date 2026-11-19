import { useState } from "react";
import { Card, CardContent, Stat } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import NumberStepper from "./NumberStepper";
import { GOALS } from "./constants";

export default function StepDetails({ program, setProgram, tagInput, setTagInput }) {
  const update = (field, value) => setProgram((p) => ({ ...p, [field]: value }));
  // Optional copy (Description + Tags) is deferred behind a disclosure so the
  // load-bearing duration controls + Next land within ~1.5 viewports on mobile.
  // Opens automatically when editing a program that already has either filled.
  const [showOptional, setShowOptional] = useState(
    Boolean(program.description) || program.tags.length > 0
  );

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !program.tags.includes(tag)) {
      update("tags", [...program.tags, tag]);
    }
    setTagInput("");
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div>
          <Label className="text-micro">Program name</Label>
          <Input
            value={program.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g., Push Pull Legs Hypertrophy"
            className="mt-1"
          />
          {/* Gating helper sits with the field it gates, not orphaned at the
              bottom by the Next button, names WHY forward is locked. */}
          {!program.name.trim() && (
            <p className="text-caption text-ink-muted mt-1">
              Name your program to continue
            </p>
          )}
        </div>

        {/* Cycle configuration — the load-bearing controls, surfaced directly
            under the name so duration is decided before optional copy. Each
            stepper gets a FULL-WIDTH row at 390px (grid-cols-1) so its
            -/number/+ controls never cramp, pairing off to 2-up at sm+. Goal
            keeps its own full-width row; all three rejoin 3-up on desktop. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div>
            <Label className="text-micro">Cycle length</Label>
            <NumberStepper
              value={program.cycle_length}
              onChange={(v) => update("cycle_length", v)}
              min={1}
              max={30}
              ariaLabel="cycle length"
            />
            <p className="text-caption text-ink-muted mt-0.5">Days per cycle · rest days included</p>
          </div>
          <div>
            <Label className="text-micro">Cycles</Label>
            <NumberStepper
              value={program.num_cycles}
              onChange={(v) => update("num_cycles", v)}
              min={1}
              max={20}
              ariaLabel="number of cycles"
            />
            <p className="text-caption text-ink-muted mt-0.5">Times repeated</p>
          </div>
          {/* Goal spans both columns (own row) then rejoins the desktop
              three-up row. */}
          <div className="sm:col-span-2 md:col-span-1">
            <Label className="text-micro">Goal</Label>
            <Select
              value={program.goal}
              onValueChange={(v) => update("goal", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue>
                  {GOALS.find(g => g.value === program.goal)?.label || program.goal}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Total training days — the derived datum, promoted to the ONE
            dominant display figure on Step 1 (program-builder-2,3). The total
            renders as a Stat far larger than any label (.form-label,
            12px) or stepper value (~14px) so Step 1 lands a single focal number.
            The whole derived line is wrapped in font-numeral tabular-nums (tabular
            numerals) so every figure aligns; the supporting prose stays muted
            below the hero figure (program-builder-3 / program-duration-modal-6). */}
        <Card variant="inset" className="p-4">
          <Stat
            label="Total training days"
            value={program.cycle_length * program.num_cycles}
            unit="days"
            reason={`${program.cycle_length}-day cycle repeated ${program.num_cycles} time${program.num_cycles !== 1 ? "s" : ""}`}
          />
        </Card>

        {/* Optional details — Description + Tags are deferred behind a
            disclosure so the duration controls + Next land within ~1.5 phone
            viewports. The toggle is a full-width 44px control; chevron rotates
            on the single system easing. */}
        <div className="border-t border-charcoal-borderSoft pt-3">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
            className="w-full min-h-[44px] flex items-center justify-between text-left"
          >
            <span className="text-micro text-ink-muted">Optional details</span>
            <ChevronDown
              className={`w-4 h-4 text-ink-muted transition-transform duration-base ease-out ${
                showOptional ? "rotate-180" : ""
              }`}
            />
          </button>

          {showOptional && (
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-micro">Description</Label>
                <Textarea
                  value={program.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe the program goals and approach…"
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-micro">Tags</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g., powerlifting"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTag} >
                    Add
                  </Button>
                </div>
                {program.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {program.tags.map((tag) => (
                      // 44px hit target wraps the ~22px chip so the remove affordance
                      // is thumb-reachable while the Badge keeps its compact size.
                      <button
                        key={tag}
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                        onClick={() => update("tags", program.tags.filter((t) => t !== tag))}
                        className="min-h-[44px] flex items-center"
                      >
                        <Badge variant="outline" className="cursor-pointer">
                          {tag} &times;
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Cycle Days (DnD + Inline Edit) ─────────────
