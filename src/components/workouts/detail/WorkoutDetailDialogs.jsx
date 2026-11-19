import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
          <p className="text-[14px] font-medium text-ink-secondary leading-relaxed">
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button variant="volt" className="flex-1" onClick={handleResumeSession}>
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
            That was the last set. Finish and save this session, or keep going if you want to add more.
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowAllDonePrompt(false)}>
              Not yet
            </Button>
            <Button
              variant="volt"
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
            Some sets haven't been checked off. Would you like to mark them all as complete?
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => handleIncompleteResponse(false)}>
              Leave As-Is
            </Button>
            <Button variant="volt" className="flex-1" onClick={() => handleIncompleteResponse(true)}>
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
            Your progress for this workout will be lost. Are you sure you want to cancel?
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
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
          <div className="space-y-4 py-2">
            <FinishSummary exercises={exerciseLogs} allWorkoutLogs={allWorkoutLogs} weightUnit={weightUnit} />
            <div className="space-y-2">
              <label className="section-label">Workout Notes</label>
              <Textarea
                value={postWorkoutNotes}
                onChange={(e) => setPostWorkoutNotes(e.target.value)}
                placeholder="What felt good/bad? Any injuries? Pump quality?"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setShowPostWorkoutDialog(false)}>
                Go Back
              </Button>
              <Button
                variant="volt"
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
