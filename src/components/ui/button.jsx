import * as React from "react";

const Button = React.forwardRef(({
  className = "",
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer transition-all duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:opacity-90 whitespace-nowrap tracking-[-0.01em]";

  const variants = {
    /* 4-tier design system */
    volt:        "bg-brand text-black rounded-md hover:bg-brand/90 hover:shadow-neon",
    energy:      "bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-md hover:opacity-95 shadow-energy",
    dark:        "bg-charcoal-surface2 text-white border border-charcoal-border rounded-md hover:bg-charcoal-elevated",
    ghost:       "bg-transparent text-brand border border-brand/25 rounded-md hover:bg-brand/[8%]",
    dim:         "bg-transparent text-slate-400 border border-charcoal-border rounded-md hover:bg-charcoal-surface2 hover:text-white",
    /* utility / legacy variants */
    default:     "bg-charcoal-surface2 text-white border border-charcoal-border rounded-md hover:bg-charcoal-elevated",
    primary:     "bg-brand text-black rounded-md hover:bg-brand/90",
    ai:          "bg-charcoal-surface2 text-white border border-charcoal-border rounded-md hover:bg-charcoal-elevated",
    destructive: "bg-transparent text-[#f87171] border border-[rgba(239,68,68,0.35)] rounded-md hover:bg-[rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.6)]",
    outline:     "border border-charcoal-border bg-transparent text-slate-400 rounded-md hover:bg-charcoal-surface2 hover:text-white",
    secondary:   "bg-charcoal-surface2 text-slate-400 rounded-md hover:bg-charcoal-elevated hover:text-white",
    link:        "text-brand underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 text-[13.5px]",
    sm:      "h-[30px] px-3 text-[12.5px]",
    lg:      "h-[42px] px-[22px] text-[15px]",
    icon:    "h-9 w-9",
  };

  const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      className: `${combinedClassName} ${children.props.className || ""}`,
      ref: ref,
    });
  }

  return (
    <button
      ref={ref}
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";

export { Button };
