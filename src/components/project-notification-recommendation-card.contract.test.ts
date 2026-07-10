import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project detail page exposes a notification recommendation preview card wired to the new API route", () => {
  const componentPath = join(process.cwd(), "src/components/project-notification-recommendation-card.tsx");
  const pagePath = join(process.cwd(), "src/app/projects/[id]/page.tsx");

  const componentSource = readFileSync(componentPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(componentSource, /\/api\/projects\/\$\{projectId\}\/copilot\/notification-recommendation/, "component should post to the notification recommendation API route");
  assert.match(componentSource, /Notification recommendation preview/i, "component should render preview card copy");
  assert.match(componentSource, /Get recommendation/i, "component should expose a call-to-action button");
  assert.match(componentSource, /Use 95 hrs|Use \$34,000|Recommended thresholds|defaultSections|spotlight/i, "component should render recommendation details");

  assert.match(pageSource, /project-notification-recommendation-card/i, "project detail page should import the preview card component");
  assert.match(pageSource, /<ProjectNotificationRecommendationCard[\s\S]*projectId=\{projectId\}[\s\S]*project=\{project\}/, "project detail page should render the preview card with the current project context");
});
