import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-xl border border-transparent bg-[#151515] px-3 py-2 text-sm text-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#555555] focus-visible:outline-none focus-visible:border-[#ccff00] focus-visible:shadow-[0_0_0_3px_rgba(204,255,0,0.1)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
