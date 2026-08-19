import assert from "node:assert/strict";
import test from "node:test";

import { initialAdaFollowState, reduceAdaFollowState } from "./ada-scroll-intent";

test("a submitted turn explicitly starts following at the live edge", () => {
  assert.deepEqual(reduceAdaFollowState({ following: false, unseen: true }, { type: "submit" }), { following: true, unseen: false });
});

test("reader interactions pause following without stopping the stream", () => {
  for (const intent of ["scroll_away", "selection", "keyboard", "link", "search"] as const) {
    assert.deepEqual(reduceAdaFollowState(initialAdaFollowState, { type: intent }), { following: false, unseen: false });
  }
});

test("offscreen deltas show unseen content and never steal position", () => {
  const paused = { following: false, unseen: false };
  assert.deepEqual(reduceAdaFollowState(paused, { type: "stream_delta" }), { following: false, unseen: true });
});

test("jump to latest resumes following and clears unseen state", () => {
  assert.deepEqual(reduceAdaFollowState({ following: false, unseen: true }, { type: "jump_latest" }), { following: true, unseen: false });
});

test("manual arrival at the live edge resumes following", () => {
  assert.deepEqual(reduceAdaFollowState({ following: false, unseen: true }, { type: "reach_live_edge" }), { following: true, unseen: false });
});
