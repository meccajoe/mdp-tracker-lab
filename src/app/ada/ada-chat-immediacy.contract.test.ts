import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/components/ada-workspace-detail.tsx"), "utf8");

test("Ada immediately shows the submitted user message while she works", () => {
  assert.match(source, /optimisticMessage/);
  assert.match(source, /setOptimisticMessage\(\{ id: clientRequestId, content: submittedMessage \}\)/);
  assert.match(source, /Gathering Tracker context/);
  assert.match(source, /AdaConversationScroller/);
  assert.match(source, /setDraft\(""\)/);
  assert.match(source, /setOptimisticMessage\(null\)/);
});

test("Ada preserves a separate composer draft for every workspace", () => {
  assert.match(source, /ada:draft:/);
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /localStorage\.removeItem/);
  assert.match(source, /workspaceId/);
});

test("Ada restores the submitted text when a turn fails", () => {
  assert.match(source, /setDraft\(submittedMessage\)/);
  assert.match(source, /Ada could not complete this chat turn/);
});

test("Ada keeps the conversation visible when a turn fails", () => {
  assert.match(source, /error && !detail/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Dismiss/);
});
