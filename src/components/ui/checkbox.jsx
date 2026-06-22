import * as React from "react";
import { Check } from "lucide-react";

// `variant` controls the CHECKED affordance:
//   coral      -> coral fill. Reserved for a checkbox that is itself a genuine
//                 ACTION/decision (opt-in, accept, the thing the user is choosing).
//   neutral    -> structural charcoal-elevated fill with neutral ink Check.
//                 Use for passive "included / in this set" multi-select rows
//                 (e.g. MealTemplates ingredient rows) so coral is NOT spent as a
//                 resting selected-state bullet. Color is data, not a list marker.
const CHECKED_VARIANTS = {
  coral:   "bg-brand border-brand text-black",
  neutral: "bg-charcoal-elevated border-charcoal-border text-ink",
};

const Checkbox = React.forwardRef(({ className = "", checked, onCheckedChange, variant = "coral", ...props }, ref) => {
  const checkedClass = CHECKED_VARIANTS[variant] || CHECKED_VARIANTS.coral;
  return (
    <button
      ref={ref}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={`peer h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-[background-color,border-color,color] duration-200 ease-[var(--ease)] active:scale-95 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? checkedClass : 'bg-transparent border-charcoal-border'} ${className}`}
      {...props}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
