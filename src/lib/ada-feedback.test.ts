import assert from "node:assert/strict";
import test from "node:test";

import { parseAdaFeedbackInput } from "./ada-feedback";

test("Ada accepts concise categorized feedback with optional workspace context", () => {
  assert.deepEqual(parseAdaFeedbackInput({ category: "bug", message: "  Quote pane clipped on iPad.  ", workspaceId: "2c57a51f-ee2b-4cbc-bafc-43317f95afde", pagePath: "/ada/2c57a51f-ee2b-4cbc-bafc-43317f95afde" }), {
    category: "bug",
    message: "Quote pane clipped on iPad.",
    workspaceId: "2c57a51f-ee2b-4cbc-bafc-43317f95afde",
    pagePath: "/ada/2c57a51f-ee2b-4cbc-bafc-43317f95afde",
  });
});

test("Ada rejects empty, oversized, or unsupported feedback", () => {
  assert.throws(() => parseAdaFeedbackInput({ category: "bug", message: "" }), /feedback message/i);
  assert.throws(() => parseAdaFeedbackInput({ category: "praise", message: "Nice" }), /feedback category/i);
  assert.throws(() => parseAdaFeedbackInput({ category: "idea", message: "x".repeat(2001) }), /2,000 characters/i);
  assert.throws(() => parseAdaFeedbackInput({ category: "other", message: "Valid", workspaceId: "not-a-uuid" }), /workspace/i);
});
