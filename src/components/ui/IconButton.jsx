import * as React from "react";

// Shared icon-button primitive. Hand-rolled icon buttons (meal-card actions,
// row affordances) kept re-tripping the same two findings on every surface:
// sub-44px touch targets and a too-dim default glyph color. This primitive
// enforces both in one place so those A11Y regressions stop recurring:
//   - 44px minimum touch target (the WCAG/Apple thumb-target floor)
//   - the glyph renders at a legible ≥18px size
//   - default glyph color is text-ink-secondary (0.72), the AA-safe quiet tier,
//     not text-ink-muted (0.50) which falls under 4.5:1 on most surfaces
//
// It is chrome-free by default (transparent fill, no border) so it drops into a
// card/row without painting a button box; pass a `variant` for a glass/coral
// fill when the action needs more weight.
//
// `icon` is the lucide (or any) icon COMPONENT, not an element — IconButton
// sizes it via `glyph` (default 18px) so the ≥18px floor can't be undercut by a
// caller passing w-3 h-3. `label` is required: an icon-only control must carry
// an accessible name (aria-label).
const variants = {
  // chrome-free affordance — inherits the secondary ink voice
  plain: "bg-transparent",
  // frosted glass fill for actions that need a visible affordance box
  glass:
    "bg-[var(--glass-bg)] border border-charcoal-border [box-shadow:inset_0_1px_0_var(--glass-specular)] hover:bg-[var(--glass-edge)]",
};

const IconButton = React.forwardRef(
  (
    {
      icon: Icon,
      label,
      glyph = 18,
      variant = "plain",
      className = "",
      strokeWidth = 2,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] rounded-xl " +
      "text-ink-secondary hover:text-ink transition-colors duration-200 " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
      "disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`${base} ${variants[variant] || variants.plain} ${className}`}
        {...props}
      >
        {Icon && (
          <Icon
            style={{ width: glyph, height: glyph }}
            strokeWidth={strokeWidth}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";

export { IconButton };
