/**
 * Blood-work flags:
 * - documentFlagsRisk: lab printed H/L, abnormal, etc.
 * - Outside reference range [refMin, refMax]
 * - Inside range but within the inner 10% band at the low or high edge ("near" out of range)
 * When only one reference bound exists, only strict outside is applied (+ document / model fallback).
 */

export type ParsedBloodMarkerInput = {
  category?: string | null;
  name: string;
  value: number;
  unit: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  /** Lab "Flag" column as printed (H, L, High, Low, *). If present, row is flagged when H/L (etc.). */
  labFlag?: string | null;
  flagged?: boolean;
  documentFlagsRisk?: boolean;
};

/** True when the lab's Flag column marks the result abnormal (high/low). */
export function labFlagIndicatesRisk(flag: string | null | undefined): boolean {
  if (flag == null || typeof flag !== "string") return false;
  const t = flag.trim();
  if (!t || /^none$/i.test(t) || /^normal$/i.test(t) || /^n\/a$/i.test(t)) return false;
  const u = t.toUpperCase();
  if (u === "H" || u === "L" || u === "HH" || u === "LL") return true;
  if (/^H+$/.test(u) || /^L+$/.test(u)) return true;
  if (/\bHIGH\b/.test(u) || /\bLOW\b/.test(u)) return true;
  if (u === "*" || u === "A" || u === "ABN" || u === "ABNORMAL") return true;
  return false;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const t = v.trim().replace(/,/g, "");
    const lead = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(t);
    if (lead) {
      const n = Number(lead[1]);
      if (Number.isFinite(n)) return n;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strField(o: Record<string, unknown>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = o[c];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const byLower = new Map(
    Object.keys(o).map((k) => [k.toLowerCase(), k] as const),
  );
  for (const c of candidates) {
    const k = byLower.get(c.toLowerCase());
    if (!k) continue;
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** First numeric field among candidates (case-insensitive key match on `o`). */
function numField(o: Record<string, unknown>, ...candidates: string[]): number | null {
  const lowerToActual = new Map(
    Object.keys(o).map((k) => [k.toLowerCase(), k] as const),
  );
  for (const c of candidates) {
    const actual = lowerToActual.get(c.toLowerCase());
    if (!actual) continue;
    const n = num(o[actual]);
    if (n != null) return n;
  }
  return null;
}

/** Strictly outside [a,b] inclusive interior; a <= b. */
export function strictlyOutsideRange(value: number, a: number, b: number): boolean {
  return value < a || value > b;
}

/**
 * Two-sided reference: flag if outside range, OR inside but in lower/upper 10% of span (near edges).
 */
export function flagFromReferenceTwoSided(
  value: number,
  refMin: number,
  refMax: number,
): boolean {
  const lo = Math.min(refMin, refMax);
  const hi = Math.max(refMin, refMax);
  const w = hi - lo;
  if (!Number.isFinite(w) || w <= 0) {
    return strictlyOutsideRange(value, lo, hi);
  }
  if (strictlyOutsideRange(value, lo, hi)) return true;
  const margin = 0.1 * w;
  if (value <= lo + margin) return true;
  if (value >= hi - margin) return true;
  return false;
}

/** One-sided: only max (e.g. LDL ≤ 100): flag if over max or within upper 10% of [0, max] if max > 0. */
export function flagFromReferenceMaxOnly(value: number, refMax: number): boolean {
  if (value > refMax) return true;
  if (refMax > 0) {
    const margin = 0.1 * refMax;
    if (value >= refMax - margin) return true;
  }
  return false;
}

/** One-sided: only min (e.g. HDL ≥ 40): flag if under min or within lower 10% above min using span heuristic. */
export function flagFromReferenceMinOnly(value: number, refMin: number): boolean {
  if (value < refMin) return true;
  if (refMin > 0) {
    const span = refMin;
    const margin = 0.1 * span;
    if (value < refMin + margin) return true;
  } else {
    const margin = Math.max(0.1 * Math.abs(refMin), 1e-6);
    if (value < refMin + margin) return true;
  }
  return false;
}

export function finalizeBloodWorkFlag(m: ParsedBloodMarkerInput): boolean {
  if (labFlagIndicatesRisk(m.labFlag)) return true;
  if (m.documentFlagsRisk === true) return true;

  const lo = num(m.referenceMin);
  const hi = num(m.referenceMax);

  if (lo != null && hi != null) {
    return flagFromReferenceTwoSided(m.value, lo, hi);
  }
  if (hi != null && lo == null) {
    return flagFromReferenceMaxOnly(m.value, hi);
  }
  if (lo != null && hi == null) {
    return flagFromReferenceMinOnly(m.value, lo);
  }

  return Boolean(m.flagged);
}

export function normalizeParsedBloodMarker(raw: unknown): ParsedBloodMarkerInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const name = strField(
    o,
    "name",
    "analyte",
    "test",
    "testName",
    "Name",
    "Analyte",
    "Test",
  );

  let value = numField(o, "value", "Value", "result", "Result", "numericResult");
  let unit = strField(o, "unit", "Unit", "units", "Units", "uom", "UOM");

  const valueRaw = o.value ?? o.Value ?? o.result ?? o.Result;
  if (value == null && typeof valueRaw === "string") {
    const m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/u.exec(
      valueRaw.trim().replace(/,/g, ""),
    );
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) {
        value = n;
        const rest = m[2].trim();
        if (rest && !unit) unit = rest;
      }
    }
  }

  if (!name || value == null) return null;
  if (!unit) unit = "—";

  const catRaw =
    o.category ?? o.Category ?? o.panel ?? o.Panel ?? o.section ?? o.Section;
  const category =
    typeof catRaw === "string"
      ? catRaw.trim()
      : typeof catRaw === "number"
        ? String(catRaw)
        : "";

  const refMin =
    num(o.referenceMin) ??
    num(o.reference_min) ??
    numField(o, "refMin", "RefMin", "referenceLow");
  const refMax =
    num(o.referenceMax) ??
    num(o.reference_max) ??
    numField(o, "refMax", "RefMax", "referenceHigh");

  const labFlagRaw =
    strField(o, "labFlag", "LabFlag", "flag", "Flag", "flagCode", "abnormalFlag") ||
    null;

  return {
    category: category || null,
    name,
    value,
    unit,
    referenceMin: refMin,
    referenceMax: refMax,
    labFlag: labFlagRaw || null,
    flagged: typeof o.flagged === "boolean" ? o.flagged : undefined,
    documentFlagsRisk:
      typeof o.documentFlagsRisk === "boolean"
        ? o.documentFlagsRisk
        : typeof o.documentIndicatesAbnormal === "boolean"
          ? o.documentIndicatesAbnormal
          : undefined,
  };
}
