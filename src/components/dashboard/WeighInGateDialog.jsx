import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import WeighInPrompt from "@/components/dashboard/WeighInPrompt";

// The weigh-in-only sheet, factored out of PrescribedSessionCard so every
// place a workout session can start (Today's own card, the Train tab,
// program detail, a workout's detail page, Quick Workout) gates through the
// same UI instead of each growing its own. WeighInPrompt carries its own
// skip, so there is exactly one way past this dialog, not a dialog-level
// skip plus a form-level one.
export default function WeighInGateDialog({ today, onLogged, onSkip }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSkip?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Weigh in first</DialogTitle>
        </DialogHeader>
        <WeighInPrompt
          today={today}
          variant="sheet"
          onLogged={onLogged}
          onSkip={onSkip}
          skipLabel="Skip, straight to the session"
        />
      </DialogContent>
    </Dialog>
  );
}
