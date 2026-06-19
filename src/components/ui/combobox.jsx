import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

const ComboboxContext = React.createContext({});

function Combobox({ value = "", onValueChange, items, excludeValue = "", placeholder = "", onKeyDown, children }) {
  const [open, setOpen] = React.useState(false);
  const [dropdownStyle, setDropdownStyle] = React.useState({});
  const triggerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    let rafId = null;
    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 240 && rect.top > spaceBelow;
      setDropdownStyle(
        flipUp
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
          : { top: rect.bottom + 4, left: rect.left, width: rect.width }
      );
    };
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };
    updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const handleChange = (e) => {
    const v = e.target.value;
    onValueChange?.(v);
    if (!open) setOpen(true);
  };

  const handleSelect = (name) => {
    onValueChange?.(name);
    setOpen(false);
  };

  const useItemsMode = Array.isArray(items);

  const query = (value ?? "").trim().toLowerCase();
  const filtered = useItemsMode
    ? [...new Set(items)].filter((n) => n !== excludeValue && (!query || n.toLowerCase().includes(query)))
    : [];

  const inputEl = (
    <div
      ref={triggerRef}
      className="flex h-11 w-full items-center rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 pr-3 shadow-[inset_0_1px_0_var(--glass-specular)] focus-within:border-charcoal-border focus-within:shadow-[inset_0_1px_0_var(--glass-specular),0_0_0_3px_var(--glass-edge)] transition-[border-color,box-shadow] duration-[180ms] ease-[var(--ease)]"
    >
      <input
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 self-stretch bg-transparent px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint"
      />
      <button type="button" aria-label="Toggle options" onClick={() => setOpen((o) => !o)} className="flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-muted">
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );

  if (useItemsMode) {
    return (
      <div className="relative">
        {inputEl}
        {open &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[10100]" onClick={() => setOpen(false)} />
              <div
                className="fixed z-[10200] max-h-60 overflow-auto rounded-xl border border-charcoal-border bg-charcoal-surface p-1"
                style={dropdownStyle}
              >
                {filtered.length > 0 ? (
                  filtered.map((name) => {
                    const selected = name.toLowerCase() === (value ?? "").toLowerCase();
                    return (
                      <div
                        key={name}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
                        className={`flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-[13px] hover:bg-charcoal-elevated hover:text-ink ${selected ? "bg-brand/[8%] text-brand" : "text-ink-muted"}`}
                      >
                        {selected ? <Check className="mr-2 h-4 w-4 shrink-0" /> : <span className="mr-6" />}
                        {name}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-2 py-1.5 text-[13px] text-ink-muted">
                    {query ? `No results for "${value}". Press Enter to use it.` : "No options available."}
                  </div>
                )}
              </div>
            </>,
            document.body
          )}
      </div>
    );
  }

  return (
    <ComboboxContext.Provider
      value={{ inputValue: value ?? "", open, setOpen, triggerRef, handleSelect, placeholder }}
    >
      <div className="relative">
        {inputEl}
        {children}
      </div>
    </ComboboxContext.Provider>
  );
}

const ComboboxContent = ({ className = "", children }) => {
  const { open, setOpen, triggerRef, inputValue } = React.useContext(ComboboxContext);
  const [style, setStyle] = React.useState({});

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < 240 && rect.top > spaceBelow;
    setStyle(
      flipUp
        ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
        : { top: rect.bottom + 4, left: rect.left, width: rect.width }
    );
  }, [open, triggerRef]);

  if (!open) return null;

  const query = inputValue.trim().toLowerCase();
  const filtered = React.Children.toArray(children).filter((child) => {
    if (!React.isValidElement(child)) return true;
    return !query || (child.props.value || "").toLowerCase().includes(query);
  });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10100]" onClick={() => setOpen(false)} />
      <div
        className={`fixed z-[10200] max-h-60 overflow-auto rounded-xl border border-charcoal-border bg-charcoal-surface p-1 ${className}`}
        style={style}
      >
        {filtered.length > 0 ? filtered : (
          <div className="px-2 py-1.5 text-[13px] text-ink-muted">
            {query ? `No results for "${inputValue}".` : "No options available."}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

const ComboboxItem = ({ value, children }) => {
  const { handleSelect, inputValue } = React.useContext(ComboboxContext);
  const selected = value.toLowerCase() === inputValue.toLowerCase();
  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); handleSelect(value); }}
      className={`flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-[13px] hover:bg-charcoal-elevated hover:text-ink ${selected ? "bg-brand/[8%] text-brand" : "text-ink-muted"}`}
    >
      {selected ? <Check className="mr-2 h-4 w-4 shrink-0" /> : <span className="mr-6" />}
      {children}
    </div>
  );
};

export { Combobox, ComboboxContent, ComboboxItem };
