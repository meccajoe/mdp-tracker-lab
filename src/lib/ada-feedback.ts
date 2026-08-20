export type AdaFeedbackCategory = "bug" | "idea" | "confusing" | "other";

export type AdaFeedbackInput = {
  category: AdaFeedbackCategory;
  message: string;
  workspaceId: string | null;
  pagePath: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set<AdaFeedbackCategory>(["bug", "idea", "confusing", "other"]);

export function parseAdaFeedbackInput(value: unknown): AdaFeedbackInput {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const category = typeof input.category === "string" ? input.category.trim() : "";
  if (!CATEGORIES.has(category as AdaFeedbackCategory)) throw new Error("Choose a valid feedback category.");
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw new Error("A feedback message is required.");
  if (message.length > 2000) throw new Error("Feedback must be 2,000 characters or fewer.");
  const workspaceId = typeof input.workspaceId === "string" && input.workspaceId.trim() ? input.workspaceId.trim() : null;
  if (workspaceId && !UUID_PATTERN.test(workspaceId)) throw new Error("Feedback workspace is invalid.");
  const pagePath = typeof input.pagePath === "string" && input.pagePath.trim() ? input.pagePath.trim().slice(0, 500) : "/ada";
  return { category: category as AdaFeedbackCategory, message, workspaceId, pagePath };
}
