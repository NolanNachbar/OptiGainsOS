import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-[38px] w-full rounded-xl border border-transparent bg-[#151515] px-3 text-[14px] text-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#555555] focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgb(var(--color-brand-rgb)_/_0.1)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
