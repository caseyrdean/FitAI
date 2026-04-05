export type BloodWorkMarkerLike = {
  category?: string;
  name: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  labFlag?: string | null;
  flagged: boolean;
};

export type BloodWorkRecordLike = {
  id: string;
  uploadedAt: string;
  markers?: BloodWorkMarkerLike[];
};

export type AnalyteSeriesPoint = {
  recordId: string;
  uploadedAt: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  labFlag: string | null;
  flagged: boolean;
  category: string;
  name: string;
};

export type AnalyteSeriesRow = {
  seriesKey: string;
  category: string;
  displayName: string;
  unit: string;
  points: AnalyteSeriesPoint[];
};

/** Stable key for grouping the same analyte under the same panel across uploads. */
export function normalizeSeriesKey(category: string, name: string): string {
  const c = category.trim().toLowerCase().replace(/\s+/g, " ");
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  return `${c}|||${n}`;
}

/**
 * One row per (category, analyte); columns are filled from chronological uploads.
 */
export function buildAnalyteSeries(records: BloodWorkRecordLike[]): AnalyteSeriesRow[] {
  const byKey = new Map<string, AnalyteSeriesPoint[]>();

  const chronological = [...records].sort(
    (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
  );

  for (const rec of chronological) {
    for (const m of rec.markers ?? []) {
      const catRaw = m.category?.trim();
      const cat = catRaw && catRaw.length > 0 ? catRaw : "Uncategorized";
      const key = normalizeSeriesKey(cat, m.name);
      const list = byKey.get(key) ?? [];
      const lf =
        m.labFlag != null && String(m.labFlag).trim() !== ""
          ? String(m.labFlag).trim()
          : null;
      list.push({
        recordId: rec.id,
        uploadedAt: rec.uploadedAt,
        value: m.value,
        unit: m.unit,
        referenceMin: m.referenceMin,
        referenceMax: m.referenceMax,
        labFlag: lf,
        flagged: m.flagged,
        category: cat,
        name: m.name,
      });
      byKey.set(key, list);
    }
  }

  const rows: AnalyteSeriesRow[] = [];
  for (const [, points] of byKey) {
    if (points.length === 0) continue;
    const last = points[points.length - 1];
    rows.push({
      seriesKey: normalizeSeriesKey(last.category, last.name),
      category: last.category,
      displayName: last.name,
      unit: last.unit,
      points,
    });
  }

  rows.sort((a, b) => {
    const c = a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
    if (c !== 0) return c;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });

  return rows;
}
