import assert from "node:assert/strict";
import test from "node:test";
import { isFormatUuid } from "./quote-proposal-persistence";

test("accepts RFC-compatible UUID format including v7 and nil UUIDs", () => {
  assert.equal(isFormatUuid("018f6f46-7b2c-7abc-8def-0123456789ab"), true);
  assert.equal(isFormatUuid("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isFormatUuid("ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"), true);
});

test("rejects malformed UUIDs without enforcing version or variant", () => {
  for (const value of [
    "not-a-uuid",
    "018f6f46-7b2c-7abc-8def-0123456789ag",
    "018f6f46-7b2c-7abc-8def-0123456789a",
    "018f6f46-7b2c-7abc-8def-0123456789ab-extra",
    "{018f6f46-7b2c-7abc-8def-0123456789ab}",
    42,
    null,
  ]) assert.equal(isFormatUuid(value), false);
});
