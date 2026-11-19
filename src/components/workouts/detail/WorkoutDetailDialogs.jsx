import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import FinishSummary from "@/components/workouts/FinishSummary";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatTimeAgo } from "@/components/workouts/detail/workoutDetailUtils";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function WorkoutDetailDialogs({ allWorkoutLogs, exerciseLogs, handleCancelLogging, handleDismissResume, handleIncompleteResponse, handleResumeSession, handleSaveWorkoutLog, postWorkoutNotes, resumeSession, saveWorkoutLogMutation, setPostWorkoutNotes, setShowAllDonePrompt, setShowCancelConfirm, setShowIncompletePrompt, setShowPostWorkoutDialog, showAllDonePrompt, showCancelConfirm, showIncompletePrompt, showPostWorkoutDialog, weighInGateSheet, weightUnit }) {
  return (
    <>
      {/* Resume previous session prompt. Dismissing via scrim tap must NOT cancel
          the real in-progress session (that used to fire handleDismissResume, so
          an accidental tap outside the dialog silently discarded the workout) —
          onOpenChange is a no-op here; only the explicit "Start Fresh" button may
          cancel it. */}
      {weighInGateSheet}
      <Dialog open={!!resumeSession} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" hideClose>
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Unfinished session from {formatTimeAgo(resumeSession?.start_time)}. Resume it or start fresh.
          </DialogDescription>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleResumeSession}>
              Resume
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* "All sets done" confirm: opened only by the transition effect above.
          "Not yet" just closes it; nothing is saved or ended on its own. */}
      <Dialog open={showAllDonePrompt} onOpenChange={setShowAllDonePrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>All sets done. Finish workout?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Last set logged. Save the session now, or keep going.
          </DialogDescription>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowAllDonePrompt(false)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => { setShowAllDonePrompt(false); handleSaveWorkoutLog(); }}
            >
              Finish workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Incomplete sets prompt */}
      <Dialog open={showIncompletePrompt} onOpenChange={(open) => { if (!open) setShowIncompletePrompt(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incomplete Sets</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Some sets are not checked off. Mark them all complete, or save them as they are.
          </DialogDescription>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => handleIncompleteResponse(false)}>
              Leave As-Is
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => handleIncompleteResponse(true)}>
              Complete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel workout confirm — moved here from WorkoutLoggingHeader's old
          kebab in the Phase A rebuild; reachable from the focused exercise's
          kebab, or the zero-exercise fallback link below. */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Workout?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Your progress for this workout will be lost.
          </DialogDescription>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
              Keep Going
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => { setShowCancelConfirm(false); handleCancelLogging(); }}
            >
              Cancel Workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-workout notes prompt */}
      <Dialog open={showPostWorkoutDialog} onOpenChange={setShowPostWorkoutDialog}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-1">
            <FinishSummary exercises={exerciseLogs} allWorkoutLogs={allWorkoutLogs} weightUnit={weightUnit} />
            <div className="space-y-2">
              <Label htmlFor="post-workout-notes" className="text-micro text-ink-muted">Workout Notes</Label>
              <Textarea
                id="post-workout-notes"
                value={postWorkoutNotes}
                onChange={(e) => setPostWorkoutNotes(e.target.value)}
                placeholder="What felt good or bad, any pain, pump quality"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => setShowPostWorkoutDialog(false)}>
                Go Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-[2]"
                disabled={saveWorkoutLogMutation.isPending || saveWorkoutLogMutation.isSuccess}
                onClick={() => saveWorkoutLogMutation.mutate()}
              >
                {saveWorkoutLogMutation.isPending
                  ? "Saving..."
                  : saveWorkoutLogMutation.isSuccess
                    ? "Saved"
                    : "Log Workout"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
