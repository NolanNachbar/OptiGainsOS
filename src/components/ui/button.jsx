import * as React from "react";

const Button = React.forwardRef(({
  className = "",
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-200 ease-[var(--ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:opacity-90 whitespace-nowrap tracking-[-0.01em]";

  // Teal (var(--color-brand) #19C8A6) is THE single action color: a flat solid
  // fill, never a blend or ramp. Solid-action variants share this teal `action`
  // fill; everything secondary is frosted-glass ghost material.
  // Disabled action must stop reading as a live CTA: drop the fill, neon
  // shadow + specular and fall back to a neutral charcoal-surface fill with
  // muted ink (text-ink-muted clears ≥3:1 on charcoal-surface; text-ink-faint
  // measured ~1.77:1 = effectively invisible) so the disabled state is
  // unmistakably inert yet still legible.
  // Flat teal action — the Clean system bans ambient color glow ("Flat teal
  // fill ... everything else is neutral"). The lift is a NEUTRAL black drop
  // shadow on the elevation scale (matches --shadow-md), never a colored brand
  // bloom. Flat solid fill and no inset specular. Do NOT re-add
  // `shadow-neon` or any rgba(brand) drop shadow here — that is the halo.
  const action = "text-[var(--color-action-dark)] rounded-xl font-extrabold " +
    "bg-[var(--color-brand)] hover:bg-[var(--brand-bright)] " +
    "[box-shadow:0_6px_18px_rgba(0,0,0,0.42)] " +
    "disabled:bg-none disabled:shadow-none disabled:[box-shadow:none] disabled:bg-charcoal-surface disabled:border disabled:border-charcoal-border disabled:text-ink-muted disabled:opacity-100";
  // Token-driven glass so every secondary control re-tunes under html.light.
  // Edges/fills/specular ride --color-border / --glass-bg / --glass-specular
  // instead of raw white-alpha (which only reads on the dark field).
  const glassGhost = "bg-[var(--glass-bg)] text-ink border border-charcoal-border rounded-xl " +
    "hover:bg-[var(--glass-edge)]";
  // Teal-tinted quiet affordance. Reserved for genuine secondary ACTIONS that
  // must still read teal (var(--color-brand)) (never for Cancel/Back/neutral).
  // Opt in explicitly — plain `ghost` is neutral glass so accidental teal
  // decoration can't drift in. Mirror the solid action's inert disabled
  // treatment so a disabled actionGhost (e.g. QuickCapture empty-state Capture)
  // stops reading as a live CTA. The disabled state drops ALL teal tint (fill,
  // ink, border) and falls back to a neutral charcoal-surface fill with faint
  // ink + a neutral charcoal border, so an unarmed control is unmistakably
  // inert and never twins the primary action.
  const actionGhost = "bg-brand/10 text-brand border border-brand/20 rounded-xl hover:bg-brand/15 " +
    "disabled:bg-none disabled:bg-charcoal-surface disabled:text-ink-muted disabled:border-charcoal-border disabled:shadow-none disabled:opacity-100";

  // Destructive — `bad` is the canonical destructive token (blessed in
  // index.css, SYS-02). RESTING prominence is raised to coral-weight so a
  // delete out-weights the neutral glassGhost it sits beside in ConfirmDialog
  // instead of reading as a near-equal twin: bg-bad/18 fill + border-bad/70
  // edge by DEFAULT (not hover-only). Shared by CreateWorkout / ConfirmDialog /
  // RecipeBuilder via this one variant.
  const destructive = "bg-bad/18 text-bad border border-bad/70 rounded-xl font-bold " +
    "hover:bg-bad/24 hover:border-bad";

  // Plain/icon variant — chrome-free affordance (border-0, transparent fill,
  // no shadow baked in) so icon-only controls (TodayActions add, AddExerciseForm
  // close) stop bending a glass variant with `border-0 bg-transparent
  // shadow-none` override stacks. Inherits ink-muted voice; pair with size="icon"
  // (or a 44px className) for tap-target compliance.
  const plain = "border-0 bg-transparent shadow-none text-ink-muted rounded-xl hover:text-ink";

  // Prop NAMES are kept as-is for back-compat so call sites don't churn; they
  // all alias onto the renamed `action` / `actionGhost` style constants.
  const variants = {
    /* design-system tiers */
    volt:        action,   // canonical teal action variant
    energy:      action,   // DEPRECATED alias of `volt`; migrate callers to volt
    coral:       action,   // back-compat prop name; resolves to teal `action`
    dark:        glassGhost,
    ghost:       glassGhost,
    coralGhost:  actionGhost,  // back-compat prop name; resolves to `actionGhost`
    dim:         "bg-transparent text-ink-muted border border-charcoal-border rounded-xl hover:bg-[var(--glass-bg)] hover:text-ink",
    plain:       plain,   // chrome-free icon/affordance, no override stacks
    /* utility / legacy variants */
    default:     glassGhost,
    primary:     action,   // LEGACY alias of `volt`; migrate callers to volt
    ai:          glassGhost,
    destructive: destructive,
    outline:     "border border-charcoal-border bg-transparent text-ink-muted rounded-xl hover:bg-[var(--glass-bg)] hover:text-ink",
    secondary:   "bg-[var(--glass-bg)] text-ink-muted rounded-xl hover:bg-[var(--glass-edge)] hover:text-ink",
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
