import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DialogContext = React.createContext(null);

const Dialog = ({ open, onOpenChange, children }) => {
  // Scrim is OPAQUE on first paint (SYS-04-dialog). An earlier version drove the
  // scrim opacity from a rAF-set mount flag (start at 0, fade to 1), but that left a
  // captured first frame with the scrim at opacity:0 — the full-brightness page (and
  // its text) was legible beside the dialog before the fade ran. The coordinated
  // entrance is carried entirely by the sheet rise (sheet-rise / rise-in on
  // DialogContent); the backdrop simply needs to be there, so it paints opaque
  // immediately with no transition and no opacity:0 frame.
  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      {/* z-[10000] root has no transform, so the fixed scrim below resolves its
          containing block to the viewport (portaled to body), true inset-0 at
          390px with no ancestor transform creating a containing block. */}
      <div className="fixed inset-0 z-[10000]">
        {/* Full-screen scrim — covers the dock too (a modal owns the screen).
            Deepened to /85 + a brightness knockdown so bright coral CTAs behind
            the sheet (e.g. the Add chip in QuickWorkout) desaturate and read as
            inactive, the modal owns the only live action color. */}
        <div
          className="fixed inset-0 bg-black/85 backdrop-brightness-50"
          onClick={() => onOpenChange(false)}
        />
        {/* Positioner: bottom sheet on mobile (flush to the bottom edge), centered
            dialog on desktop. items-end keeps the sheet pinned to the bottom so it
            reads as an attached sheet, never a floating card with a dark gap below. */}
        <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-4 pointer-events-none">
          <div className="pointer-events-auto w-full md:w-auto">
            {React.Children.map(children, child =>
              child?.type === DialogContent ? child : null
            )}
          </div>
        </div>
      </div>
    </DialogContext.Provider>,
    document.body
  );
};

const DialogTrigger = ({ asChild, children, ...props }) => {
  if (asChild) {
    return <>{children}</>;
  }
  return <button {...props}>{children}</button>;
};

// `sheetMinHeight` (system extension): on mobile the sheet is a bottom sheet, so a
// content-sized short sheet would leave the lower viewport showing the page at full
// brightness through the gap above the scrim. Default `min-h-[40dvh]` guarantees the
// sheet (with --sheet-bg) covers a stable portion of the screen. Content-sparse
// callers (QuickCapture, ConfirmDialog, MealTemplates apply/save, Career, Mind
// AddBook) pass sheetMinHeight="" to opt out and let the sheet size to its content;
// the empty string drops the floor cleanly, leaving just `md:min-h-0` so the
// centered desktop dialog also stays content-sized.
//
// HARD MOBILE FLOOR: `sheetMinHeight=""` is an opt-out for the *tunable* default, but
// it must not let a flush bottom sheet collapse so short that page pixels show below
// it (pst-test-logger-1: a p-0 custom-padding sheet sizing to sparse content stopped
// well above the bottom edge, leaving the scrim's lower band over a still-bright page
// strip). The sheet is pinned to the bottom edge by the items-end positioner, so a
// guaranteed `max-md:min-h-[35dvh]` floor — independent of and below the 40dvh tunable
// default — keeps the rendered surface tall enough to reach the lower viewport while
// the paddingBottom inset still clears the home indicator. md:min-h-0 unsets it on
// desktop so the centered dialog stays content-sized.
const DialogContent = React.forwardRef(({ className = "", hideClose = false, sheetMinHeight = "min-h-[40dvh]", children, ...props }, ref) => {
  const ctx = React.useContext(DialogContext);
  const hasCustomPadding = className.includes("p-0") || className.includes("px-") || className.includes("py-");
  // Hard mobile occlusion floor (pst-test-logger-1): even when a caller opts the
  // tunable `sheetMinHeight` out (""), a flush bottom sheet must stay tall enough
  // that the scrim never bands over a still-bright page strip. Only force the floor
  // when the tunable default was dropped — when it's present (>= 40dvh) it already
  // covers more, so we leave it alone and avoid two competing min-height rules. The
  // 35dvh floor sits below the default so it's purely a backstop, and md:min-h-0
  // unsets it on desktop where the dialog is centered, not bottom-flush.
  const occlusionFloor = sheetMinHeight ? "" : "max-md:min-h-[35dvh]";
  return (
    <div
      ref={ref}
      className={`relative z-50 glass-sheet text-ink overflow-y-auto w-full max-w-lg
        md:mx-auto
        sheet-rise md:rise-in
        ${sheetMinHeight} ${occlusionFloor} md:min-h-0
        ${hasCustomPadding ? "" : "p-6"} ${className}
        max-md:!w-full max-md:!max-w-none
        max-md:!rounded-t-2xl max-md:!rounded-b-none max-md:!border-b-0
        md:rounded-xl md:border-b`}
      style={{
        maxHeight: 'calc(100dvh - var(--layout-header-height, 0px) - 1rem)',
        // The bottom safe-area gap is non-negotiable on a flush bottom sheet: without
        // it the action row (Start Fresh / Resume) clips against the home-indicator
        // edge. Default callers get full 1.5rem + inset. Custom-padding callers own
        // their interior padding, but we still reserve the inset below it so their
        // last row clears the edge. Inline paddingBottom wins over className padding.
        paddingBottom: hasCustomPadding
          ? 'env(safe-area-inset-bottom)'
          : 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
      {...props}
    >
      {/* Mobile drag-handle pill — a DELIBERATE non-interactive signifier, not a
          live drag-to-dismiss control. It marks the surface as a dismissible
          bottom sheet (tap-scrim / Close-X / Cancel all dismiss); drag-to-dismiss
          is intentionally not wired (a pointer-gesture dismiss is out of scope for
          this shared primitive and would need its own swipe/threshold handling).
          aria-hidden so AT users aren't offered a phantom affordance. */}
      <div className="md:hidden mx-auto -mt-2 mb-3 h-1 w-9 rounded-full bg-[var(--glass-edge-strong)]" aria-hidden="true" />
      {ctx?.onOpenChange && !hideClose && (
        <button
          onClick={() => ctx.onOpenChange(false)}
          className="absolute right-2 top-2 h-11 w-11 flex items-center justify-center rounded-full bg-[var(--glass-edge)] text-ink-secondary transition-colors hover:text-ink hover:bg-[var(--glass-edge)] focus:outline-none"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {children}
    </div>
  );
});
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className = "", ...props }) => (
  <div
    className={`flex flex-col space-y-1.5 text-left mb-4 pr-12 ${className}`}
    {...props}
  />
);

const DialogTitle = React.forwardRef(({ className = "", ...props }, ref) => (
  <h2
    ref={ref}
    className={`type-display text-lg leading-none ${className}`}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef(({ className = "", ...props }, ref) => (
  <p
    ref={ref}
    className={`text-sm text-ink-secondary leading-relaxed ${className}`}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription };
