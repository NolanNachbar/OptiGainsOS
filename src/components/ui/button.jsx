import * as React from "react";

const Button = React.forwardRef(({
  className = "",
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer transition-all duration-200 ease-[cubic-bezier(.2,.7,.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:opacity-90 whitespace-nowrap tracking-[-0.01em]";

  // Coral is THE action color: solid-action variants share the og-cta
  // gradient; everything secondary is frosted-glass ghost material.
  const coral = "text-[var(--color-action-dark)] rounded-xl font-extrabold " +
    "bg-gradient-to-br from-[var(--brand-bright)] to-[var(--color-brand)] " +
    "shadow-neon [box-shadow:0_8px_22px_rgba(var(--color-brand-rgb)/0.28),inset_0_1px_0_rgba(255,255,255,0.4)]";
  const glassGhost = "bg-white/[0.06] text-ink border border-white/10 rounded-xl " +
    "[box-shadow:inset_0_1px_0_rgba(255,255,255,0.09)] hover:bg-white/[0.09]";
  // Coral-tinted quiet affordance. Reserved for genuine secondary ACTIONS that
  // must still read coral (never for Cancel/Back/neutral). Opt in explicitly —
  // plain `ghost` is neutral glass so accidental coral decoration can't drift in.
  const coralGhost = "bg-brand/10 text-brand border border-brand/20 rounded-xl hover:bg-brand/15";

  const variants = {
    /* design-system tiers */
    volt:        coral,
    energy:      coral,
    dark:        glassGhost,
    ghost:       glassGhost,
    coralGhost:  coralGhost,
    dim:         "bg-transparent text-ink-muted border border-white/10 rounded-xl hover:bg-white/[0.06] hover:text-ink",
    /* utility / legacy variants */
    default:     glassGhost,
    primary:     coral,
    ai:          glassGhost,
    destructive: "bg-bad/12 text-bad border border-bad/45 rounded-xl font-bold hover:bg-bad/18 hover:border-bad/70",
    outline:     "border border-white/10 bg-transparent text-ink-muted rounded-xl hover:bg-white/[0.06] hover:text-ink",
    secondary:   "bg-white/[0.06] text-ink-muted rounded-xl hover:bg-white/[0.09] hover:text-ink",
    link:        "text-brand underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 text-[13.5px]",
    sm:      "h-[30px] px-3 text-[12.5px]",
    lg:      "h-11 px-[22px] text-[15px]",
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
