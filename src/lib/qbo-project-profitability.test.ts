import assert from "node:assert/strict";
import test from "node:test";

import { extractQboProjectDetailsId, buildQboProjectDetailsUrl } from "./qbo-project-profitability.ts";

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
