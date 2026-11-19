import { ChevronLeft, ChevronRight, Search, Camera, Plus, UtensilsCrossed } from "lucide-react";
import { format } from "date-fns";
import { getTodayString } from "@/utils/dateUtils";
import { Button } from "@/components/ui/button";

// Extracted from FoodTracker.jsx (no behavior change).
export default function TrackerDateBar({ changeDate, isViewingToday, resetForm, selectedDate, setMealItems, setMealTemplateType, setSelectedDate, setShowAddDialog, setShowBarcodeScanner, setShowNewMealDialog, showAddDialog }) {
  return (
    <>
      {/* Date navigation + action bar */}
      <div className="sticky top-[var(--layout-header-height,0px)] z-20 border-b border-charcoal-border bg-charcoal px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => changeDate(-1)}
            aria-label="Previous day"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-ink-muted hover:text-ink hover:bg-charcoal-surface transition-colors duration-200 [transition-timing-function:var(--ease)]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* Styled date control: the native picker is the invisible top layer
              (still tappable across the whole pill), overlaid by a Manrope +
              tabular-nums label so no bright UA calendar box leaks onto the
              dark field. */}
          <label className="relative flex items-center h-11 px-3 glass-inset cursor-pointer">
            <span className="font-technical tabular-nums text-body font-semibold text-ink">
              {format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Select date"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
          <button
            onClick={() => changeDate(1)}
            aria-label="Next day"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-ink-muted hover:text-ink hover:bg-charcoal-surface transition-colors duration-200 [transition-timing-function:var(--ease)]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isViewingToday && (
            <button
              onClick={() => setSelectedDate(getTodayString())}
              className="text-caption font-semibold tracking-wide text-ink-secondary hover:text-ink glass-inset px-2.5 h-11 ml-1 flex items-center transition-colors duration-200 [transition-timing-function:var(--ease)]"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Header search/barcode — one tap each, every breakpoint. Search opens
              the Add dialog straight onto its search field (already
              auto-focused there); barcode opens the same dialog underneath the
              full-screen scanner so a found product lands in a visible form.
              Hidden while the Add dialog is open so they don't collide (same
              aria-labels) with that dialog's own search/scan controls. */}
          {!showAddDialog && (
            <>
              <button
                type="button"
                onClick={() => { resetForm(); setShowAddDialog(true); }}
                aria-label="Search food"
                title="Search food"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => { resetForm(); setShowAddDialog(true); setShowBarcodeScanner(true); }}
                aria-label="Scan barcode"
                title="Scan a barcode"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                <Camera className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
          {/* Coral discipline: the sticky-bar 'Add Food' is desktop-only. On
              mobile it lives behind the dock's raised '+' -> Log Food
              (QuickAddMenu.jsx), which navigates to
              /food-tracker?addFood=true and opens this same dialog (see the
              addFood searchParams effect above) -- this page no longer
              renders its own FAB. It used to (a bottom-right coral '+'), but
              the dock's own unconditional '+' made that a second, redundant
              Add-Food affordance showing on screen at once (r5 review,
              major). */}
          <Button
            variant="volt"
            size="lg"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="hidden lg:inline-flex"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Food
          </Button>

          {/* New Meal is a desktop affordance — on mobile it lives in the More
              sheet (Templates, recipes & ideas) so the sticky bar stays compact
              and the dock's '+' -> Log Food owns the one Add path. */}
          <Button
            variant="dim"
            size="sm"
            onClick={() => { resetForm(); setMealItems([]); setMealTemplateType("lunch"); setShowNewMealDialog(true); }}
            className="hidden lg:inline-flex"
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            New Meal
          </Button>
        </div>
      </div>
    </>
  );
}
