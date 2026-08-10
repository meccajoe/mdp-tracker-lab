import assert from "node:assert/strict";
import test from "node:test";

const serviceItems = await import(`../src/lib/labor-service-item.ts?test=${Date.now()}`);

test("normalizes QBO Time Graph Labor to Graphics Labor", () => {
  assert.equal(serviceItems.normalizeLaborServiceItem("GRAPH LABOR"), "GRAPHICS LABOR");
  assert.equal(serviceItems.normalizeLaborServiceItem("SHOP LABOR"), "SHOP LABOR");
  assert.equal(serviceItems.normalizeLaborServiceItem(null), null);
});
