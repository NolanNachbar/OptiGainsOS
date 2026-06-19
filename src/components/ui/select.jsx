import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

const SelectContext = React.createContext({});

const Select = ({ value, onValueChange, children }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const labelsRef = React.useRef({});

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, triggerRef, labelsRef }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef(({ className = "", children, ...props }, ref) => {
  const { setOpen, open, triggerRef } = React.useContext(SelectContext);

  const mergedRef = React.useCallback(
    (node) => {
      triggerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, triggerRef]
  );

  return (
    <button
      type="button"
      ref={mergedRef}
      onClick={() => setOpen(!open)}
      className={`flex h-11 w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] px-3.5 text-[14px] font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-[rgba(var(--hue-teal-rgb)/0.45)] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(var(--hue-teal-rgb)/0.10)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = ({ placeholder, children }) => {
  const { value, labelsRef } = React.useContext(SelectContext);
  if (children) {
    return <span>{children}</span>;
  }
  const label = value ? (labelsRef?.current[value] ?? value) : null;
  return <span>{label || placeholder}</span>;
};

const SelectContent = ({ className = "", children, ...props }) => {
  const { open, setOpen, triggerRef } = React.useContext(SelectContext);
  const [style, setStyle] = React.useState({});

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 240;
      const flipUp = spaceBelow < dropdownHeight && rect.top > spaceBelow;

      if (flipUp) {
        setStyle({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: rect.width,
        });
      } else {
        setStyle({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, triggerRef]);

  // Always render items hidden so SelectItem can register labels into labelsRef
  if (!open) {
    return <div className="hidden" aria-hidden="true">{children}</div>;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10001]" onClick={() => setOpen(false)} />
      <div
        className={`glass-elevated fixed z-[10002] max-h-60 overflow-auto rounded-xl p-1.5 ${className}`}
        style={style}
        {...props}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

const SelectItem = ({ value, children, className = "", ...props }) => {
  const { onValueChange, setOpen, value: selectedValue, labelsRef } = React.useContext(SelectContext);

  // Register the label so SelectValue can display it after the dropdown closes
  if (labelsRef && typeof children === 'string') {
    labelsRef.current[value] = children;
  }

  return (
    <div
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      className={`relative flex min-h-[44px] cursor-pointer select-none items-center rounded-md px-2 py-2.5 text-[13px] outline-none text-ink-muted hover:bg-charcoal-elevated hover:text-ink ${selectedValue === value ? 'bg-brand/[8%] text-brand' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
