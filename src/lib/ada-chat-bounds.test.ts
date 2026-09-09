import assert from "node:assert/strict";
import test from "node:test";
import {
  ADA_ASSISTANT_MAX_CODE_POINTS,
  ADA_ASSISTANT_MAX_UTF8_BYTES,
  ADA_COMBINED_PAYLOAD_MAX_UTF8_BYTES,
  ADA_USER_MAX_CODE_POINTS,
  ADA_USER_MAX_UTF8_BYTES,
  validateAdaAssistantResponse,
  validateAdaUserRequest,
} from "./ada-chat-bounds.ts";

const astral = (count: number) => "😀".repeat(count);
const byteExactAstral = (maxBytes: number) => "😀".repeat(maxBytes / 4);

test("accepts exact Unicode code-point and UTF-8 ceilings", () => {
  assert.equal(validateAdaUserRequest("x".repeat(ADA_USER_MAX_CODE_POINTS)), null);
  assert.equal(validateAdaUserRequest(astral(ADA_USER_MAX_CODE_POINTS)), null);
  assert.equal(validateAdaUserRequest(astral(ADA_USER_MAX_CODE_POINTS + 1))?.code, "user_code_points");
  assert.equal(new TextEncoder().encode(byteExactAstral(ADA_USER_MAX_UTF8_BYTES)).byteLength, ADA_USER_MAX_UTF8_BYTES);
  assert.equal(validateAdaUserRequest(byteExactAstral(ADA_USER_MAX_UTF8_BYTES)), null);
});

test("rejects byte-heavy input at the byte boundary when code points are otherwise valid", () => {
  const value = astral(ADA_USER_MAX_CODE_POINTS) + "x";
  assert.equal(Array.from(value).length, ADA_USER_MAX_CODE_POINTS + 1);
  assert.equal(validateAdaUserRequest(value)?.code, "user_code_points");
});

test("enforces assistant content and combined payload byte ceilings", () => {
  assert.equal(validateAdaAssistantResponse(astral(ADA_ASSISTANT_MAX_CODE_POINTS), {}, null), null);
  assert.equal(validateAdaAssistantResponse(astral(ADA_ASSISTANT_MAX_CODE_POINTS + 1), {}, null)?.code, "assistant_code_points");
  assert.equal(validateAdaAssistantResponse(byteExactAstral(ADA_ASSISTANT_MAX_UTF8_BYTES), {}, null), null);
  const oversizedDelta = { text: "x".repeat(ADA_COMBINED_PAYLOAD_MAX_UTF8_BYTES) };
  assert.equal(validateAdaAssistantResponse("ok", {}, oversizedDelta)?.code, "combined_bytes");
});
