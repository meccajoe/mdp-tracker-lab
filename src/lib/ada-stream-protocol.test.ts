import assert from "node:assert/strict";
import test from "node:test";

import { AdaNdjsonDecoder, encodeAdaStreamEvent } from "./ada-stream-protocol";

test("Ada decodes streaming events across arbitrary network chunks", () => {
  const decoder = new AdaNdjsonDecoder();
  const payload = [
    encodeAdaStreamEvent({ type: "status", phase: "responding", label: "Ada is responding…" }),
    encodeAdaStreamEvent({ type: "delta", text: "Hello " }),
    encodeAdaStreamEvent({ type: "delta", text: "world" }),
  ].join("");
  const split = 5;
  assert.deepEqual(decoder.push(payload.slice(0, split)), []);
  const events = decoder.push(payload.slice(split));
  assert.deepEqual(events.map((event) => event.type), ["status", "delta", "delta"]);
  assert.deepEqual(decoder.finish(), []);
});

test("Ada preserves one canonical final event", () => {
  const decoder = new AdaNdjsonDecoder();
  const final = { type: "final" as const, response: { userMessage: { id: "user-1" }, assistantMessage: { id: "assistant-1" }, revision: null, revisionDelta: null } };
  assert.deepEqual(decoder.push(encodeAdaStreamEvent(final)), [final]);
});

test("Ada rejects malformed stream events instead of executing them", () => {
  const decoder = new AdaNdjsonDecoder();
  assert.throws(() => decoder.push('{"type":"delta","text":42}\n'), /invalid Ada stream event/i);
});
