import assert from "node:assert/strict";
import test from "node:test";
import { parseAdaConversationResponse } from "@/lib/ada-conversation";

const allowed = new Set(["asset:asset-1", "materials:mat-1"]);

test("Ada accepts a grounded conversational response", () => {
  const response = parseAdaConversationResponse(JSON.stringify({
    message: "I’d build the wall in SEG fabric. The current drawing still needs a confirmed finished width.",
    citations: [{ sourceId: "asset:asset-1", label: "Drawing.pdf", page: 2 }, { sourceId: "materials:mat-1", label: "SEG Fabric" }],
    needsInput: ["What is the finished wall width?"],
    quoteAction: "none",
    limitations: ["No confirmed finished width."],
  }), allowed);
  assert.equal(response.quoteAction, "none");
  assert.equal(response.citations[0].page, 2);
  assert.equal(response.needsInput.length, 1);
});

test("Ada rejects a citation that was not supplied in authorized context", () => {
  assert.throws(() => parseAdaConversationResponse(JSON.stringify({
    message: "Use this price.", citations: [{ sourceId: "expenses:other-client", label: "Other client" }], needsInput: [], quoteAction: "none", limitations: [],
  }), allowed), /unsupported citation/i);
});

test("Ada limits clarification requests to the highest-leverage question", () => {
  const response = parseAdaConversationResponse(JSON.stringify({
    message: "I need one decision before pricing this responsibly.", citations: [], needsInput: ["Width?", "Finish?", "Install date?"], quoteAction: "none", limitations: [],
  }), allowed);
  assert.deepEqual(response.needsInput, ["Width?"]);
});

test("Ada requires a revision instruction when proposing a quote revision", () => {
  assert.throws(() => parseAdaConversationResponse(JSON.stringify({
    message: "I’ll revise it.", citations: [], needsInput: [], quoteAction: "propose_revision", limitations: [],
  }), allowed), /revision instruction/i);
});
