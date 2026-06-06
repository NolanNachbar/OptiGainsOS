import * as React from "react";
import { Check } from "lucide-react";

const Checkbox = React.forwardRef(({ className = "", checked, onCheckedChange, ...props }, ref) => {
  return (
    <button
      ref={ref}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={`peer h-4 w-4 shrink-0 rounded-md border flex items-center justify-center focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-brand border-brand text-black' : 'bg-transparent border-charcoal-border'} ${className}`}
      {...props}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
