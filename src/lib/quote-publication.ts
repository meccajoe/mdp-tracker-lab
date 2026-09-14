import { createHash } from "node:crypto";

export class QuotePublicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotePublicationValidationError";
  }
}

export type QuotePublicationLineInput = {
  lineId: string;
  sortOrder: number;
  sku: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitSellPrice: number;
  amount: number;
  taxabilityStatus: string;
  [key: string]: unknown;
};

export type QuotePublicationInput = {
  workspaceId: string;
  requestedRevisionId: string;
  commercialApprovedRevisionId: string;
  hubspotDealId: string;
  lifecycleStatus: string;
  normalizationStatus: string;
  lockedAt: string | null;
  canonicalManifestHash: string;
  currency: string;
  expectedTotal: number;
  normalizedCommercialLines: QuotePublicationLineInput[];
};

export type QuotePublicationLine = {
  lineId: string;
  sortOrder: number;
  sku: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitSellPrice: number;
  amount: number;
  taxabilityStatus: string;
  currency: "USD";
  approvedRevisionId: string;
  manifestHash: string;
};

export type QuotePublicationCommand = {
  destination: "hubspot";
  operation: "publish_quote";
  workspaceId: string;
  revisionId: string;
  dealId: string;
  currency: "USD";
  expectedTotal: number;
  lines: QuotePublicationLine[];
  payloadHash: string;
  idempotencyKey: string;
};

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function fail(message: string): never {
  throw new QuotePublicationValidationError(message);
}

function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} must not be blank`);
  return value;
}

function nonNegativeFinite(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${field} must be a finite non-negative number`);
  return value;
}

function canonicalize(value: unknown): CanonicalValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value as CanonicalValue;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function prepareQuotePublication(input: QuotePublicationInput): QuotePublicationCommand {
  if (input === null || typeof input !== "object" || Array.isArray(input)) fail("publication input must be an object");

  const workspaceId = requiredText(input.workspaceId, "workspaceId");
  const revisionId = requiredText(input.requestedRevisionId, "requestedRevisionId");
  const approvedRevisionId = requiredText(input.commercialApprovedRevisionId, "commercialApprovedRevisionId");
  const dealId = requiredText(input.hubspotDealId, "hubspotDealId");
  const manifestHash = requiredText(input.canonicalManifestHash, "canonicalManifestHash");

  if (revisionId !== approvedRevisionId) fail("requested revision must be commercially approved");
  if (input.lifecycleStatus !== "commercial_approved") fail("lifecycle must be commercial_approved");
  if (input.normalizationStatus !== "normalized") fail("normalization must be normalized");
  if (typeof input.lockedAt !== "string" || input.lockedAt.trim() === "") fail("revision must be locked");
  if (input.currency !== "USD") fail("currency must be USD");
  const expectedTotal = nonNegativeFinite(input.expectedTotal, "expectedTotal");
  if (!Array.isArray(input.normalizedCommercialLines) || input.normalizedCommercialLines.length === 0) fail("lines must not be empty");

  const sortOrders = new Set<number>();
  let summedAmount = 0;
  const lines = input.normalizedCommercialLines.map((line, index): QuotePublicationLine => {
    if (line === null || typeof line !== "object" || Array.isArray(line)) fail(`line ${index} must be an object`);
    if (!Number.isInteger(line.sortOrder) || line.sortOrder < 0 || sortOrders.has(line.sortOrder)) fail(`line ${index} has invalid sortOrder`);
    sortOrders.add(line.sortOrder);
    const lineId = requiredText(line.lineId, `line ${index} lineId`);
    const sku = requiredText(line.sku, `line ${index} sku`);
    const name = requiredText(line.name, `line ${index} name`);
    const unit = requiredText(line.unit, `line ${index} unit`);
    const taxabilityStatus = requiredText(line.taxabilityStatus, `line ${index} taxabilityStatus`);
    const quantity = nonNegativeFinite(line.quantity, `line ${index} quantity`);
    const unitSellPrice = nonNegativeFinite(line.unitSellPrice, `line ${index} unitSellPrice`);
    const amount = nonNegativeFinite(line.amount, `line ${index} amount`);
    if (typeof line.description !== "string") fail(`line ${index} description must be text`);
    summedAmount += amount;
    return {
      lineId,
      sortOrder: line.sortOrder,
      sku,
      name,
      description: line.description,
      quantity,
      unit,
      unitSellPrice,
      amount,
      taxabilityStatus,
      currency: "USD",
      approvedRevisionId,
      manifestHash,
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder);

  if (Math.abs(summedAmount - expectedTotal) > 0.01) fail("line amounts must equal expectedTotal within $0.01");

  const payload = {
    destination: "hubspot" as const,
    operation: "publish_quote" as const,
    workspaceId,
    revisionId,
    dealId,
    currency: "USD" as const,
    expectedTotal,
    lines,
  };
  return {
    ...payload,
    payloadHash: sha256(payload),
    idempotencyKey: `hubspot:quote_workspace:${encodeURIComponent(workspaceId)}:revision:${encodeURIComponent(revisionId)}:publish_quote:deal:${encodeURIComponent(dealId)}`,
  };
}
