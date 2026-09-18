import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/admin/reconciliation/page.tsx", "utf8");

test("Accounting Review is a direct Tracker versus QuickBooks project comparison", () => {
  for (const required of [
    "Tracker vs. QuickBooks",
    "Tracker revenue",
    "QBO revenue",
    "Revenue difference",
    "Tracker project cost",
    "QBO project cost",
    "Cost difference",
    "Project financial comparison",
    "Gross profit",
    'data-slot="reconciliation-desktop-table"',
  ]) {
    assert.ok(page.includes(required), `missing comparison-first Accounting Review contract: ${required}`);
  }

  assert.match(page, /<Table>/);
  assert.match(page, /<TableHeader>/);
  assert.match(page, /<TableRow/);
  assert.doesNotMatch(page, /Projects that need a financial check/);
  assert.doesNotMatch(page, /Start with the explanation and recommended next step/);
});

test("Accounting Review states the exact source contracts without a teaching-card preamble", () => {
  for (const required of [
    "Tracker uses contract value, imported project expenses, and approved direct project labor",
    "QuickBooks uses billed revenue and costs posted to the project",
    "QBO minus Tracker",
    "Salaried leadership hours are excluded from Tracker project cost",
  ]) {
    assert.ok(page.includes(required), `missing comparison source contract: ${required}`);
  }

  assert.doesNotMatch(page, /<SourceLesson/);
  assert.doesNotMatch(page, /Plain-English explanation/);
  assert.doesNotMatch(page, /Common reasons this happens/);
});

test("Accounting Review keeps dense evidence and workflow in an on-demand expanded row", () => {
  assert.ok(page.includes("expandedProjectId"));
  assert.ok(page.includes("colSpan={9}"));
  assert.ok(page.includes("Hide review"));
  assert.ok(page.includes("Review project"));
});

test("Accounting Review isolates asynchronous queue, refresh, and case-history requests", () => {
  for (const required of [
    "queueRequestIdRef",
    "refreshRequestIdRef",
    "caseDetailRequestIdRef",
    "new AbortController()",
    "controller.abort()",
    "disabled={refreshing}",
  ]) {
    assert.ok(page.includes(required), `missing async safety contract: ${required}`);
  }

  assert.ok(!page.includes("const requestIdRef = useRef(0)"), "queue and refresh must not share one request generation");
});
