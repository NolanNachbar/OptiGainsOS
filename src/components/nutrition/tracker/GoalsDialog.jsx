import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GoalsFormContent } from "@/components/nutrition/tracker/shared";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";

// Extracted from FoodTracker.jsx (no behavior change).
export default function GoalsDialog({ activePhase, fiberGoal, goalForm, latestWeight, navigate, profile, proteinPerLb, setFiberGoal, setGoalForm, setProteinPerLb, setShowGoalsModal, setShowStatsModal, showGoalsModal, targets, tdee, updateGoalsMutation }) {
  return (
    <>
      {/* ─── Goals Modal ─── */}
      <Dialog open={showGoalsModal} onOpenChange={setShowGoalsModal}>
        <DialogContent className="max-w-lg flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
            <DialogTitle>Nutrition Goals</DialogTitle>
            <DialogDescription>
              Set your daily calorie and macro targets, or sync them to your active phase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5" style={{ WebkitOverflowScrolling: 'touch' }}>
            <GoalsFormContent
              activePhase={activePhase}
              tdee={tdee}
              profile={profile}
              latestWeight={latestWeight}
              proteinPerLb={proteinPerLb}
              setProteinPerLb={setProteinPerLb}
              goalForm={goalForm}
              setGoalForm={setGoalForm}
              fiberGoal={fiberGoal}
              setFiberGoal={setFiberGoal}
              // The DRI default off the calorie target the day actually resolved
              // to (engine rec first), not off the profile goal — otherwise the
              // dialog promises a number the daily readout contradicts.
              fiberDefault={Math.round((targets.calories / 1000) * 14)}
              navigate={navigate}
              setShowGoalsModal={setShowGoalsModal}
              setShowStatsModal={setShowStatsModal}
            />
          </div>
          {/* Save pinned to a non-scrolling footer (out of overflow-y-auto). The
              dialog uses p-0 so it skips the primitive's safe-area pad, re-add it
              here so the CTA clears the home-indicator. */}
          <div className="px-6 pt-4 border-t bg-charcoal-surface shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <Button variant="volt" className="w-full" disabled={updateGoalsMutation.isPending}
              onClick={() => updateGoalsMutation.mutate({
                daily_calorie_goal: parseInt(goalForm.daily_calorie_goal) || 0,
                daily_protein_goal: parseInt(goalForm.daily_protein_goal) || 0,
                daily_carbs_goal:   parseInt(goalForm.daily_carbs_goal)   || 0,
                daily_fats_goal:    parseInt(goalForm.daily_fats_goal)    || 0,
                // Null clears it and hands fiber back to the DRI ratio, which is
                // a real choice — don't coerce a blank field to 0 g of fiber.
                daily_fiber_goal:   fiberGoal === "" ? null : (parseInt(fiberGoal) || null),
              })}
            >
              {updateGoalsMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 spin-loop" />Saving...</>
                : <><Save className="w-4 h-4 mr-2" />Save Goals</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
