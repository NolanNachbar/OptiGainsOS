/**
 * Unified surface card. Use `accent` to add a left-border color stripe.
 * All cards in the app should use this or the shadcn Card as a base.
 */
export default function AppCard({ children, accent, className = "", ...props }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm ${accent ? 'border-l-4' : ''} ${className}`}
      style={accent ? { borderLeftColor: accent } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
