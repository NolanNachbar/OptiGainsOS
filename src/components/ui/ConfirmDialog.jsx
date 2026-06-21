import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Reusable confirmation dialog component
 * Replaces browser confirm() with a styled modal
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  variant = "default", // "default" | "danger"
  loading = false,
}) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" hideClose sheetMinHeight="">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            {variant === "danger" && (
              <div className="p-2 rounded-full bg-bad/12">
                <AlertTriangle className="w-5 h-5 text-bad" />
              </div>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription className="mt-2">
          {description}
        </DialogDescription>
        {/* Coral is THE action hue; destructive confirms route to the `bad`
            `destructive` variant so a delete never masquerades as a coral CTA.
            Stacked + full-width across the full bottom-sheet range (thumb zone),
            reverting to an inline row only from md: up (centered desktop dialog)
            so the layout holds for the whole sheet breakpoint.
            DOM order is Cancel-then-confirm, so flex-col-reverse renders Cancel
            visually LAST (closest to the resting thumb) and the confirm button
            ABOVE it. For NON-danger this puts the coral CTA in the thumb zone.
            For DANGER it is a mobile-safety inversion fix: Cancel must be the
            closest tap target and the destructive button must sit above it, so
            both branches use flex-col-reverse (the prior `flex-col` rendered
            Delete last/lowest, the exact opposite of the intended ordering). */}
        <div className="flex flex-col-reverse md:flex-row gap-3 mt-6">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => onOpenChange(false)}
            className="w-full md:flex-1"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "volt"}
            size="lg"
            onClick={handleConfirm}
            className="w-full md:flex-1"
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
