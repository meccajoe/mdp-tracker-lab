import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project detail page uses a bell-triggered modal for synced Slack digests and alerts", () => {
  const componentPath = join(process.cwd(), "src/components/project-notification-recommendation-card.tsx");
  const pagePath = join(process.cwd(), "src/app/projects/[id]/page.tsx");

  const componentSource = readFileSync(componentPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(componentSource, /\/api\/projects\/\$\{projectId\}\/copilot\/notification-recommendation/, "component should post to the notification recommendation API route");
  assert.match(componentSource, /Get recommendation/i, "component should expose a call-to-action button");
  assert.match(componentSource, /Recommended thresholds|defaultSections|spotlight/i, "component should render recommendation details");
  assert.match(componentSource, /Slack digests and alerts/i, "component should present itself as a Slack digests and alerts manager");
  assert.match(componentSource, /same Slack digests and alerts|same digests and alerts/i, "component should explain that web and Slack manage the same subscriptions");
  assert.doesNotMatch(componentSource, /CardTitle[\s\S]*Slack digests and alerts/i, "component should not repeat the modal title inside the body");
  assert.match(componentSource, /response\.text\(\)|parseApiResponse/, "component should handle non-JSON API failures without surfacing raw JSON parse errors");
  assert.match(componentSource, /space-y-5|space-y-6/, "component should use roomier vertical spacing between inner sections");

  assert.match(pageSource, /project-notification-recommendation-card/i, "project detail page should import the recommendation component");
  assert.match(pageSource, /Bell/, "project detail page should import or render a bell icon for the trigger");
  assert.match(pageSource, /DialogTrigger[\s\S]*aria-label=\"Open Slack digests and alerts\"/, "page should expose a bell-style modal trigger with a Slack-specific label");
  assert.match(pageSource, /DialogTitle>[\s\S]*Slack digests and alerts/i, "page should render a Slack digests and alerts modal title");
  assert.match(pageSource, /DialogContent[\s\S]*<ProjectNotificationRecommendationCard[\s\S]*projectId=\{projectId\}[\s\S]*project=\{project\}/, "page should render the recommendation component inside dialog content");
  assert.equal((pageSource.match(/<ProjectNotificationRecommendationCard/g) ?? []).length, 1, "page should render exactly one recommendation component instance");
});
