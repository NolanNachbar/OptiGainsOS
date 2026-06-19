import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DialogContext = React.createContext(null);

const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-[10000]">
        {/* Full-screen scrim — covers the dock too (a modal owns the screen). */}
        <div
          className="fixed inset-0 bg-black/75"
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

const DialogContent = React.forwardRef(({ className = "", hideClose = false, children, ...props }, ref) => {
  const ctx = React.useContext(DialogContext);
  const hasCustomPadding = className.includes("p-0") || className.includes("px-") || className.includes("py-");
  return (
    <div
      ref={ref}
      className={`relative z-50 glass-sheet text-ink w-full max-w-lg overflow-y-auto
        rounded-t-2xl rounded-b-none border-b-0
        md:rounded-xl md:border-b md:mx-auto
        sheet-rise md:rise-in
        ${hasCustomPadding ? "" : "p-6"} ${className}`}
      style={{
        maxHeight: 'calc(100dvh - var(--layout-header-height, 0px) - 1rem)',
        paddingBottom: hasCustomPadding ? undefined : 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
      {...props}
    >
      {/* Mobile drag-handle affordance */}
      <div className="md:hidden mx-auto -mt-2 mb-3 h-1 w-9 rounded-full bg-ink-muted/30" aria-hidden="true" />
      {ctx?.onOpenChange && !hideClose && (
        <button
          onClick={() => ctx.onOpenChange(false)}
          className="absolute right-2 top-2 h-11 w-11 flex items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink hover:bg-white/[0.06] focus:outline-none"
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
    className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`}
    {...props}
  />
);

const DialogTitle = React.forwardRef(({ className = "", ...props }, ref) => (
  <h2
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className}`}
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
