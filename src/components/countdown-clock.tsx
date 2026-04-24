"use client";

import { useMemo } from "react";

function getBusinessDays(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  const sign = end >= cur ? 1 : -1;
  while (cur.getTime() !== end.getTime()) {
    cur.setDate(cur.getDate() + sign);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count += sign;
  }
  return count;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

interface Props {
  dueDate: string; // ISO date string
  closeDate?: string; // project start date
}

export function CountdownClock({ dueDate, closeDate }: Props) {
  const stats = useMemo(() => {
    const now = new Date();
    const due = new Date(dueDate + "T23:59:59");
    const start = closeDate ? new Date(closeDate + "T00:00:00") : null;

    const calDaysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
    const bizDaysLeft = getBusinessDays(now, due);
    const isPast = calDaysLeft < 0;

    let pctElapsed: number | null = null;
    if (start) {
      const totalCal = Math.max(1, Math.ceil((due.getTime() - start.getTime()) / 86400000));
      const elapsed = Math.ceil((now.getTime() - start.getTime()) / 86400000);
      pctElapsed = clamp(Math.round((elapsed / totalCal) * 100), 0, 100);
    }

    return { calDaysLeft, bizDaysLeft, isPast, pctElapsed };
  }, [dueDate, closeDate]);

  const { calDaysLeft, bizDaysLeft, isPast, pctElapsed } = stats;

  const urgencyColor = isPast
    ? "text-red-600 dark:text-red-400"
    : calDaysLeft <= 7
    ? "text-red-500 dark:text-red-400"
    : calDaysLeft <= 21
    ? "text-amber-500 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  const barColor = isPast
    ? "bg-red-500"
    : calDaysLeft <= 7
    ? "bg-red-500"
    : calDaysLeft <= 21
    ? "bg-amber-500"
    : "bg-emerald-500";

  const dueFmt = new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 p-3 bg-muted/40 rounded-lg border border-border text-sm">
      {/* Due date */}
      <div>
        <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Due</span>
        <div className="font-semibold text-foreground">{dueFmt}</div>
      </div>

      {/* Calendar days */}
      <div>
        <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Calendar days</span>
        <div className={`font-bold text-lg leading-tight ${urgencyColor}`}>
          {isPast ? `${Math.abs(calDaysLeft)}d overdue` : `${calDaysLeft}d left`}
        </div>
      </div>

      {/* Business days */}
      <div>
        <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Business days</span>
        <div className={`font-bold text-lg leading-tight ${urgencyColor}`}>
          {isPast ? `${Math.abs(bizDaysLeft)}d overdue` : `${bizDaysLeft}d left`}
        </div>
      </div>

      {/* Timeline progress */}
      {pctElapsed !== null && (
        <div className="flex-1 min-w-[140px]">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="uppercase tracking-wide font-medium">Timeline</span>
            <span className="font-semibold">{pctElapsed}% elapsed</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pctElapsed}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
