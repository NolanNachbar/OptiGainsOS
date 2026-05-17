import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DialogContext = React.createContext(null);

const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 top-[var(--layout-header-height,0px)] md:bottom-0 z-[10000]" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <div
          className="fixed inset-0 top-[var(--layout-header-height,0px)] md:bottom-0 bg-black/50 dark:bg-black/60"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
          onClick={() => onOpenChange(false)}
        />
        <div className="fixed inset-0 top-[var(--layout-header-height,0px)] md:bottom-0 flex items-center justify-center p-2 sm:p-4 pointer-events-none" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="pointer-events-auto">
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
      className={`relative z-50 bg-white text-slate-900 rounded-lg shadow-lg w-full max-w-lg md:max-h-[calc(100vh-var(--layout-header-height,0px)-1rem)] dark:bg-slate-800 dark:text-slate-50 ${hasCustomPadding ? "" : "p-6"} ${className}`}
      style={{ maxHeight: 'calc(100vh - var(--layout-header-height, 0px) - 56px - env(safe-area-inset-bottom, 0px) - 1rem)' }}
      {...props}
    >
      {ctx?.onOpenChange && !hideClose && (
        <button
          onClick={() => ctx.onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
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
    className={`text-sm text-slate-500 ${className}`}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription };
