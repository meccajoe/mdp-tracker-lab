export interface MaterialAliasRecord {
  id?: string;
  alias_text: string;
  normalized_alias_text?: string | null;
}

export interface MaterialMatchRecord {
  id: string;
  canonical_name: string;
  category: string | null;
  dimensions: string | null;
  thickness_text: string | null;
  material_aliases?: MaterialAliasRecord[] | null;
}

export interface MaterialMatchInput {
  materialName: string | null;
  category: string | null;
  dimensions: string | null;
  thicknessText: string | null;
}

export interface MaterialMatchCandidate {
  material_id: string;
  label: string;
  matched_by: "canonical" | "alias";
  confidence: number;
  alias_text?: string | null;
}

export interface MaterialMatchResult {
  suggested_material_id: string | null;
  suggested_material_label: string | null;
  matched_by: "canonical" | "alias" | "new_candidate" | "ambiguous";
  confidence: number;
  requires_review: boolean;
  review_reasons: string[];
  candidates: MaterialMatchCandidate[];
}

function normalizeMaterialText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeMaterialText(left);
  const normalizedRight = normalizeMaterialText(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function scoreMaterialCandidate(input: MaterialMatchInput, material: MaterialMatchRecord): MaterialMatchCandidate | null {
  const inputName = normalizeMaterialText(input.materialName);
  if (!inputName) return null;

  const inputCategory = normalizeMaterialText(input.category);
  const inputDimensions = normalizeMaterialText(input.dimensions);
  const inputThickness = normalizeMaterialText(input.thicknessText);

  const canonicalName = normalizeMaterialText(material.canonical_name);
  const materialCategory = normalizeMaterialText(material.category);
  const materialDimensions = normalizeMaterialText(material.dimensions);
  const materialThickness = normalizeMaterialText(material.thickness_text);

  const nameExact = inputName === canonicalName;
  const categoryExact = Boolean(inputCategory) && inputCategory === materialCategory;
  const dimensionsExact = Boolean(inputDimensions) && inputDimensions === materialDimensions;
  const thicknessExact = Boolean(inputThickness) && inputThickness === materialThickness;

  let best: MaterialMatchCandidate | null = null;

  if (nameExact) {
    let confidence = 48;
    if (categoryExact) confidence += 22;
    if (dimensionsExact) confidence += 10;
    if (thicknessExact) confidence += 8;

    best = {
      material_id: material.id,
      label: material.canonical_name,
      matched_by: "canonical",
      confidence,
    };
  }

  for (const alias of material.material_aliases ?? []) {
    const normalizedAlias = normalizeMaterialText(alias.normalized_alias_text ?? alias.alias_text);
    if (!normalizedAlias || normalizedAlias !== inputName) continue;

    let confidence = 46;
    if (categoryExact) confidence += 22;
    if (dimensionsExact) confidence += 10;
    if (thicknessExact) confidence += 8;

    const aliasCandidate: MaterialMatchCandidate = {
      material_id: material.id,
      label: material.canonical_name,
      matched_by: "alias",
      confidence,
      alias_text: alias.alias_text,
    };

    if (!best || aliasCandidate.confidence > best.confidence) {
      best = aliasCandidate;
    }
  }

  return best;
}

export function matchMaterialCandidate(input: MaterialMatchInput, materials: MaterialMatchRecord[]): MaterialMatchResult {
  const candidates = materials
    .map((material) => scoreMaterialCandidate(input, material))
    .filter(Boolean)
    .sort((left, right) => (right?.confidence ?? 0) - (left?.confidence ?? 0)) as MaterialMatchCandidate[];

  if (candidates.length === 0) {
    return {
      suggested_material_id: null,
      suggested_material_label: null,
      matched_by: "new_candidate",
      confidence: 0,
      requires_review: false,
      review_reasons: [],
      candidates: [],
    };
  }

  const [best, second] = candidates;

  if (best.confidence >= 70 && second && second.confidence >= 70 && Math.abs(best.confidence - second.confidence) <= 4 && best.material_id !== second.material_id) {
    return {
      suggested_material_id: best.material_id,
      suggested_material_label: best.label,
      matched_by: "ambiguous",
      confidence: best.confidence,
      requires_review: true,
      review_reasons: ["ambiguous_material_match"],
      candidates: candidates.slice(0, 5),
    };
  }

  if (best.confidence >= 70) {
    return {
      suggested_material_id: best.material_id,
      suggested_material_label: best.label,
      matched_by: best.matched_by,
      confidence: best.confidence,
      requires_review: false,
      review_reasons: [],
      candidates: candidates.slice(0, 5),
    };
  }

  if (best.confidence >= 60) {
    return {
      suggested_material_id: best.material_id,
      suggested_material_label: best.label,
      matched_by: best.matched_by,
      confidence: best.confidence,
      requires_review: true,
      review_reasons: ["low_confidence_material_match"],
      candidates: candidates.slice(0, 5),
    };
  }

  return {
    suggested_material_id: null,
    suggested_material_label: null,
    matched_by: "new_candidate",
    confidence: best.confidence,
    requires_review: false,
    review_reasons: [],
    candidates: candidates.slice(0, 5),
  };
}

export function shouldCaptureMaterialAlias(importedName: string | null | undefined, canonicalName: string | null | undefined): boolean {
  const imported = normalizeMaterialText(importedName);
  const canonical = normalizeMaterialText(canonicalName);
  return Boolean(imported) && Boolean(canonical) && imported !== canonical;
}

export function sameMaterialText(left: string | null | undefined, right: string | null | undefined): boolean {
  return sameText(left, right);
}
