export type LaborWorkGroup = "design" | "shop" | "install" | "dismantle" | "unclassified";

export interface LaborServiceItemTag {
  value: string;
  label: string;
  group: LaborWorkGroup;
}

export function normalizeLaborServiceItem(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized || normalized === "UNASSIGNED") return null;
  return normalized === "GRAPH LABOR" ? "GRAPHICS LABOR" : normalized;
}

export function getLaborWorkGroup(value: string | null | undefined): LaborWorkGroup {
  const normalized = normalizeLaborServiceItem(value);
  if (!normalized) return "unclassified";
  if (normalized === "DESIGN LABOR") return "design";
  if (normalized.includes("DISMANTLE") || normalized.includes("STRIKE")) return "dismantle";
  if (normalized === "I&D LABOR" || normalized.includes("INSTALL")) return "install";
  return "shop";
}

function humanizeServiceItem(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace("I&d", "I&D")
    .replace("Cnc", "CNC");
}

export function getLaborServiceItemTag(value: string | null | undefined): LaborServiceItemTag {
  const normalized = normalizeLaborServiceItem(value);
  if (!normalized) return { value: "UNCLASSIFIED", label: "Unclassified", group: "unclassified" };
  return {
    value: normalized,
    label: humanizeServiceItem(normalized),
    group: getLaborWorkGroup(normalized),
  };
}

export function listLaborServiceItemTags(entries: Array<{ service_item?: string | null }>): LaborServiceItemTag[] {
  const tags = new Map<string, LaborServiceItemTag>();
  for (const entry of entries) {
    const tag = getLaborServiceItemTag(entry.service_item);
    tags.set(tag.value, tag);
  }
  return [...tags.values()].sort((a, b) => {
    if (a.group === "unclassified") return 1;
    if (b.group === "unclassified") return -1;
    return a.label.localeCompare(b.label);
  });
}

export function matchesLaborServiceItemTag(value: string | null | undefined, selectedTag: string): boolean {
  return selectedTag === "all" || getLaborServiceItemTag(value).value === selectedTag;
}
