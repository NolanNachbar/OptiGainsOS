import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus } from "lucide-react";

// Mobile-friendly numeric field: -/+ steppers flanking a bare number input.
// Steppers are neutral-glass icon buttons (>=44px); they reuse the same clamp
// the typed input does so all three entry paths stay in sync.
export default function NumberStepper({ value, onChange, min, max, ariaLabel }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-stretch gap-2 mt-1">
      <Button
        type="button"
        variant="dim"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="min-h-[44px] min-w-[44px] px-0 shrink-0"
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value) || min))}
        min={min}
        max={max}
        className="flex-1 min-h-[44px] text-center text-xl font-technical font-bold appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
      />
      <Button
        type="button"
        variant="dim"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="min-h-[44px] min-w-[44px] px-0 shrink-0"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}
