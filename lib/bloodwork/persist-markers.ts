import { prisma } from "@/lib/db/client";
import {
  finalizeBloodWorkFlag,
  normalizeParsedBloodMarker,
  type ParsedBloodMarkerInput,
} from "@/lib/bloodwork/marker-flag";

export type PersistMarkersResult = {
  persisted: number;
  flaggedCount: number;
};

/**
 * Normalize JSON-like rows and insert BloodWorkMarker rows for a record.
 * Returns how many rows were stored (0 if every row failed normalization).
 */
export async function persistMarkersForRecord(
  recordId: string,
  rawList: unknown[],
): Promise<PersistMarkersResult> {
  const normalized = rawList
    .map((row) => normalizeParsedBloodMarker(row))
    .filter((m): m is ParsedBloodMarkerInput => m != null);

  if (normalized.length === 0) {
    return { persisted: 0, flaggedCount: 0 };
  }

  const flaggedCount = normalized.filter((m) => finalizeBloodWorkFlag(m)).length;

  await prisma.bloodWorkMarker.createMany({
    data: normalized.map((m) => ({
      recordId,
      category: (m.category ?? "").trim() || "Uncategorized",
      name: m.name,
      value: m.value,
      unit: m.unit,
      referenceMin: m.referenceMin ?? null,
      referenceMax: m.referenceMax ?? null,
      labFlag:
        m.labFlag != null && String(m.labFlag).trim() !== ""
          ? String(m.labFlag).trim()
          : null,
      flagged: finalizeBloodWorkFlag(m),
    })),
  });

  return { persisted: normalized.length, flaggedCount };
}
