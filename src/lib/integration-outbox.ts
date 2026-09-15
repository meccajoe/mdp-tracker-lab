export class PublicationReconciliationValidationError extends Error {
  constructor(message = "Publication reconciliation input is invalid.") {
    super(message);
    this.name = "PublicationReconciliationValidationError";
  }
}

export type PublicationReconciliationInput = {
  currentStatus: string;
  currentLeaseOwner: string | null;
  expectedLeaseOwner: string | null;
  payloadHash: string;
  externalIdentity: string;
  readbackJson: unknown;
  readbackHash: string;
};

export type PublicationReconciliationUpdate = {
  status: "succeeded" | "terminal_failed";
  reconciliationStatus: "verified" | "drifted";
  externalIdentity: string;
  externalReadbackJson: Record<string, unknown>;
  externalReadbackHash: string;
  reconciledAt: null;
  completedAt: "set_by_database" | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

const SHA256 = /^[0-9a-f]{64}$/;
const CREDENTIAL_KEY = /(authorization|token|password|secret|api.?key|connection.?string|credential|cookie)/i;
const CREDENTIAL_VALUE = /(bearer\s+[a-z0-9._-]{8,}|postgres(?:ql)?:\/\/|sk-[a-z0-9_-]{8,}|(?:password|secret|token|credential)\s*[:=])/i;

function invalid(): never {
  throw new PublicationReconciliationValidationError();
}

function containsCredentialMaterial(value: unknown): boolean {
  if (typeof value === "string") return value !== "[REDACTED]" && CREDENTIAL_VALUE.test(value);
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => CREDENTIAL_KEY.test(key) || containsCredentialMaterial(child));
  }
  return false;
}

function isJsonCompatible(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonCompatible);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    Object.entries(value).every(([key, child]) => key !== "__proto__" && isJsonCompatible(child));
}

export function preparePublicationReconciliationUpdate(
  input: PublicationReconciliationInput,
): PublicationReconciliationUpdate {
  if (
    input === null || typeof input !== "object" ||
    input.currentStatus !== "processing" ||
    typeof input.currentLeaseOwner !== "string" || input.currentLeaseOwner.trim() === "" || input.currentLeaseOwner !== input.currentLeaseOwner.trim() ||
    typeof input.expectedLeaseOwner !== "string" || input.expectedLeaseOwner.trim() === "" || input.expectedLeaseOwner !== input.expectedLeaseOwner.trim() ||
    input.currentLeaseOwner !== input.expectedLeaseOwner ||
    !SHA256.test(input.payloadHash) || !SHA256.test(input.readbackHash) ||
    typeof input.externalIdentity !== "string" || input.externalIdentity.trim() === "" || input.externalIdentity !== input.externalIdentity.trim() ||
    input.readbackJson === null || typeof input.readbackJson !== "object" || Array.isArray(input.readbackJson) ||
    !isJsonCompatible(input.readbackJson) ||
    containsCredentialMaterial(input.readbackJson)
  ) invalid();

  let readback: Record<string, unknown>;
  try {
    readback = structuredClone(input.readbackJson) as Record<string, unknown>;
  } catch {
    invalid();
  }
  const matches = input.payloadHash === input.readbackHash;
  return {
    status: matches ? "succeeded" : "terminal_failed",
    reconciliationStatus: matches ? "verified" : "drifted",
    externalIdentity: input.externalIdentity,
    externalReadbackJson: readback,
    externalReadbackHash: input.readbackHash,
    reconciledAt: null,
    completedAt: matches ? "set_by_database" : null,
    lastErrorCode: matches ? null : "PUBLICATION_READBACK_HASH_MISMATCH",
    lastErrorMessage: matches ? null : "Publication read-back hash did not match the prepared payload.",
  };
}
