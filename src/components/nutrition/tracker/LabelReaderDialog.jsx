import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Trash2, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extracted from FoodTracker.jsx (no behavior change).
export default function LabelReaderDialog({ isReadingLabel, labelName, labelPhoto, labelPhotoInputRef, pickLabelPhoto, readLabel, resetLabelCapture, setLabelName, setLabelPhoto, setShowLabelCapture, showLabelCapture }) {
  return (
    <>
      {/* ─── Nutrition-label reader (barcode-miss fallback) ─── */}
      <Dialog open={showLabelCapture} onOpenChange={(open) => { setShowLabelCapture(open); if (!open) resetLabelCapture(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Read a nutrition label</DialogTitle>
            <DialogDescription>
              Barcode missed it? Snap the Nutrition Facts panel and type the product name. The macros read straight off the label.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={labelPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={pickLabelPhoto}
          />

          <div className="space-y-3">
            <div>
              <Label htmlFor="label-name">Product name</Label>
              <Input
                id="label-name"
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                placeholder="e.g. Chobani vanilla yogurt"
                disabled={isReadingLabel}
                className="mt-1"
              />
            </div>
            {labelPhoto ? (
              <div className="relative">
                <img src={labelPhoto.previewUrl} alt="Nutrition label to read" className="w-full rounded-lg object-contain max-h-72 bg-black/40" />
                <button
                  type="button"
                  onClick={() => setLabelPhoto((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; })}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
                  aria-label="Remove photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="dim" size="lg" className="w-full" onClick={() => labelPhotoInputRef.current?.click()} disabled={isReadingLabel}>
                <Camera className="w-4 h-4" /> Photograph the label
              </Button>
            )}
            <Button
              type="button"
              variant="volt"
              size="lg"
              className="w-full"
              onClick={readLabel}
              disabled={isReadingLabel || !labelPhoto}
            >
              {isReadingLabel ? <><Loader2 className="w-4 h-4 spin-loop" /> Reading…</> : <><Camera className="w-4 h-4" /> Read label</>}
            </Button>
            <p className="text-[11px] text-ink-muted">
              Reads the printed numbers, so it's accurate when the panel is sharp and fully in frame. Review before logging.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
