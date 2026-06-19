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
              <div className="p-2 rounded-full bg-bad/10">
                <AlertTriangle className="w-5 h-5 text-bad" />
              </div>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription className="mt-2">
          {description}
        </DialogDescription>
        <div className="flex gap-3 mt-6">
          <Button
            variant="dim"
            size="lg"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "volt"}
            size="lg"
            onClick={handleConfirm}
            className="flex-1"
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
