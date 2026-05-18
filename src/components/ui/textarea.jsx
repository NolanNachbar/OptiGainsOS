import * as React from "react";

const Textarea = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-[10px] border border-transparent bg-[#151515] px-3 py-2 text-[14px] text-white placeholder:text-[#555555] focus-visible:outline-none focus-visible:border-[#ccff00] focus-visible:shadow-[0_0_0_3px_rgba(204,255,0,0.1)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
