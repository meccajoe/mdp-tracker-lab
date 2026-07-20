import * as React from "react";

import { cn } from "@/lib/utils";

function SummaryGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="summary-grid"
      className={cn("grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4", className)}
      {...props}
    />
  );
}

export { SummaryGrid };
