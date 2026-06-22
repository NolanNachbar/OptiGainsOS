import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-11 w-full rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 text-[14px] font-semibold tabular-nums text-ink file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-charcoal-border focus-visible:shadow-[0_0_0_3px_var(--glass-edge)] transition-[border-color,box-shadow] duration-[180ms] ease-[var(--ease)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
