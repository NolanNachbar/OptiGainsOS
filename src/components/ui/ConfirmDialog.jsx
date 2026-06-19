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
      <DialogContent className="sm:max-w-md" hideClose>
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            {variant === "danger" && (
              <div className="p-2 rounded-full bg-brand/10">
                <AlertTriangle className="w-5 h-5 text-brand" />
              </div>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription className="mt-2">
          {description}
        </DialogDescription>
        {/* Coral is THE action/destructive hue in this identity: the single
            coral confirm dominates while Cancel falls back to neutral glass.
            Stacked + full-width on the mobile sheet (thumb zone), reverting to
            an inline row from sm: up so the coral CTA reads first. */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => onOpenChange(false)}
            className="w-full sm:flex-1"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant="volt"
            size="lg"
            onClick={handleConfirm}
            className="w-full sm:flex-1"
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
