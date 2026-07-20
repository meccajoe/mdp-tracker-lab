import * as React from "react";

import { cn } from "@/lib/utils";

function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-shell"
      className={cn("w-full min-w-0 max-w-full space-y-6 sm:space-y-8", className)}
      {...props}
    />
  );
}

export { PageShell };
