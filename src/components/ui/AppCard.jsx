/**
 * Unified surface card. Use `accent` to add a left-border color stripe.
 * All cards in the app should use this or the shadcn Card as a base.
 * Ledger: modules are flat full-bleed surfaces — no radius (dropped
 * rounded-xl; this component sets bg/border directly rather than via
 * `.glass`, so it isn't covered by that class's index.css radius override).
 */
export default function AppCard({ children, accent, className = "", ...props }) {
  return (
    <div
      className={`relative overflow-hidden bg-charcoal-surface  border border-charcoal-border  ${accent ? 'border-l-4' : ''} ${className}`}
      style={accent ? { borderLeftColor: accent } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
