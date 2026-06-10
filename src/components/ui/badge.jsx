import * as React from "react";

const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => {
  const variants = {
    /* design system variants */
    volt:    "bg-brand/[8%] text-brand border border-brand/20",
    green:   "bg-leaf/10 text-leaf border border-leaf/20",
    amber:   "bg-warn/10 text-warn border border-warn/20",
    red:     "bg-bad/10 text-bad border border-bad/[15%]",
    slate:   "bg-white/[0.06] text-ink-muted border border-white/10",
    /* legacy variants */
    default:     "bg-white/[0.06] text-ink-muted border border-white/10",
    secondary:   "bg-white/[0.06] text-ink-muted border border-white/10",
    destructive: "bg-bad/10 text-ink border-transparent",
    outline:     "text-ink border border-white/10",
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
