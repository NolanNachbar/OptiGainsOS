import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { db } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateProfile, invalidateBodyWeight } from "@/lib/queryKeys";
import { calculateFormulaTDEE, calculateMacroSplit } from "@/utils/coachingUtils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACTIVITY_LEVELS, SEX_OPTIONS } from "@/lib/constants";

export default function StatsSetupModal({ open, onOpenChange }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [heightUnit, setHeightUnit] = useState("in");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [weight, setWeight] = useState("");
  const [proteinPerLb, setProteinPerLb] = useState(0.8);

  // Pre-fill from existing profile data when modal opens
  useEffect(() => {
    if (!open || !profile) return;
    setAge(profile.age ? String(profile.age) : "");
    setSex(profile.sex || "");
    setActivityLevel(profile.activity_level || "");

    const unit = profile.height_unit || "in";
    setHeightUnit(unit);
    if (profile.height_cm) {
      if (unit === "in") {
        // height_cm stores total inches when unit is "in"
        setHeightFeet(String(Math.floor(profile.height_cm / 12)));
        setHeightInches(String(profile.height_cm % 12));
      } else {
        // height_cm stores actual cm when unit is "cm"
        setHeightCm(String(profile.height_cm));
      }
    }
    setWeight(profile.current_weight ? String(profile.current_weight) : "");

    // Default protein multiplier by goal
    const goals = Array.isArray(profile.primary_goal) ? profile.primary_goal : [profile.primary_goal || ''];
    const isHighProtein = goals.some(g => {
      const lower = (g || '').toLowerCase();
      return lower.includes('weight_loss') || lower.includes('muscle_gain');
    });
    setProteinPerLb(isHighProtein ? 1.0 : 0.8);
  }, [open, profile]);

  // Computed preview values
  const weightLbs = weight
    ? (profile?.weight_unit === 'kg' ? parseFloat(weight) * 2.205 : parseFloat(weight))
    : 0;
  const proteinGrams = weightLbs ? Math.round(weightLbs * (parseFloat(proteinPerLb) || 0.8)) : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;

      const updates = {};
      if (age) updates.age = parseInt(age);
      if (sex) updates.sex = sex;
      if (activityLevel) updates.activity_level = activityLevel;

      if (heightUnit === "in") {
        const totalInches = (parseInt(heightFeet) || 0) * 12 + (parseInt(heightInches) || 0);
        if (totalInches > 0) {
          updates.height_cm = totalInches;  // stored as total inches when unit is "in"
          updates.height_unit = "in";
        }
      } else if (heightCm) {
        updates.height_cm = parseFloat(heightCm);  // stored as actual cm when unit is "cm"
        updates.height_unit = "cm";
      }

      if (weight) updates.current_weight = parseFloat(weight);

      await db.entities.UserProfile.update(profile.id, updates);

      if (weight) {
        await db.entities.BodyWeightEntry.create({
          weight: parseFloat(weight),
          recorded_date: format(new Date(), "yyyy-MM-dd"),
          notes: null,
          created_by: user.id,
        });
      }

      // Auto-calculate and save macro goals if we have enough data
      const profileLike = {
        weight_unit: profile.weight_unit || 'lbs',
        height_unit: updates.height_unit || profile.height_unit || 'in',
        height_cm: updates.height_cm || profile.height_cm,
        age: updates.age || profile.age,
        sex: updates.sex || profile.sex,
        activity_level: updates.activity_level || profile.activity_level,
      };
      const weightValue = weight ? parseFloat(weight) : profile.current_weight;
      const formula = calculateFormulaTDEE(profileLike, weightValue);
      if (formula?.tdee && weightLbs) {
        const protein = Math.round(weightLbs * (parseFloat(proteinPerLb) || 0.8));
        const macros = calculateMacroSplit(formula.tdee, protein);
        await db.entities.UserProfile.update(profile.id, {
          daily_calorie_goal: macros.calories,
          daily_protein_goal: macros.protein,
          daily_carbs_goal: macros.carbs,
          daily_fats_goal: macros.fats,
        });
      }
    },
    onSuccess: () => {
      invalidateProfile(queryClient);
      if (weight) invalidateBodyWeight(queryClient);
      toast.success("Stats saved and goals calculated!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to save stats");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set Up TDEE Calculation</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-ink-muted ">
          Fill in your stats and we'll automatically calculate your daily calorie and macro targets.
        </p>

        <div className="space-y-4 pt-2">
          {/* Sex + Age */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Sex</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select sex">
                    {SEX_OPTIONS.find(o => o.value === sex)?.label || "Select sex"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SEX_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Age</Label>
              <Input
                type="number"
                placeholder="25"
                value={age}
                onChange={e => setAge(e.target.value)}
                min="13"
                max="120"
                className="mt-1"
              />
            </div>
          </div>

          {/* Height */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Height</Label>
              <div className="flex gap-1 bg-charcoal-elevated rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (heightUnit === "cm" && heightCm) {
                      const totalInches = Math.round(parseFloat(heightCm) / 2.54);
                      setHeightFeet(String(Math.floor(totalInches / 12)));
                      setHeightInches(String(totalInches % 12));
                    }
                    setHeightUnit("in");
                  }}
                  className={`px-3 py-1 rounded-md text-sm transition-all ${
                    heightUnit === "in" ? "bg-charcoal-surface shadow text-brand font-medium" : "text-ink-muted"
                  }`}
                >ft/in</button>
                <button
                  type="button"
                  onClick={() => {
                    if (heightUnit === "in" && heightFeet) {
                      const totalInches = (parseInt(heightFeet) || 0) * 12 + (parseInt(heightInches) || 0);
                      setHeightCm(String(Math.round(totalInches * 2.54)));
                    }
                    setHeightUnit("cm");
                  }}
                  className={`px-3 py-1 rounded-md text-sm transition-all ${
                    heightUnit === "cm" ? "bg-charcoal-surface shadow text-brand font-medium" : "text-ink-muted"
                  }`}
                >cm</button>
              </div>
            </div>
            {heightUnit === "in" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Feet</Label>
                  <Input
                    type="number"
                    placeholder="5"
                    value={heightFeet}
                    onChange={e => setHeightFeet(e.target.value)}
                    min="3"
                    max="8"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Inches</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={heightInches}
                    onChange={e => setHeightInches(e.target.value)}
                    min="0"
                    max="11"
                    className="mt-1"
                  />
                </div>
              </div>
            ) : (
              <Input
                type="number"
                placeholder="178"
                value={heightCm}
                onChange={e => setHeightCm(e.target.value)}
                min="100"
                max="250"
              />
            )}
          </div>

          {/* Activity Level */}
          <div>
            <Label>Activity Level</Label>
            <Select value={activityLevel} onValueChange={setActivityLevel}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select activity level">
                  {ACTIVITY_LEVELS.find(o => o.value === activityLevel)?.label || "Select activity level"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_LEVELS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label} — {opt.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Weight */}
          <div>
            <Label>Current Weight ({profile?.weight_unit || "lbs"})</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="Enter your weight"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Protein Target */}
          <div>
            <Label>Protein Target</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                step="0.05"
                min="0.5"
                max="2.5"
                value={proteinPerLb}
                onChange={e => setProteinPerLb(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-ink-muted ">
                g / lb
                {proteinGrams ? ` = ${proteinGrams}g/day` : ""}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              Typical range: 0.7–1.2 g/lb. Higher end for muscle gain or cutting.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-brand hover:bg-brand"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving..." : "Save & Calculate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
