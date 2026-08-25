import assert from "node:assert/strict";
import test from "node:test";
import { pollPostmortemUntilSettled } from "./project-postmortem-poll.ts";

test("polls past an early generating response until the saved draft arrives", async () => {
  const responses = [
    { id: "run-1", status: "generating" },
    { id: "run-1", status: "generating" },
    { id: "run-1", status: "draft", narrative: { executive_summary: "Saved" } },
  ];
  let attempts = 0;
  const result = await pollPostmortemUntilSettled({
    load: async () => responses[Math.min(attempts++, responses.length - 1)],
    sleep: async () => {},
    maxAttempts: 5,
  });
  assert.equal(attempts, 3);
  assert.equal(result.status, "draft");
});

test("returns a persisted failure instead of polling forever", async () => {
  const result = await pollPostmortemUntilSettled({
    load: async () => ({ id: "run-2", status: "failed", error_message: "model failed" }),
    sleep: async () => {},
    maxAttempts: 5,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.error_message, "model failed");
});
