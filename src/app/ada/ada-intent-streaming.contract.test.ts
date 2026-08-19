import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const conversation = join(root, "src/lib/ada-conversation.ts");
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts");
const detail = join(root, "src/components/ada-workspace-detail.tsx");
const scroller = join(root, "src/components/ada-conversation-scroller.tsx");
const rail = join(root, "src/components/ada-conversation-rail.tsx");

test("Ada streams natural text before validated turn controls", () => {
  const source = readFileSync(conversation, "utf8");
  assert.match(source, /streamAdaConversation/);
  assert.match(source, /client\.messages\.stream/);
  assert.match(source, /finalize_ada_turn/);
  assert.match(source, /onTextDelta/);
  assert.match(source, /tool_use/);
});

test("the authenticated message route returns typed NDJSON and persists only the final answer", () => {
  const source = readFileSync(route, "utf8");
  assert.match(source, /application\/x-ndjson/);
  assert.match(source, /ReadableStream/);
  assert.match(source, /type: "status"/);
  assert.match(source, /type: "delta"/);
  assert.match(source, /type: "final"/);
  assert.match(source, /createAdaRevisionFromInstruction/);
  assert.match(source, /response_json/);
  assert.doesNotMatch(source, /abortSignal: request\.signal/);
});

test("the client renders incremental Markdown and completes from the canonical final event", () => {
  const source = readFileSync(detail, "utf8");
  assert.match(source, /response\.body\.getReader/);
  assert.match(source, /AdaNdjsonDecoder/);
  assert.match(source, /streamedText/);
  assert.match(source, /streamEvent\.type === "delta"/);
  assert.match(source, /streamEvent\.type === "final"/);
  assert.match(source, /AdaMessageMarkdown content=\{streamedText\}/);
});

test("Ada follows reader intent and exposes a navigable conversation rail", () => {
  assert.ok(existsSync(scroller));
  assert.ok(existsSync(rail));
  const scrollerSource = readFileSync(scroller, "utf8");
  const railSource = readFileSync(rail, "utf8");
  assert.match(scrollerSource, /selectionchange/);
  assert.match(scrollerSource, /ResizeObserver/);
  assert.match(scrollerSource, /Jump to latest/);
  assert.match(scrollerSource, /content-visibility/);
  assert.match(scrollerSource, /localStorage/);
  assert.match(scrollerSource, /scroll(To|IntoView)/);
  assert.match(railSource, /aria-label/);
  assert.match(railSource, /data-active/);
  assert.match(railSource, /md:/);
  assert.match(railSource, /Jump to turn/);
});
