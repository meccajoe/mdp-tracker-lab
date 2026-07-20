const MISSION_CONTROL_ALLOWED_EMAILS = [
  'joe@meccadesign.com',
  'mecca.joe@gmail.com',
] as const;

export function getMissionControlAllowedEmails() {
  return [...MISSION_CONTROL_ALLOWED_EMAILS];
}

export function isMissionControlAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  return MISSION_CONTROL_ALLOWED_EMAILS.includes(email.trim().toLowerCase() as (typeof MISSION_CONTROL_ALLOWED_EMAILS)[number]);
}
