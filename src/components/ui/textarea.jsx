import * as React from "react";

// Documented height tokens so capture surfaces request a height THROUGH the
// primitive instead of an arbitrary per-call `min-h-[...]` override:
//   default -> compact single-thought field
//   capture -> taller free-write surface (QuickCapture / notes / journaling)
const SIZE_HEIGHTS = {
  default: "min-h-[80px]",
  capture: "min-h-[120px]",
};

// `focusHue` (system extension): teal is the default system-wide focus
// affordance for free-text surfaces (matches the global :focus-visible outline).
// A page that OWNS a hue (e.g. Mind = violet) can thread its hue token name so
// the focus ring speaks that surface's identity instead of borrowing teal. The
// value is a `--hue-*-rgb` token key (without the `--hue-`/`-rgb` affixes), e.g.
// "teal" | "violet"; it must map to a `--hue-<name>-rgb` var declared in index.css.
const Textarea = React.forwardRef(({ className = "", size = "default", focusHue = "teal", ...props }, ref) => {
  const heightClass = SIZE_HEIGHTS[size] || SIZE_HEIGHTS.default;
  const hue = `var(--hue-${focusHue}-rgb)`;
  return (
    <textarea
      style={{ "--focus-hue": hue }}
      className={`flex ${heightClass} w-full resize-none rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 py-2 text-[14px] text-ink shadow-[inset_0_1px_0_var(--glass-specular)] placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-[rgb(var(--focus-hue)/0.45)] focus-visible:shadow-[inset_0_1px_0_var(--glass-specular),0_0_0_3px_rgb(var(--focus-hue)/0.10)] transition-[border-color,box-shadow] duration-[180ms] ease-[var(--ease)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
