import * as React from "react";
import { ChevronDown, Check } from "lucide-react";

// The option list renders IN FLOW, directly under the input, not portaled to
// <body> with measured `fixed` coordinates. The portal version placed the list
// from getBoundingClientRect at focus time, and on a phone the keyboard then
// moves the page (and on iOS Safari the visual viewport drifts from the layout
// viewport that `fixed` is anchored to), so the list landed nowhere near the
// field. In flow there are no coordinates to get wrong on any browser, no
// z-index fight with the glass cards, and nothing to clip.
//
// Outside taps close it via a document pointerdown listener, not a full-screen
// backdrop. The backdrop sat on top of every control on the page, so with the
// list open the first tap on "Add exercise" only dismissed the list and added
// nothing (reproduced 2026-09-27, ui-audit/_probe/combobox-tap.mjs).

const ComboboxContext = React.createContext({});

// Cap the list to the space actually visible below the field. visualViewport
// shrinks when the keyboard opens; innerHeight does not.
function useVisibleSpaceBelow(open, ref) {
  const [maxHeight, setMaxHeight] = React.useState(240);
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const vv = window.visualViewport;
    const update = () => {
      if (!ref.current) return;
      const visibleH = vv ? vv.height : window.innerHeight;
      const below = visibleH - ref.current.getBoundingClientRect().bottom - 12;
      setMaxHeight(Math.max(160, Math.min(240, Math.round(below))));
    };
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [open, ref]);
  return maxHeight;
}

function useCloseOnOutsidePointer(open, setOpen, ref) {
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, setOpen, ref]);
}

const listClass = "mt-1 overflow-auto overscroll-contain rounded-xl border border-charcoal-border bg-charcoal-surface p-1";

function Combobox({ value = "", onValueChange, items, excludeValue = "", placeholder = "", onKeyDown, children }) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const maxHeight = useVisibleSpaceBelow(open, triggerRef);
  useCloseOnOutsidePointer(open, setOpen, wrapperRef);

  const handleChange = (e) => {
    const v = e.target.value;
    onValueChange?.(v);
    if (!open) setOpen(true);
  };

  const handleSelect = (name) => {
    onValueChange?.(name);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") setOpen(false);
    // Enter commits whatever is typed; the list has done its job.
    if (e.key === "Enter") setOpen(false);
    onKeyDown?.(e);
  };

  const useItemsMode = Array.isArray(items);

  const query = (value ?? "").trim().toLowerCase();
  const filtered = useItemsMode
    ? [...new Set(items)].filter((n) => n !== excludeValue && (!query || n.toLowerCase().includes(query)))
    : [];

  const inputEl = (
    <div
      ref={triggerRef}
      className="flex h-11 w-full items-center rounded-lg border-[0.5px] border-charcoal-borderSoft bg-charcoal-surface2 pr-3 focus-within:border-charcoal-border focus-within:shadow-[0_0_0_3px_var(--glass-edge)] transition-[border-color,box-shadow] duration-[180ms] ease-[var(--ease)]"
    >
      <input
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 self-stretch bg-transparent px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-muted"
      />
      <button type="button" aria-label="Toggle options" onClick={() => setOpen((o) => !o)} className="flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-muted">
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );

  if (useItemsMode) {
    return (
      <div ref={wrapperRef} className="relative">
        {inputEl}
        {open && (
          <div role="listbox" className={listClass} style={{ maxHeight }}>
            {filtered.length > 0 ? (
              filtered.map((name) => {
                const selected = name.toLowerCase() === (value ?? "").toLowerCase();
                return (
                  <div
                    key={name}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
                    className={`flex cursor-pointer select-none items-center rounded-md px-2 py-2 text-[13px] hover:bg-charcoal-elevated hover:text-ink ${selected ? "bg-brand/[8%] text-brand" : "text-ink-muted"}`}
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
        )}
      </div>
    );
  }

  return (
    <ComboboxContext.Provider
      value={{ inputValue: value ?? "", open, handleSelect, maxHeight }}
    >
      <div ref={wrapperRef} className="relative">
        {inputEl}
        {children}
      </div>
    </ComboboxContext.Provider>
  );
}

const ComboboxContent = ({ className = "", children }) => {
  const { open, inputValue, maxHeight } = React.useContext(ComboboxContext);

  if (!open) return null;

  const query = inputValue.trim().toLowerCase();
  const filtered = React.Children.toArray(children).filter((child) => {
    if (!React.isValidElement(child)) return true;
    return !query || (child.props.value || "").toLowerCase().includes(query);
  });

  return (
    <div role="listbox" className={`${listClass} ${className}`} style={{ maxHeight }}>
      {filtered.length > 0 ? filtered : (
        <div className="px-2 py-1.5 text-[13px] text-ink-muted">
          {query ? `No results for "${inputValue}".` : "No options available."}
        </div>
      )}
    </div>
  );
};

const ComboboxItem = ({ value, children }) => {
  const { handleSelect, inputValue } = React.useContext(ComboboxContext);
  const selected = value.toLowerCase() === inputValue.toLowerCase();
  return (
    <div
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => { e.preventDefault(); handleSelect(value); }}
      className={`flex cursor-pointer select-none items-center rounded-md px-2 py-2 text-[13px] hover:bg-charcoal-elevated hover:text-ink ${selected ? "bg-brand/[8%] text-brand" : "text-ink-muted"}`}
    >
      {selected ? <Check className="mr-2 h-4 w-4 shrink-0" /> : <span className="mr-6" />}
      {children}
    </div>
  );
};

export { Combobox, ComboboxContent, ComboboxItem };
