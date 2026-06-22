import * as React from "react";

// Documented height tokens so capture surfaces request a height THROUGH the
// primitive instead of an arbitrary per-call `min-h-[...]` override:
//   default -> compact single-thought field
//   capture -> taller free-write surface (QuickCapture / notes / journaling)
const SIZE_HEIGHTS = {
  default: "min-h-[80px]",
  capture: "min-h-[120px]",
};

// Focus is the neutral glass-edge ring shared by Input/Select (one focus
// material across all field primitives), not a per-surface hue tint.
// `focusHue` is accepted-and-ignored: callers (QuickCapture) still thread it,
// but the textarea no longer tints focus by hue, so it must not reach the DOM.
const Textarea = React.forwardRef(({ className = "", size = "default", focusHue, ...props }, ref) => {
  const heightClass = SIZE_HEIGHTS[size] || SIZE_HEIGHTS.default;
  return (
    <textarea
      className={`flex ${heightClass} w-full resize-none rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 px-3.5 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-charcoal-border focus-visible:shadow-[0_0_0_3px_var(--glass-edge)] transition-[border-color,box-shadow] duration-[180ms] ease-[var(--ease)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
