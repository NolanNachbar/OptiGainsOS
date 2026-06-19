import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-11 w-full rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 text-[14px] font-semibold text-ink tabular-nums shadow-[inset_0_1px_0_var(--glass-specular)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-[rgb(var(--hue-teal-rgb)/0.45)] focus-visible:shadow-[inset_0_1px_0_var(--glass-specular),0_0_0_3px_rgb(var(--hue-teal-rgb)/0.10)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
