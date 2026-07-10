import crypto from "node:crypto";

const SLACK_REQUEST_TTL_SECONDS = 60 * 5;

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySlackRequest(args: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  signingSecret: string | null | undefined;
  nowSeconds?: number;
}) {
  if (!args.signingSecret || !args.signature || !args.timestamp) {
    return false;
  }

  const timestampNumber = Number(args.timestamp);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > SLACK_REQUEST_TTL_SECONDS) {
    return false;
  }

  const baseString = `v0:${args.timestamp}:${args.rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", args.signingSecret).update(baseString).digest("hex")}`;
  return safeCompare(expected, args.signature);
}
