export type AdaStreamPhase = "context" | "evidence" | "responding" | "updating_quote";

export type AdaStreamEvent =
  | { type: "status"; phase: AdaStreamPhase; label: string }
  | { type: "delta"; text: string }
  | { type: "final"; response: Record<string, unknown> }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAdaStreamEvent(value: unknown): AdaStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid Ada stream event.");
  if (value.type === "status" && ["context", "evidence", "responding", "updating_quote"].includes(String(value.phase)) && typeof value.label === "string") {
    return { type: "status", phase: value.phase as AdaStreamPhase, label: value.label };
  }
  if (value.type === "delta" && typeof value.text === "string") return { type: "delta", text: value.text };
  if (value.type === "final" && isRecord(value.response)) return { type: "final", response: value.response };
  if (value.type === "error" && typeof value.message === "string") return { type: "error", message: value.message };
  throw new Error("Invalid Ada stream event.");
}

export function encodeAdaStreamEvent(event: AdaStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export class AdaNdjsonDecoder {
  private buffer = "";

  push(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.filter(Boolean).map((line) => parseAdaStreamEvent(JSON.parse(line)));
  }

  finish() {
    const remainder = this.buffer.trim();
    this.buffer = "";
    return remainder ? [parseAdaStreamEvent(JSON.parse(remainder))] : [];
  }
}
