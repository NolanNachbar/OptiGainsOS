import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DialogContext = React.createContext(null);

const Dialog = ({ open, onOpenChange, children }) => {
  // Scrim fade-in: the sheet rises over .30s (sheetRise) but the backdrop used to
  // slam in opaque on the same frame, so the entrance read as two events. Drive the
  // scrim opacity from a mount flag and transition it on the system easing so the
  // backdrop fades in (.18s) while the sheet rises — one coordinated entrance.
  // Kept inline (no keyframe) because dialog.jsx is the only shared file in scope.
  const [scrimIn, setScrimIn] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setScrimIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setScrimIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      {/* z-[10000] root has no transform, so the fixed scrim below resolves its
          containing block to the viewport (portaled to body) — true inset-0 at
          390px with no ancestor transform creating a containing block. */}
      <div className="fixed inset-0 z-[10000]">
        {/* Full-screen scrim — covers the dock too (a modal owns the screen). */}
        <div
          className="fixed inset-0 bg-black/75"
          style={{
            opacity: scrimIn ? 1 : 0,
            transition: 'opacity .18s var(--ease)',
          }}
          onClick={() => onOpenChange(false)}
        />
        {/* Positioner: bottom sheet on mobile, centered dialog on desktop. */}
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
const DialogContent = React.forwardRef(({ className = "", hideClose = false, sheetMinHeight = "min-h-[40dvh]", children, ...props }, ref) => {
  const ctx = React.useContext(DialogContext);
  const hasCustomPadding = className.includes("p-0") || className.includes("px-") || className.includes("py-");
  return (
    <div
      ref={ref}
      className={`relative z-50 glass-sheet text-ink w-full max-w-lg overflow-y-auto
        rounded-t-2xl rounded-b-none border-b-0
        md:rounded-xl md:border-b md:mx-auto
        sheet-rise md:rise-in
        ${sheetMinHeight} md:min-h-0
        ${hasCustomPadding ? "" : "p-6"} ${className}`}
      style={{
        maxHeight: 'calc(100dvh - var(--layout-header-height, 0px) - 1rem)',
        paddingBottom: hasCustomPadding ? undefined : 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
      {...props}
    >
      {/* Mobile drag-handle pill — a DELIBERATE non-interactive signifier, not a
          live drag-to-dismiss control. It marks the surface as a dismissible
          bottom sheet (tap-scrim / Close-X / Cancel all dismiss); drag-to-dismiss
          is intentionally not wired (a pointer-gesture dismiss is out of scope for
          this shared primitive and would need its own swipe/threshold handling).
          aria-hidden so AT users aren't offered a phantom affordance. */}
      <div className="md:hidden mx-auto -mt-2 mb-3 h-1 w-9 rounded-full bg-ink-muted/30" aria-hidden="true" />
      {ctx?.onOpenChange && !hideClose && (
        <button
          onClick={() => ctx.onOpenChange(false)}
          className="absolute right-2 top-2 h-11 w-11 flex items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink hover:bg-[var(--glass-edge)] focus:outline-none"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
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
    className={`text-[13px] text-ink-muted ${className}`}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription };
