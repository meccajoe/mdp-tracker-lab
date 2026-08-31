import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const card = readFileSync("src/components/project-postmortem-card.tsx", "utf8");
const getRoute = readFileSync("src/app/api/projects/[id]/postmortem/route.ts", "utf8");
const projectPage = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
const editPage = readFileSync("src/app/projects/[id]/edit/page.tsx", "utf8");

test("post-mortem browser reads and mutations use bearer-aware fetches", () => {
  assert.match(card, /authenticatedFetch\(`/);
  assert.match(card, /postmortem\/generate/);
  assert.match(projectPage, /authenticatedFetch\(`/);
  assert.match(editPage, /authenticatedFetch\(`/);
});

test("post-mortem read route passes the browser request to bearer-aware authorization", () => {
  assert.match(getRoute, /requireProjectAdmin\(request\)/);
});
