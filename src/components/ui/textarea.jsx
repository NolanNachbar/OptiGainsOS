import * as React from "react";

const Textarea = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <textarea
      className={`flex min-h-[80px] w-full resize-none rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 py-2 text-[14px] text-ink shadow-[inset_0_1px_0_var(--glass-specular)] placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-[rgb(var(--hue-teal-rgb)/0.45)] focus-visible:shadow-[inset_0_1px_0_var(--glass-specular),0_0_0_3px_rgb(var(--hue-teal-rgb)/0.10)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
