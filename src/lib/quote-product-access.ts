const QUOTE_PRODUCT_ALLOWED_EMAILS = [
  "joe@meccadesign.com",
  "paul@meccadesign.com",
  "mecca.joe@gmail.com",
] as const;

export function isQuoteProductAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  return QUOTE_PRODUCT_ALLOWED_EMAILS.includes(
    email.trim().toLowerCase() as (typeof QUOTE_PRODUCT_ALLOWED_EMAILS)[number],
  );
}
