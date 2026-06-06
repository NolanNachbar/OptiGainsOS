import * as React from "react";

const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => {
  const variants = {
    /* design system variants */
    volt:    "bg-brand/[8%] text-brand border border-brand/20",
    green:   "bg-[rgba(34,197,94,0.1)] text-[#4ade80] border border-[rgba(34,197,94,0.2)]",
    amber:   "bg-[rgba(245,158,11,0.1)] text-[#fbbf24] border border-[rgba(245,158,11,0.2)]",
    red:     "bg-[rgba(239,68,68,0.1)] text-[#f87171] border border-[rgba(239,68,68,0.15)]",
    slate:   "bg-charcoal-elevated text-slate-400 border border-charcoal-border",
    /* legacy variants */
    default:     "bg-charcoal-elevated text-slate-400 border border-charcoal-border",
    secondary:   "bg-charcoal-elevated text-slate-400 border border-charcoal-border",
    destructive: "bg-[rgba(239,68,68,0.1)] text-white border-transparent",
    outline:     "text-white border border-charcoal-border",
  };

  return (
    <div
      ref={ref}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
