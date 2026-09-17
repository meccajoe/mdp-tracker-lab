import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/admin/reconciliation/page.tsx", "utf8");

test("Accounting Review follows the Projects-style full-width row and column pattern", () => {
  for (const required of [
    "Projects that need a financial check",
    "What needs attention",
    "What it likely means",
    "Recommended next step",
    "Assigned to",
    "Review status",
    "Review project",
    'data-slot="reconciliation-desktop-table"',
  ]) {
    assert.ok(page.includes(required), `missing Accounting Review UX contract: ${required}`);
  }

  assert.match(page, /<Table>/);
  assert.match(page, /<TableHeader>/);
  assert.match(page, /<TableRow/);
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(340px,0\.75fr\)\]/);
  assert.doesNotMatch(page, /Reconciliation queue/);
});

test("Accounting Review teaches the source distinction before showing comparison details", () => {
  for (const required of [
    "QBO is the accounting record",
    "Tracker explains the project activity behind it",
    "These numbers are expected to differ sometimes",
    "Plain-English explanation",
    "Common reasons this happens",
    "Numbers behind this review",
    "QBO accounting",
    "Tracker project evidence",
  ]) {
    assert.ok(page.includes(required), `missing explanatory copy: ${required}`);
  }
});

test("Accounting Review keeps dense evidence and workflow in an on-demand expanded row", () => {
  assert.ok(page.includes("expandedProjectId"));
  assert.ok(page.includes("colSpan={7}"));
  assert.ok(page.includes("Hide review"));
  assert.ok(page.includes("Review project"));
});
