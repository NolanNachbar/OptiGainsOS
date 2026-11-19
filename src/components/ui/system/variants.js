import { cva } from "./cva";

// Ledger button. Off-white (--color-brand) is THE single action colour: one
// flat fill, neutral black lift, no glow. Everything secondary is a quiet
// surface. Press feedback is scale(0.97) at --dur-fast (emil: buttons must
// feel responsive to press). Legacy variant names alias onto the four tiers.
const ACTION =
  "bg-brand text-[var(--color-action-dark)] shadow-elev-2 hover:bg-[var(--brand-bright)] " +
  "disabled:bg-charcoal-surface disabled:text-ink-muted disabled:shadow-none disabled:border disabled:border-charcoal-border disabled:opacity-100";
const QUIET = "bg-charcoal-surface2 text-ink border border-charcoal-border hover:bg-charcoal-elevated";
const OUTLINE = "bg-transparent text-ink-secondary border border-charcoal-border hover:bg-charcoal-surface2 hover:text-ink";
const SUBTLE = "bg-brand/10 text-brand border border-brand/20 hover:bg-brand/15 " +
  "disabled:bg-charcoal-surface disabled:text-ink-muted disabled:border-charcoal-border disabled:opacity-100";
const DANGER = "bg-bad/[0.18] text-bad border border-bad/70 hover:bg-bad/25 hover:border-bad";
const PLAIN = "bg-transparent border-0 shadow-none text-ink-muted hover:text-ink";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-semibold tracking-[-0.01em] cursor-pointer select-none " +
    "transition-[transform,background-color,border-color,color,opacity] duration-fast ease-out active:scale-[0.97] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // canonical tiers
        primary: ACTION,
        secondary: QUIET,
        outline: OUTLINE,
        subtle: SUBTLE,
        destructive: DANGER,
        plain: PLAIN,
        link: "h-auto px-0 bg-transparent text-ink underline-offset-4 hover:underline active:scale-100",
        // legacy aliases (kept so call sites do not churn)
        volt: ACTION, energy: ACTION, coral: ACTION,
        default: QUIET, dark: QUIET, ghost: QUIET, ai: QUIET,
        coralGhost: SUBTLE,
        dim: OUTLINE,
      },
      size: {
        default: "h-11 md:h-9 px-4 text-body",
        sm: "h-8 px-3 text-caption",
        lg: "h-12 px-5 text-emph",
        icon: "h-11 w-11 md:h-9 md:w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

// Badge = a small status/datum chip. Hue only when the badge IS a datum.
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2 h-5 text-micro font-semibold tabular-nums whitespace-nowrap transition-colors duration-base",
  {
    variants: {
      variant: {
        default: "bg-charcoal-surface2 text-ink-secondary border border-charcoal-border",
        slate: "bg-charcoal-surface2 text-ink-secondary border border-charcoal-border",
        secondary: "bg-charcoal-surface2 text-ink-secondary border border-charcoal-border",
        outline: "text-ink border border-charcoal-border",
        volt: "bg-brand/[0.08] text-brand border border-brand/20",
        teal: "bg-teal/10 text-teal border border-teal/20",
        green: "bg-leaf/10 text-leaf border border-leaf/20",
        amber: "bg-warn/10 text-warn border border-warn/20",
        red: "bg-bad/10 text-bad border border-bad/15",
        destructive: "bg-bad/10 text-ink border border-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

// Ledger module: flat full-bleed surface, hairline rule, radius 0 (`.glass`
// forces radius 0 in index.css). `variant="inset"` for a card inside a card.
export const cardVariants = cva("text-ink transition-colors duration-base", {
  variants: {
    variant: {
      default: "glass",
      inset: "bg-[var(--glass-inset-bg)] border border-charcoal-borderSoft rounded-control",
      plain: "",
    },
  },
  defaultVariants: { variant: "default" },
});

