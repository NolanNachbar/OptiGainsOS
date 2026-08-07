// "Swap this planned food for one I already have." Picks the replacement; the
// grams are the optimizer's job, not the user's — the day is re-solved after the
// swap so everything else on the plan moves to make room.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, Check } from "lucide-react";
import { FOOD_CATALOG, servingGrams } from "@/config/dietPlans";

export default function SwapFoodDialog({ open, onOpenChange, entry, customFoods = [], swaps = {}, onSwap, onRevert, pending }) {
  const [q, setQ] = useState("");
  const original = entry?.food_name;
  // This row IS a swap-in if some earlier swap points at it — offer the plan's
  // own food back rather than making him remember what it displaced.
  const displaced = Object.keys(swaps || {}).find((k) => swaps[k] === original) || null;

  const options = useMemo(() => {
    const catalogNames = new Set(FOOD_CATALOG.map((f) => f.food));
    const rows = FOOD_CATALOG
      .filter((f) => f.food !== original)
      .map((f) => ({ name: f.food, sub: "plan food", ready: true }));

    // custom_foods carries duplicate rows for the same food (the log has always
    // let a name be re-added); show each name once.
    const seen = new Set();
    for (const f of customFoods) {
      const name = f.food_name;
      if (!name || name === original || catalogNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      const g = servingGrams(f);
      rows.push({
        name,
        // The optimizer portions in grams, so a food logged only as "1 serving"
        // has nothing to portion. Say so rather than hiding the food.
        sub: g ? `your food · ${Math.round(g)} g/serving` : "needs a gram weight before it can be swapped in",
        ready: !!g,
      });
    }
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .sort((a, b) => (b.ready - a.ready) || a.name.localeCompare(b.name));
  }, [customFoods, original, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowLeftRight className="w-4 h-4 text-brand" />
            Swap out {original}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-ink-muted -mt-2">
          Today only. The rest of the day re-fits around whatever you pick.
        </p>
        {displaced && (
          <button
            disabled={pending}
            onClick={() => onRevert(displaced)}
            className="mt-1 w-full text-left px-3 py-2 glass-inset text-[11px] font-semibold text-ink-secondary hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
          >
            Put {displaced} back
          </button>
        )}
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a food"
          className="mt-1"
        />
        <div className="max-h-[46vh] overflow-y-auto -mx-2 mt-1">
          {options.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-ink-muted">No food matches that.</p>
          )}
          {options.map((o) => (
            <button
              key={o.name}
              disabled={!o.ready || pending}
              onClick={() => onSwap(o.name)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b hairline transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                o.ready ? "hover:bg-charcoal-surface2/60" : "opacity-45 cursor-not-allowed"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold tracking-tight truncate text-ink">{o.name}</div>
                <div className="text-[10px] font-technical font-semibold text-ink-muted">{o.sub}</div>
              </div>
              {o.ready && <Check className="w-3.5 h-3.5 shrink-0 text-ink-faint" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
