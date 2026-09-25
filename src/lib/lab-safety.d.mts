export const LAB_PROJECT_REF: string;
export const LAB_SUPABASE_URL: string;
export function assertLabEnvironment(env: Record<string, string | undefined>): void;
export function isLabBlockedPath(pathname: string): boolean;
