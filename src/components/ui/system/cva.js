// Tiny class-variance-authority clone (same API: cva(base, { variants,
// defaultVariants, compoundVariants })) plus `cn`, a tailwind-merge that
// knows the seven named type steps. Plain twMerge treats `text-body` as a
// colour and drops `text-ink`; `cn` does not. Use `cn` in every primitive.
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "caption", "body", "emph", "title", "display", "hero"] }],
      shadow: [{ shadow: ["elev-0", "elev-1", "elev-2", "elev-3"] }],
      rounded: [{ rounded: ["module", "control", "pill"] }],
    },
  },
});

export function cn(...inputs) {
  return twMerge(inputs.flat(Infinity).filter(Boolean).join(" "));
}

export function cva(base, config = {}) {
  const { variants = {}, defaultVariants = {}, compoundVariants = [] } = config;
  return (props = {}) => {
    const out = [base];
    const picked = {};
    for (const key of Object.keys(variants)) {
      const v = props[key] ?? defaultVariants[key];
      picked[key] = v;
      if (v != null && variants[key][v] != null) out.push(variants[key][v]);
    }
    for (const cv of compoundVariants) {
      const { class: c, className: cn2, ...cond } = cv;
      if (Object.entries(cond).every(([k, val]) => (Array.isArray(val) ? val.includes(picked[k]) : picked[k] === val))) {
        out.push(c || cn2);
      }
    }
    return cn(out, props.class, props.className);
  };
}
