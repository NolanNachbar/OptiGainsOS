import { cn } from "@/components/ui";

// The Gauge: 270-degree arc, butt caps, one reading tick. Flat, one colour
// (currentColor, defaults to the brand off-white). Never filled, never gradient.
export default function Logo({ className = "w-16 h-16", ...props }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="OptiGains"
      className={cn("brand-mark text-brand shrink-0", className)}
      {...props}
    >
      <path d="M149.9 362.1 A150 150 0 1 1 362.1 362.1" stroke="currentColor" strokeWidth="44" strokeLinecap="butt" />
      <path d="M284.3 227.7 L326.7 185.3" stroke="currentColor" strokeWidth="28" strokeLinecap="butt" />
    </svg>
  );
}
