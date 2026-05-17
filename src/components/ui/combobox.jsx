import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

const ComboboxContext = React.createContext({});

/**
 * Two modes:
 *  - Pass `items` (string[]) → fully self-contained, filters inline every render.
 *  - Pass children with <ComboboxContent>/<ComboboxItem> → legacy context-based API.
 *
 * Uses the `value` prop directly (no local inputValue state) so filtering is always
 * in sync with what the parent controls — no useEffect lag.
 */
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

  // Filter inline every render — value prop is authoritative, no stale closure possible
  const query = (value ?? "").trim().toLowerCase();
  const filtered = useItemsMode
    ? [...new Set(items)].filter((n) => n !== excludeValue && (!query || n.toLowerCase().includes(query)))
    : [];

  const inputEl = (
    <div
      ref={triggerRef}
      className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white pr-3 ring-offset-white focus-within:ring-2 focus-within:ring-slate-950 focus-within:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:ring-slate-50"
    >
      <input
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-500 dark:text-slate-50 dark:placeholder:text-slate-400"
      />
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center">
        <ChevronDown className="h-4 w-4 opacity-50" />
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
                className="fixed z-[10200] max-h-60 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-800"
                style={dropdownStyle}
              >
                {filtered.length > 0 ? (
                  filtered.map((name) => {
                    const selected = name.toLowerCase() === (value ?? "").toLowerCase();
                    return (
                      <div
                        key={name}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
                        className={`flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 ${selected ? "bg-slate-100 dark:bg-slate-700" : ""}`}
                      >
                        {selected ? <Check className="mr-2 h-4 w-4 shrink-0" /> : <span className="mr-6" />}
                        {name}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
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

  // Legacy children mode (used by CreateWorkout.jsx)
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

// Legacy children-based components — still used by CreateWorkout.jsx
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
        className={`fixed z-[10200] max-h-60 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-800 ${className}`}
        style={style}
      >
        {filtered.length > 0 ? filtered : (
          <div className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
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
      className={`flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 ${selected ? "bg-slate-100 dark:bg-slate-700" : ""}`}
    >
      {selected ? <Check className="mr-2 h-4 w-4 shrink-0" /> : <span className="mr-6" />}
      {children}
    </div>
  );
};

export { Combobox, ComboboxContent, ComboboxItem };
