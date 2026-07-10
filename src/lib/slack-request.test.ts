import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { verifySlackRequest } from "./slack-request.ts";

test("verifySlackRequest accepts a valid Slack signature", () => {
  const rawBody = "token=abc&text=%2Fproject+26144+summary";
  const timestamp = "1700000000";
  const signingSecret = "secret-value";
  const signature = `v0=${crypto.createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

  assert.equal(verifySlackRequest({ rawBody, timestamp, signature, signingSecret, nowSeconds: 1700000001 }), true);
});

test("verifySlackRequest rejects stale or invalid Slack signatures", () => {
  assert.equal(
    verifySlackRequest({
      rawBody: "token=abc",
      timestamp: "1700000000",
      signature: "v0=bad",
      signingSecret: "secret-value",
      nowSeconds: 1700001000,
    }),
    false
  );
});
