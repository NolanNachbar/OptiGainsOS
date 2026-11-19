import * as React from "react";
import { cn } from "./system/cva";
import { badgeVariants } from "./system/variants";



const Badge = React.forwardRef(({ className = "", variant = "default", ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { Badge };
