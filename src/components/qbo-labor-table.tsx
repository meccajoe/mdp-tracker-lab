"use client";

import { Fragment } from "react";
import type { QboLaborEntry } from "@/lib/types";
import { formatCurrency } from "@/lib/constants";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface QboLaborTableProps {
  entries: QboLaborEntry[];
  view: "employee" | "date";
  expandedRows: Set<string>;
  onToggleRow: (key: string) => void;
}

export function QboLaborTable({ entries, view, expandedRows, onToggleRow }: QboLaborTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">No labor data synced yet. Click Sync to pull from QBO.</p>
      </div>
    );
  }

  if (view === "employee") {
    return <ByEmployeeView entries={entries} expandedRows={expandedRows} onToggleRow={onToggleRow} />;
  }

  return <ByDateView entries={entries} expandedRows={expandedRows} onToggleRow={onToggleRow} />;
}

function ByEmployeeView({ entries, expandedRows, onToggleRow }: Omit<QboLaborTableProps, "view">) {
  const byEmployee = new Map<string, QboLaborEntry[]>();
  for (const e of entries) {
    const arr = byEmployee.get(e.employee_name) ?? [];
    arr.push(e);
    byEmployee.set(e.employee_name, arr);
  }
  const employees = [...byEmployee.entries()]
    .map(([name, rows]) => ({
      name,
      entries: rows.sort((a, b) => b.date.localeCompare(a.date)),
      reg: rows.reduce((s, e) => s + e.reg_hours, 0),
      ot: rows.reduce((s, e) => s + e.ot_hours, 0),
      total: rows.reduce((s, e) => s + e.reg_hours + e.ot_hours, 0),
      cost: rows.reduce((s, e) => s + (e.reg_hours + e.ot_hours) * e.hourly_rate, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Employee</TableHead>
          <TableHead className="text-right">Reg Hrs</TableHead>
          <TableHead className="text-right">OT Hrs</TableHead>
          <TableHead className="text-right">Total Hrs</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((emp) => (
          <Fragment key={emp.name}>
            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onToggleRow(emp.name)}>
              <TableCell className="text-center text-muted-foreground">{expandedRows.has(emp.name) ? "\u25BE" : "\u25B8"}</TableCell>
              <TableCell className="font-medium">{emp.name}</TableCell>
              <TableCell className="text-right font-mono">{emp.reg.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono">{emp.ot.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono font-medium">{emp.total.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(emp.cost)}</TableCell>
            </TableRow>
            {expandedRows.has(emp.name) && emp.entries.map((entry) => (
              <TableRow key={entry.id} className="bg-muted/20">
                <TableCell></TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{entry.reg_hours.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{entry.ot_hours.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{(entry.reg_hours + entry.ot_hours).toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency((entry.reg_hours + entry.ot_hours) * entry.hourly_rate)}</TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function ByDateView({ entries, expandedRows, onToggleRow }: Omit<QboLaborTableProps, "view">) {
  const byDate = new Map<string, QboLaborEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  const dates = [...byDate.entries()]
    .map(([date, rows]) => ({
      date,
      entries: rows.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      employeeCount: new Set(rows.map((e) => e.employee_name)).size,
      reg: rows.reduce((s, e) => s + e.reg_hours, 0),
      ot: rows.reduce((s, e) => s + e.ot_hours, 0),
      total: rows.reduce((s, e) => s + e.reg_hours + e.ot_hours, 0),
      cost: rows.reduce((s, e) => s + (e.reg_hours + e.ot_hours) * e.hourly_rate, 0),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Employees</TableHead>
          <TableHead className="text-right">Reg Hrs</TableHead>
          <TableHead className="text-right">OT Hrs</TableHead>
          <TableHead className="text-right">Total Hrs</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dates.map((day) => (
          <Fragment key={day.date}>
            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onToggleRow(day.date)}>
              <TableCell className="text-center text-muted-foreground">{expandedRows.has(day.date) ? "\u25BE" : "\u25B8"}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">
                {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {day.employeeCount} employee{day.employeeCount !== 1 ? "s" : ""}
              </TableCell>
              <TableCell className="text-right font-mono">{day.reg.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono">{day.ot.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono font-medium">{day.total.toFixed(1)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(day.cost)}</TableCell>
            </TableRow>
            {expandedRows.has(day.date) && day.entries.map((entry) => (
              <TableRow key={entry.id} className="bg-muted/20">
                <TableCell></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-sm">{entry.employee_name}</TableCell>
                <TableCell className="text-right font-mono text-sm">{entry.reg_hours.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{entry.ot_hours.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{(entry.reg_hours + entry.ot_hours).toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency((entry.reg_hours + entry.ot_hours) * entry.hourly_rate)}</TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
