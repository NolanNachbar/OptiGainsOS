import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-[40px] w-full rounded-lg border border-white/10 bg-white/[0.05] px-3.5 text-[14px] font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-[rgba(var(--hue-teal-rgb)/0.45)] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(var(--hue-teal-rgb)/0.10)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
