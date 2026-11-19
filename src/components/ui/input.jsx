import * as React from "react";
import { cn } from "./system/cva";

// 44px control, tabular numerals, quiet focus ring (no hue).
const inputClass =
  "flex h-11 w-full rounded-control border border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 text-body font-semibold tabular-nums text-ink " +
  "placeholder:text-ink-muted placeholder:font-normal file:border-0 file:bg-transparent file:text-body file:font-medium " +
  "focus-visible:outline-none focus-visible:border-charcoal-border focus-visible:shadow-[0_0_0_3px_var(--glass-edge)] " +
  "aria-[invalid=true]:border-bad/70 transition-[border-color,box-shadow] duration-base ease-out disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => (
  <input type={type} className={cn(inputClass, className)} ref={ref} {...props} />
));
Input.displayName = "Input";

export { Input };
