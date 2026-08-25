export type PostmortemGenerationState = {
  id: string;
  status: string;
  error_message?: string | null;
  narrative?: unknown;
};

export async function pollPostmortemUntilSettled<T extends PostmortemGenerationState>(options: {
  load: () => Promise<T>;
  sleep?: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
}): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const intervalMs = options.intervalMs ?? 3000;
  const maxAttempts = options.maxAttempts ?? 40;
  let latest: T | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await options.load();
    if (latest.status !== "generating") return latest;
    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }
  if (!latest) throw new Error("Post-mortem status could not be loaded.");
  return latest;
}
