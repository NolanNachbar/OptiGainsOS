import * as React from "react";
import { cn } from "./system/cva";
import { buttonVariants } from "./system/variants";



const Button = React.forwardRef(({ className = "", variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
  // A caller's explicit h-*/w-* must beat the md: dimension baked into a size.
  const cls = typeof className === "string" ? className : "";
  let base = buttonVariants({ variant, size });
  if (/(^|\s)h-/.test(cls)) base = base.replace(/\bmd:h-\S+/g, "");
  if (/(^|\s)w-/.test(cls)) base = base.replace(/\bmd:w-\S+/g, "");
  const combined = cn(base, cls);

  if (asChild && React.isValidElement(children)) {
    // eslint-disable-next-line react-hooks/refs -- forwarding the ref to the slotted child
    return React.cloneElement(children, { ...props, className: cn(combined, children.props.className), ref });
  }
  return (
    <button ref={ref} className={combined} {...props}>
      {children}
    </button>
  );
});
Button.displayName = "Button";

export { Button };
