"use client";

import type { QboLaborEntry } from "@/lib/types";
import { buildLaborExceptionRows } from "@/lib/project-labor-exceptions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ProjectLaborExceptions({ entries, closeDate }: { entries: QboLaborEntry[]; closeDate?: string | null }) {
  const exceptions = buildLaborExceptionRows(entries, closeDate);
  return <div className="border-b px-6 py-4"><div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Labor exceptions</p><p className="text-xs text-muted-foreground">Resolve in QBO Time or record the closeout decision in Completion Readiness.</p></div><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${exceptions.length ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>{exceptions.length ? `${exceptions.length} to review` : "No exceptions"}</span></div>{exceptions.length > 0 && <div className="overflow-x-auto rounded border"><Table><TableHeader><TableRow><TableHead>Exception</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Hours</TableHead><TableHead>Next action</TableHead></TableRow></TableHeader><TableBody>{exceptions.map((row) => <TableRow key={row.key}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right font-mono">{row.entries}</TableCell><TableCell className="text-right font-mono">{row.hours.toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{row.action}</TableCell></TableRow>)}</TableBody></Table></div>}</div>;
}
