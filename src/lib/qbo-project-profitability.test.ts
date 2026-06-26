import assert from "node:assert/strict";
import test from "node:test";

import { extractQboProjectDetailsId, buildQboProjectDetailsUrl, parseProjectProfitabilitySummaryRow } from "./qbo-project-profitability.ts";

test("extractQboProjectDetailsId returns the true QBO project id from a projectdetails URL", () => {
  assert.equal(
    extractQboProjectDetailsId("https://qbo.intuit.com/app/projects/projectdetails?id=782146228"),
    "782146228"
  );
  assert.equal(
    extractQboProjectDetailsId("https://app.qbo.intuit.com/app/projects/projectdetails?id=804056305"),
    "804056305"
  );
});

test("extractQboProjectDetailsId ignores legacy customerdetail URLs", () => {
  assert.equal(
    extractQboProjectDetailsId("https://app.qbo.intuit.com/app/customerdetail?nameId=12345"),
    null
  );
});

test("buildQboProjectDetailsUrl emits the canonical QBO project details URL", () => {
  assert.equal(
    buildQboProjectDetailsUrl("782146228"),
    "https://qbo.intuit.com/app/projects/projectdetails?id=782146228"
  );
});

test("parseProjectProfitabilitySummaryRow extracts job-number keyed project profitability values", () => {
  const parsed = parseProjectProfitabilitySummaryRow({
    ColData: [
      { value: "26115 - Netflix - Wall of Fame" },
      { value: "Netflix, Inc." },
      { value: "33840.00" },
      { value: "12513.19" },
      { value: "21326.81" },
      { value: "63.02 %" },
    ],
  });

  assert.deepEqual(parsed, {
    jobNumber: "26115",
    projectName: "26115 - Netflix - Wall of Fame",
    customerName: "Netflix, Inc.",
    income: 33840,
    costs: 12513.19,
    profit: 21326.81,
    profitMargin: "63.02 %",
  });
});

test("parseProjectProfitabilitySummaryRow returns null when the row is not a project profitability detail row", () => {
  assert.equal(parseProjectProfitabilitySummaryRow({ ColData: [{ value: "Total" }] }), null);
});
