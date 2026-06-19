import * as React from "react";

const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => {
  const variants = {
    /* design system variants */
    volt:    "bg-brand/[8%] text-brand border border-brand/20",
    green:   "bg-leaf/10 text-leaf border border-leaf/20",
    amber:   "bg-warn/10 text-warn border border-warn/20",
    red:     "bg-bad/10 text-bad border border-bad/[15%]",
    slate:   "bg-charcoal-surface2 text-ink-muted border border-charcoal-border",
    /* legacy variants */
    default:     "bg-charcoal-surface2 text-ink-muted border border-charcoal-border",
    secondary:   "bg-charcoal-surface2 text-ink-muted border border-charcoal-border",
    destructive: "bg-bad/10 text-ink border-transparent",
    outline:     "text-ink border border-charcoal-border",
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
