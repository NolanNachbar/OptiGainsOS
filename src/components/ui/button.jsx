import * as React from "react";

const Button = React.forwardRef(({
  className = "",
  variant = "default",
  size = "default",
  children,
  ...props
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer transition-all duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:opacity-90 whitespace-nowrap tracking-[-0.01em]";

  const variants = {
    /* 4-tier design system */
    volt:        "bg-[#ccff00] text-black rounded-md hover:bg-[#d9ff1a]",
    dark:        "bg-[#202020] text-white border border-[#2a2a2a] rounded-md hover:bg-[#242424]",
    ghost:       "bg-transparent text-[#ccff00] border border-[rgba(204,255,0,0.25)] rounded-md hover:bg-[rgba(204,255,0,0.08)]",
    dim:         "bg-transparent text-[#a0a0a0] border border-[#2a2a2a] rounded-md hover:bg-[#242424] hover:text-white",
    /* utility / legacy variants */
    default:     "bg-[#202020] text-white border border-[#2a2a2a] rounded-md hover:bg-[#242424]",
    primary:     "bg-[#ccff00] text-black rounded-md hover:bg-[#d9ff1a]",
    ai:          "bg-[#202020] text-white border border-[#2a2a2a] rounded-md hover:bg-[#242424]",
    destructive: "bg-transparent text-[#f87171] border border-[rgba(239,68,68,0.35)] rounded-md hover:bg-[rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.6)]",
    outline:     "border border-[#2a2a2a] bg-transparent text-[#a0a0a0] rounded-md hover:bg-[#242424] hover:text-white",
    secondary:   "bg-[#202020] text-[#a0a0a0] rounded-md hover:bg-[#242424] hover:text-white",
    link:        "text-[#ccff00] underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 text-[13.5px]",
    sm:      "h-[30px] px-3 text-[12.5px]",
    lg:      "h-[42px] px-[22px] text-[15px]",
    icon:    "h-9 w-9",
  };

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";

export { Button };
