import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const confirmButtonClass = variant === "danger"
    ? "bg-bad/10 hover:bg-bad/10 text-bad border border-bad/20"
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {variant === "danger" && (
              <div className="p-2 rounded-full bg-bad/10">
                <AlertTriangle className="w-5 h-5 text-bad" />
              </div>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-[13px] text-ink-muted mt-2">
          {description}
        </p>
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "dim" : "volt"}
            onClick={handleConfirm}
            className={`flex-1 ${confirmButtonClass}`}
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
