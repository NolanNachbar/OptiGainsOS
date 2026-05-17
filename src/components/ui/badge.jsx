import * as React from "react";

const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700/80",
    destructive: "bg-danger-500 text-slate-50 hover:bg-danger-500/80",
    outline: "text-slate-950 border border-slate-200 dark:text-slate-50 dark:border-slate-700",
  };

  return (
    <div
      ref={ref}
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
