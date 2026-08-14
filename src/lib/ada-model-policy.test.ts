import assert from "node:assert/strict";
import test from "node:test";

import { selectAdaModel } from "./ada-model-policy.ts";

const models = {
  opusModel: "claude-opus-test",
  visionModel: "claude-sonnet-test",
};

test("Ada keeps Opus for quote judgment and final review", () => {
  assert.equal(selectAdaModel({ purpose: "quote", complexity: "standard", lowConfidence: false }, models), "claude-opus-test");
  assert.equal(selectAdaModel({ purpose: "final_review", complexity: "simple", lowConfidence: false }, models), "claude-opus-test");
});

test("Ada uses the vision model for straightforward drawing extraction", () => {
  assert.equal(selectAdaModel({ purpose: "vision", complexity: "standard", lowConfidence: false }, models), "claude-sonnet-test");
});

test("Ada escalates complex or uncertain drawing analysis to Opus", () => {
  assert.equal(selectAdaModel({ purpose: "vision", complexity: "complex", lowConfidence: false }, models), "claude-opus-test");
  assert.equal(selectAdaModel({ purpose: "vision", complexity: "standard", lowConfidence: true }, models), "claude-opus-test");
});
