import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Minus, Plus, X } from "lucide-react";
import { cva, cn } from "./cva";

/* ─────────────────────────────────────────────────────────────────────────
   Ledger page patterns. See brand/BRAND_GUIDE.md > Components. Every screen
   is built from these; do not hand-roll a header, row, empty or basis line.
   ───────────────────────────────────────────────────────────────────────── */

/* Separator: the module rule. */
export function Separator({ orientation = "horizontal", inset = false, className = "", ...props }) {
  const vertical = orientation === "vertical";
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(vertical ? "w-px self-stretch" : "h-px w-full", "bg-charcoal-border shrink-0", inset && !vertical && "ml-4 w-auto", className)}
      {...props}
    />
  );
}

/* PageHeader: eyebrow (micro caps), title (display), optional meta line and
   trailing action. On mobile the Layout header already prints the page title
   (with the Gauge and date), so by default the in-page title is hidden below
   lg: and only shows on desktop, where Layout has no top header. Pass
   `mobileTitle` to keep it visible on mobile (e.g. a page whose in-page title
   differs from the Layout title). A header with nothing else to show on mobile
   collapses entirely there, so no empty band is left behind. */
export function PageHeader({ eyebrow, title, meta, action, back, mobileTitle = false, className = "", as: Tag = "h1" }) {
  const mobileEmpty = !mobileTitle && !eyebrow && !meta && !action && !back;
  return (
    <header className={cn("flex items-end justify-between gap-3 px-gutter pt-4 pb-3", mobileEmpty && "hidden lg:flex", className)}>
      <div className="min-w-0 flex-1">
        {back}
        {eyebrow && <p className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">{eyebrow}</p>}
        {title && (
          <Tag className={cn("text-display font-semibold tracking-[-0.02em] text-ink truncate", !mobileTitle && "hidden lg:block")}>{title}</Tag>
        )}
        {meta && <p className="mt-0.5 text-caption text-ink-muted tabular-nums truncate">{meta}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ListRow: 56px min, leading slot, title + detail, trailing value + chevron.
   Renders a <button> when onClick is set, an <a> for href, else a <div>. */
const listRowVariants = cva(
  "group flex w-full min-h-[56px] items-center gap-3 px-gutter py-row text-left text-ink border-b border-charcoal-borderSoft last:border-b-0",
  {
    variants: {
      interactive: {
        true: "cursor-pointer transition-colors duration-fast ease-out hover:bg-charcoal-surface2 active:bg-charcoal-surface2 focus-visible:outline-none focus-visible:bg-charcoal-surface2",
        false: "",
      },
      selected: { true: "bg-charcoal-surface2", false: "" },
    },
    defaultVariants: { interactive: false, selected: false },
  }
);

export const ListRow = React.forwardRef(function ListRow(
  { leading, title, detail, value, unit, trailing, chevron, selected = false, truncate = false, onClick, href, className = "", children, ...props },
  ref
) {
  const interactive = Boolean(onClick || href);
  const Tag = href ? "a" : onClick ? "button" : "div";
  const extra = Tag === "button" ? { type: "button" } : {};
  return (
    <Tag ref={ref} href={href} onClick={onClick} className={cn(listRowVariants({ interactive, selected }), className)} {...extra} {...props}>
      {leading && <span className="shrink-0 flex items-center text-ink-secondary">{leading}</span>}
      <span className="min-w-0 flex-1">
        {title && <span className="block text-emph font-semibold truncate">{title}</span>}
        {detail && <span className={cn("block text-caption text-ink-muted", truncate ? "truncate" : "line-clamp-2")}>{detail}</span>}
        {children}
      </span>
      {value != null && (
        <span className="shrink-0 text-emph font-semibold tabular-nums text-ink">
          {value}
          {unit && <span className="ml-0.5 text-caption font-normal text-ink-muted">{unit}</span>}
        </span>
      )}
      {trailing}
      {(chevron ?? interactive) && <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />}
    </Tag>
  );
});

/* ReasonLine: the basis under every engine number. Caption, muted; wraps to at
   most 2 lines (opt in to single-line ellipsis with `truncate`). With `detail`, tapping expands an inline drawer (never a modal). */
export function ReasonLine({ children, detail, className = "", defaultOpen = false, truncate = false }) {
  const clamp = truncate ? "truncate" : "line-clamp-2";
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  if (!detail) {
    return <p className={cn("text-caption text-ink-muted tabular-nums", clamp, className)}>{children}</p>;
  }
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-[24px] items-center gap-1 text-left text-caption text-ink-muted tabular-nums hover:text-ink-secondary transition-colors duration-fast"
      >
        <span className={clamp}>{children}</span>
        <ChevronRight aria-hidden="true" className={cn("h-3 w-3 shrink-0 transition-transform duration-base ease-out", open && "rotate-90")} />
      </button>
      {open && (
        <div id={id} className="mt-1.5 border-l border-charcoal-border pl-3 text-caption text-ink-secondary tabular-nums">
          {detail}
        </div>
      )}
    </div>
  );
}

/* Stat: label (micro caps) / value (tabular) + unit (smaller, muted) / optional
   delta and reason. `hue` colours the value only when the value IS that datum. */
const statValue = cva("font-numeral tabular-nums tracking-[-0.02em] leading-none", {
  variants: {
    size: { sm: "text-title", md: "text-display", lg: "text-hero" },
    hue: { none: "text-ink", teal: "text-teal", coral: "text-coral", violet: "text-violet", leaf: "text-leaf", carb: "text-carb", fat: "text-fat" },
  },
  defaultVariants: { size: "md", hue: "none" },
});

export function Stat({ label, value, unit, delta, reason, size = "md", hue = "none", align = "left", truncate = false, className = "" }) {
  return (
    <div className={cn("min-w-0", align === "center" && "text-center", className)}>
      {label && <p className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>}
      <p className="flex items-baseline gap-1 whitespace-nowrap" style={align === "center" ? { justifyContent: "center" } : undefined}>
        <span className={statValue({ size, hue })}>{value ?? "--"}</span>
        {unit && <span className={cn("font-normal text-ink-muted", size === "lg" ? "text-title" : "text-caption")}>{unit}</span>}
        {delta && <span className="ml-1 text-caption font-semibold tabular-nums text-ink-secondary">{delta}</span>}
      </p>
      {reason && <ReasonLine className="mt-1" truncate={truncate}>{reason}</ReasonLine>}
    </div>
  );
}

/* EmptyState: what the engine needs and how long. No illustration, no mascot.
   Optional progress {value, max} and one action. */
export function EmptyState({ icon: Icon, title, children, progress, action, className = "" }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 px-gutter py-8", className)}>
      {Icon && <Icon aria-hidden="true" className="h-5 w-5 text-ink-faint" strokeWidth={1.75} />}
      {title && <p className="text-emph font-semibold text-ink">{title}</p>}
      {children && <p className="text-body text-ink-muted max-w-[34ch]">{children}</p>}
      {progress && (
        <div className="mt-1 h-1 w-full max-w-[240px] bg-track" role="progressbar" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={progress.max}>
          <div className="h-full bg-brand transition-[width] duration-slow ease-out" style={{ width: `${Math.min(100, (progress.value / progress.max) * 100)}%` }} />
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* LoadingState: skeleton rows matching the final layout. Never a spinner page. */
export function LoadingState({ rows = 3, label = "Loading", className = "" }) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-gutter py-row min-h-[56px] border-b border-charcoal-borderSoft">
          <div className="h-3.5 flex-1 max-w-[180px] bg-track animate-pulse rounded-control" />
          <div className="h-3.5 w-12 bg-track animate-pulse rounded-control" />
        </div>
      ))}
    </div>
  );
}

/* ErrorState: what failed, flat, plus Retry. Never "Oops". */
export function ErrorState({ title = "Could not load", children, onRetry, className = "" }) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-2 px-gutter py-8", className)}>
      <p className="text-emph font-semibold text-ink">{title}</p>
      {children && <p className="text-body text-ink-muted max-w-[34ch]">{children}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 h-11 px-4 rounded-control border border-charcoal-border bg-charcoal-surface2 text-body font-semibold text-ink active:scale-[0.97] transition-transform duration-fast ease-out">
          Retry
        </button>
      )}
    </div>
  );
}

/* Stepper: numeric entry without the keyboard (set entry). 48px +/- targets,
   tabular readout, step snapping. Value is a number; onChange(next). */
export function Stepper({ value, onChange, step = 1, min = 0, max = Infinity, unit, label, format, className = "" }) {
  const decimals = (String(step).split(".")[1] || "").length;
  const clamp = (n) => Math.min(max, Math.max(min, Number(n.toFixed(decimals))));
  const v = Number(value) || 0;
  const btn = "flex h-12 w-12 items-center justify-center rounded-control bg-charcoal-surface2 border border-charcoal-border text-ink " +
    "transition-[transform,background-color] duration-fast ease-out active:scale-[0.94] active:bg-charcoal-elevated disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className={cn("flex items-center gap-3", className)} role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Decrease ${label || ""}`.trim()} disabled={v <= min} onClick={() => onChange(clamp(v - step))}>
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>
      <output className="min-w-[88px] text-center" aria-live="polite">
        <span className="text-display font-numeral tabular-nums text-ink">{format ? format(v) : v}</span>
        {unit && <span className="ml-1 text-caption text-ink-muted">{unit}</span>}
      </output>
      <button type="button" className={btn} aria-label={`Increase ${label || ""}`.trim()} disabled={v >= max} onClick={() => onChange(clamp(v + step))}>
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/* Sheet: bottom sheet (mobile) / right panel (md+). Portaled, scrim click and
   Escape dismiss. Use for editors and pickers; explanations stay inline. */
export function Sheet({ open, onOpenChange, title, description, children, footer, side = "bottom", className = "" }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onOpenChange?.(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  if (!open) return null;
  const panel = side === "right"
    ? "right-0 top-0 h-full w-full max-w-md border-l rise-in"
    : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[14px] border-t sheet-rise md:inset-x-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l";
  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <div className="fixed inset-0 bg-black/70" onClick={() => onOpenChange?.(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        className={cn("fixed flex flex-col bg-[var(--sheet-bg)] border-charcoal-border shadow-elev-3 text-ink", panel, className)}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="md:hidden mx-auto mt-2 h-1 w-9 rounded-pill bg-[var(--glass-edge-strong)]" aria-hidden="true" />
        {(title || description) && (
          <div className="flex items-start gap-3 px-gutter pt-3 pb-2">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-title font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-body text-ink-muted">{description}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={() => onOpenChange?.(false)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary hover:text-ink">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-gutter pb-4">{children}</div>
        {footer && <div className="border-t border-charcoal-border px-gutter py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
