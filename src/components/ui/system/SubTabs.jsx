import { useRef, useEffect } from "react";

/**
 * SubTabs — the section-level tab strip used by every hub (Train, Fuel, Analyze…).
 * Liquid-glass strip; the active tab is a coral pill (the dock language).
 * Mobile-only by default — on desktop the sidebar renders the same sub-tabs
 * indented under the active section (pass showOnDesktop to keep the strip).
 *
 *   tabs:    [{ id, label, icon? }]
 *   active:  current tab id
 *   onChange(id)
 *   right:   optional right-aligned node (defaults to nothing)
 *
 * Labels are NEVER truncated: the strip scrolls horizontally when the tabs
 * don't fit, and the active tab is auto-centered into view. Icons are hidden
 * on phones so short word-labels fit without scrolling.
 */
export default function SubTabs({ tabs, active, onChange, right, sticky = true, showOnDesktop = false, className = "" }) {
  const stripRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <div
      className={`${sticky ? "sticky top-0 z-50" : ""} ${showOnDesktop ? "" : "lg:hidden"} glass-elevated border-x-0 border-t-0 rounded-none ${className}`}
    >
      <div className="max-w-5xl mx-auto px-3 flex items-center justify-between h-12">
        <div ref={stripRef} className="flex gap-1 overflow-x-auto no-scrollbar items-center h-full">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                ref={isActive ? activeRef : null}
                onClick={() => onChange(id)}
                className={`relative shrink-0 px-3 h-11 rounded-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-colors duration-150 ${
                  isActive
                    ? "text-[var(--brand-tint)] bg-brand/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {Icon && <Icon className="hidden sm:block w-3.5 h-3.5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />}
                {label}
              </button>
            );
          })}
        </div>
        {right && <div className="ml-4 shrink-0">{right}</div>}
      </div>
    </div>
  );
}
