import assert from "node:assert/strict";
import test from "node:test";
import {
  getLaborServiceItemTag,
  getLaborWorkGroup,
  listLaborServiceItemTags,
  matchesLaborServiceItemTag,
} from "./labor-service-item";

test("normalizes QBO service items into stable visible tags", () => {
  assert.deepEqual(getLaborServiceItemTag(" graph labor "), {
    value: "GRAPHICS LABOR",
    label: "Graphics Labor",
    group: "shop",
  });
  assert.deepEqual(getLaborServiceItemTag(null), {
    value: "UNCLASSIFIED",
    label: "Unclassified",
    group: "unclassified",
  });
});

test("keeps design, shop, install, and dismantle work separate", () => {
  assert.equal(getLaborWorkGroup("DESIGN LABOR"), "design");
  assert.equal(getLaborWorkGroup("PAINT LABOR"), "shop");
  assert.equal(getLaborWorkGroup("INSTALL LABOR"), "install");
  assert.equal(getLaborWorkGroup("I&D LABOR"), "install");
  assert.equal(getLaborWorkGroup("DISMANTLE LABOR"), "dismantle");
  assert.equal(getLaborWorkGroup("STRIKE LABOR"), "dismantle");
  assert.equal(getLaborWorkGroup(null), "unclassified");
});

test("lists and filters canonical service-item tags without losing unclassified rows", () => {
  const entries = [
    { service_item: "PAINT LABOR" },
    { service_item: "graph labor" },
    { service_item: "GRAPHICS LABOR" },
    { service_item: null },
  ];
  assert.deepEqual(listLaborServiceItemTags(entries).map((tag) => tag.value), [
    "GRAPHICS LABOR",
    "PAINT LABOR",
    "UNCLASSIFIED",
  ]);
  assert.equal(matchesLaborServiceItemTag(entries[1].service_item, "GRAPHICS LABOR"), true);
  assert.equal(matchesLaborServiceItemTag(entries[3].service_item, "UNCLASSIFIED"), true);
  assert.equal(matchesLaborServiceItemTag("PAINT LABOR", "all"), true);
});
