const ADA_ALLOWED_EMAILS = [
  "joe@meccadesign.com",
  "mecca.joe@gmail.com",
] as const;

export function isAdaAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  return ADA_ALLOWED_EMAILS.includes(email.trim().toLowerCase() as (typeof ADA_ALLOWED_EMAILS)[number]);
}
