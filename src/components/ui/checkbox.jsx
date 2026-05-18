import * as React from "react";
import { Check } from "lucide-react";

const Checkbox = React.forwardRef(({ className = "", checked, onCheckedChange, ...props }, ref) => {
  return (
    <button
      ref={ref}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={`peer h-4 w-4 shrink-0 rounded-md border focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[#ccff00] border-[#ccff00] text-black' : 'bg-transparent border-[#2a2a2a]'} ${className}`}
      {...props}
    >
      {checked && <Check className="h-4 w-4" />}
    </button>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
