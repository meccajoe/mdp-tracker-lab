import assert from "node:assert/strict";
import test from "node:test";

import { getTimelinePresentation } from "./countdown-clock.tsx";

test("completed projects close timeline tracking instead of counting days overdue", () => {
  assert.deepEqual(getTimelinePresentation("Completed"), {
    label: "Completed",
    detail: "Schedule tracking closed",
    tracksSchedule: false,
  });
});

test("active projects retain the live countdown", () => {
  assert.deepEqual(getTimelinePresentation("Active"), {
    label: "Active",
    detail: "Schedule tracking active",
    tracksSchedule: true,
  });
});

test("pending and on-hold projects do not report an active deadline", () => {
  assert.equal(getTimelinePresentation("Pending").tracksSchedule, false);
  assert.equal(getTimelinePresentation("On Hold").tracksSchedule, false);
});
