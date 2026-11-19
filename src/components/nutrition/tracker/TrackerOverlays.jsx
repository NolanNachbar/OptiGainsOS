import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getTodayString } from "@/utils/dateUtils";
import { formatEntryServing } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import SwapFoodDialog from "@/components/nutrition/SwapFoodDialog";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import { toast } from "sonner";

// Extracted from FoodTracker.jsx (no behavior change).
export default function TrackerOverlays({ copyDayMutation, copyFromDate, copySelection, copySourceEntries, customFoods, dayContext, foodSwap, resetLabelCapture, revertSwap, runSwap, selectFood, selectedDate, setCopyFromDate, setCopySelection, setSearchQuery, setShowBarcodeScanner, setShowCopyDayDialog, setShowFoodFormatGuide, setShowLabelCapture, setSwapEntry, showBarcodeScanner, showCopyDayDialog, showFoodFormatGuide, swapEntry }) {
  return (
    <>
      {/* Copy a previous day forward */}
      <Dialog open={showCopyDayDialog} onOpenChange={setShowCopyDayDialog}>
        <DialogContent className="max-w-lg flex flex-col">
          <DialogHeader>
            <DialogTitle>Copy a day to {selectedDate}</DialogTitle>
            <DialogDescription>
              Pick a day, then pick what carries over. Nothing is moved — the source day keeps its entries.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="copy-from">Copy from</Label>
            <Input
              id="copy-from"
              type="date"
              value={copyFromDate}
              max={getTodayString()}
              onChange={(e) => { setCopyFromDate(e.target.value); setCopySelection({}); }}
              className="mt-1"
            />
          </div>

          {copySourceEntries.length === 0 ? (
            <p className="text-xs text-ink-muted">Nothing was logged on {copyFromDate}.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="section-label">{copySourceEntries.length} entries</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand underline"
                    onClick={() => setCopySelection(Object.fromEntries(copySourceEntries.map((e) => [e.id, true])))}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-muted underline"
                    onClick={() => setCopySelection({})}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto border border-charcoal-border rounded-lg divide-y divide-charcoal-border">
                {copySourceEntries.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-charcoal-elevated">
                    <input
                      type="checkbox"
                      checked={!!copySelection[entry.id]}
                      onChange={(e) => setCopySelection((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                      className="shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">{entry.food_name}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {entry.meal_type} · {formatEntryServing(entry)}
                      </span>
                    </span>
                    <span className="font-technical text-xs font-semibold text-gold shrink-0">
                      {Math.round(entry.calories || 0)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <Button
            onClick={() => copyDayMutation.mutate(copySourceEntries.filter((e) => copySelection[e.id]))}
            disabled={
              copyDayMutation.isPending ||
              !copySourceEntries.some((e) => copySelection[e.id])
            }
          >
            {copyDayMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Copying…</>
            ) : (
              <>Copy {copySourceEntries.filter((e) => copySelection[e.id]).length} to {selectedDate}</>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Food CSV Format Guide */}
      <Dialog open={showFoodFormatGuide} onOpenChange={setShowFoodFormatGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Food CSV Import Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted mb-3">
            Save a <code className="text-xs bg-charcoal-elevated px-1 rounded">.csv</code> file with these columns, then use the Import CSV button to add foods to My Foods.
          </p>
          <pre className="bg-charcoal-surface rounded-lg p-3 text-xs overflow-auto text-ink-muted border border-charcoal-border text-left">{`food_name,calories,protein_grams,carbs_grams,fats_grams,serving_unit
Chicken Breast,165,31,0,3.6,100g
Greek Yogurt,59,10,3.6,0.4,100g
Oats,389,17,66,7,100g`}</pre>
          <div className="text-xs text-ink-muted space-y-1 mt-2">
            <p><span className="font-semibold">food_name</span> and <span className="font-semibold">calories</span> are required. All other columns are optional.</p>
            <p><span className="font-semibold">serving_unit</span>: any label like <code>100g</code>, <code>cup</code>, <code>serving</code> (defaults to "serving").</p>
            <p>Macros are per the serving size you specify.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Swap a planned food out for something already in the fridge */}
      <SwapFoodDialog
        open={!!swapEntry}
        onOpenChange={(o) => { if (!o) setSwapEntry(null); }}
        entry={swapEntry}
        customFoods={customFoods}
        swaps={dayContext?.foodSwaps?.[selectedDate] || {}}
        onSwap={runSwap}
        onRevert={revertSwap}
        pending={foodSwap.isPending}
      />

      {/* Barcode scanner — full-screen overlay, mobile only */}
      <BarcodeScanner
        open={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onFoodFound={(food) => {
          setShowBarcodeScanner(false);
          selectFood(food);
        }}
        onNotFound={(barcode) => {
          setShowBarcodeScanner(false);
          // An empty barcode means nothing was ever scanned or looked up
          // (e.g. "Enter manually" from the camera-unavailable error state,
          // which shares this same handler) — don't tell the athlete their
          // product wasn't found when no lookup happened.
          if (barcode) {
            setSearchQuery(barcode);
            toast.info("Product not found. Try searching manually.");
          }
        }}
        onScanLabel={() => {
          setShowBarcodeScanner(false);
          resetLabelCapture();
          setShowLabelCapture(true);
        }}
      />
    </>
  );
}
