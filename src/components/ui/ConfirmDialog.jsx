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
  details, // optional node rendered in the body (numerics get tabular-nums)
}) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" hideClose sheetMinHeight="">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            {/* Danger header is a single bare red glyph: no bg-bad tint disc,
                so the only saturated-red fill in the dialog is the Delete
                button. Color is data, the warning glyph signals destructiveness
                without a second red surface competing with the CTA. */}
            {variant === "danger" && (
              <AlertTriangle className="w-5 h-5 text-bad shrink-0" />
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription className="mt-2">
          {description}
        </DialogDescription>
        {/* Optional details datum (e.g. counts, sizes). tabular-nums keeps any
            numerics aligned per the design system's number rule. */}
        {details != null && (
          <div className="mt-3 tabular-nums">
            {details}
          </div>
        )}
        {/* Teal (var(--color-brand) #19C8A6) is THE single action color;
            destructive confirms route to the `bad` `destructive` variant so a
            delete never masquerades as the teal CTA.
            Stacked + full-width across the full bottom-sheet range (thumb zone),
            reverting to an inline row only from md: up (centered desktop dialog)
            so the layout holds for the whole sheet breakpoint.
            DOM order is Cancel-then-confirm, so flex-col-reverse renders Cancel
            visually LAST (closest to the resting thumb) and the confirm button
            ABOVE it. For NON-danger this puts the teal CTA in the thumb zone.
            For DANGER it is a mobile-safety inversion fix: Cancel must be the
            closest tap target and the destructive button must sit above it, so
            both branches use flex-col-reverse (the prior `flex-col` rendered
            Delete last/lowest, the exact opposite of the intended ordering).
            In both branches Cancel uses the `ghost` variant (filled glassGhost
            pill with a hairline edge) so it is always a visible, edged tap
            target distinguishable from the sheet, never bare text. The
            destructive Delete keeps higher prominence via its saturated fill,
            so Cancel stays subordinate without dropping its affordance. */}
        <div className="flex flex-col-reverse md:flex-row mt-6 gap-3">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => onOpenChange(false)}
            className="w-full md:flex-1 font-medium md:font-semibold"
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
