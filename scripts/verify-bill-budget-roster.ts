import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env.local");
} catch {
  // Production runners may provide environment variables directly.
}

const budgetUuid = process.argv.find((arg) => arg.startsWith("--budget="))?.slice("--budget=".length);
const pmEmail = process.argv.find((arg) => arg.startsWith("--pm="))?.slice("--pm=".length).trim().toLowerCase() ?? null;
if (!budgetUuid) throw new Error("Usage: tsx scripts/verify-bill-budget-roster.ts --budget=<uuid> [--pm=<email>]");

const baseUrl = process.env.BILLCOM_BASE_URL ?? "https://gateway.prod.bill.com/connect";
const apiToken = process.env.BILLCOM_API_TOKEN ?? "";
if (!apiToken) throw new Error("Missing BILL API token");

const ownerEmails = ["paul@meccadesign.com", "emily@meccadesign.com"];
const memberEmails = ["production@meccadesign.com", "rooster@meccadesign.com", pmEmail]
  .filter((email): email is string => Boolean(email) && !ownerEmails.includes(email!));
const expected = [
  ...ownerEmails.map((email) => ({ email, role: "OWNER" })),
  ...[...new Set(memberEmails)].map((email) => ({ email, role: "MEMBER" })),
];

async function getJson(url: string) {
  const response = await fetch(url, { headers: { apiToken, Accept: "application/json" } });
  if (!response.ok) throw new Error(`BILL read failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<{ results?: Array<Record<string, unknown>>; nextPage?: string | null }>;
}

async function main() {
  const users: Array<Record<string, unknown>> = [];
  let nextPage: string | null = null;
  do {
    const url = nextPage
      ? `${baseUrl}/v3/spend/users?nextPage=${encodeURIComponent(nextPage)}`
      : `${baseUrl}/v3/spend/users?limit=200`;
    const page = await getJson(url);
    users.push(...(page.results ?? []));
    nextPage = page.nextPage ?? null;
  } while (nextPage);

  const memberPage = await getJson(`${baseUrl}/v3/spend/budgets/${budgetUuid}/members?max=100`);
  const members = memberPage.results ?? [];
  const rows = expected.map(({ email, role }) => {
    const user = users.find((candidate) => String(candidate.email ?? "").trim().toLowerCase() === email);
    const uuid = String(user?.uuid ?? user?.id ?? "");
    const member = members.find((candidate) => String(candidate.userUuid ?? "") === uuid);
    const actualRole = String(member?.budgetRole ?? "").toUpperCase();
    const requestBased = role === "OWNER" || (
      Number(member?.limit ?? 0) === 0
      && Number(member?.recurringLimit ?? 0) === 0
      && member?.shareBudgetFunds === false
    );
    return {
      email,
      expectedRole: role,
      actualRole,
      present: Boolean(uuid && member),
      limit: member?.limit ?? null,
      recurringLimit: member?.recurringLimit ?? null,
      shareBudgetFunds: member?.shareBudgetFunds ?? null,
      requestBased,
      valid: Boolean(uuid && member && actualRole === role && requestBased),
    };
  });
  console.log(JSON.stringify({ budgetUuid, valid: rows.every((row) => row.valid), roster: rows }, null, 2));
  if (rows.some((row) => !row.valid)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
