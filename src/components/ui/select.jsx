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
      className={`flex h-[38px] w-full items-center justify-between rounded-[10px] border border-transparent bg-[#151515] px-3 text-[14px] text-white placeholder:text-[#555555] focus:outline-none focus:border-[#ccff00] focus:shadow-[0_0_0_3px_rgba(204,255,0,0.1)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10001]" onClick={() => setOpen(false)} />
      <div
        className={`fixed z-[10002] max-h-60 overflow-auto rounded-[10px] border border-[#2a2a2a] bg-[#1a1a1a] p-1 ${className}`}
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
      className={`relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-[13px] outline-none text-[#a0a0a0] hover:bg-[#242424] hover:text-white ${selectedValue === value ? 'bg-[rgba(204,255,0,0.08)] text-[#ccff00]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
