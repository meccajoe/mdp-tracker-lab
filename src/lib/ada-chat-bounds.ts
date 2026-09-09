export const ADA_USER_MAX_CODE_POINTS = 20_000;
export const ADA_USER_MAX_UTF8_BYTES = 80_000;
export const ADA_ASSISTANT_MAX_CODE_POINTS = 100_000;
export const ADA_ASSISTANT_MAX_UTF8_BYTES = 400_000;
export const ADA_COMBINED_PAYLOAD_MAX_UTF8_BYTES = 1_048_576;

const encoder = new TextEncoder();

export type AdaChatBoundsError = {
  code: "user_code_points" | "user_bytes" | "assistant_code_points" | "assistant_bytes" | "payload_type" | "delta_type" | "combined_bytes";
  message: string;
};

const codePoints = (value: string) => Array.from(value).length;
const utf8Bytes = (value: string) => encoder.encode(value).byteLength;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function validateAdaUserRequest(value: string): AdaChatBoundsError | null {
  if (codePoints(value) > ADA_USER_MAX_CODE_POINTS) return { code: "user_code_points", message: "Message content exceeds the technical size limit." };
  if (utf8Bytes(value) > ADA_USER_MAX_UTF8_BYTES) return { code: "user_bytes", message: "Message content exceeds the technical size limit." };
  return null;
}

export function validateAdaAssistantResponse(content: string, payload: unknown, proposalDelta: unknown): AdaChatBoundsError | null {
  if (codePoints(content) > ADA_ASSISTANT_MAX_CODE_POINTS) return { code: "assistant_code_points", message: "Ada response exceeds the technical size limit." };
  if (utf8Bytes(content) > ADA_ASSISTANT_MAX_UTF8_BYTES) return { code: "assistant_bytes", message: "Ada response exceeds the technical size limit." };
  if (!isObject(payload)) return { code: "payload_type", message: "Ada response payload is invalid." };
  if (proposalDelta !== null && proposalDelta !== undefined && !isObject(proposalDelta)) return { code: "delta_type", message: "Ada proposal delta is invalid." };
  const combined = JSON.stringify({ payload, proposalDelta: proposalDelta ?? null });
  if (utf8Bytes(combined) > ADA_COMBINED_PAYLOAD_MAX_UTF8_BYTES) return { code: "combined_bytes", message: "Ada response payload exceeds the technical size limit." };
  return null;
}
