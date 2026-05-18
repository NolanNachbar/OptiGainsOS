import * as React from "react";

const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => {
  const variants = {
    /* design system variants */
    volt:    "bg-[rgba(204,255,0,0.08)] text-[#ccff00] border border-[rgba(204,255,0,0.2)]",
    green:   "bg-[rgba(34,197,94,0.1)] text-[#4ade80] border border-[rgba(34,197,94,0.2)]",
    amber:   "bg-[rgba(245,158,11,0.1)] text-[#fbbf24] border border-[rgba(245,158,11,0.2)]",
    red:     "bg-[rgba(239,68,68,0.1)] text-[#f87171] border border-[rgba(239,68,68,0.15)]",
    slate:   "bg-[#202020] text-[#a0a0a0] border border-[#2a2a2a]",
    /* legacy variants */
    default:     "bg-[#202020] text-[#a0a0a0] border border-[#2a2a2a]",
    secondary:   "bg-[#202020] text-[#a0a0a0] border border-[#2a2a2a]",
    destructive: "bg-[rgba(239,68,68,0.1)] text-white border-transparent",
    outline:     "text-white border border-[#2a2a2a]",
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
