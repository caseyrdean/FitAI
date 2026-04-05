import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type BloodWorkRecordWithMarkers = Prisma.BloodWorkRecordGetPayload<{
  include: { markers: true };
}>;

/**
 * Latest upload that actually has parsed markers; otherwise the newest record (e.g. raw-only).
 * Ensures meal planning uses panel data, not an empty newer upload.
 */
export async function getPreferredBloodWorkRecord(
  userId: string,
): Promise<BloodWorkRecordWithMarkers | null> {
  const recent = await prisma.bloodWorkRecord.findMany({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    take: 15,
    include: { markers: true },
  });
  for (const r of recent) {
    if (r.markers.length > 0) return r;
  }
  return recent[0] ?? null;
}

function formatRef(m: {
  referenceMin: number | null;
  referenceMax: number | null;
}): string {
  if (m.referenceMin != null && m.referenceMax != null) {
    return `${m.referenceMin}–${m.referenceMax}`;
  }
  if (m.referenceMin != null) return `≥${m.referenceMin}`;
  if (m.referenceMax != null) return `≤${m.referenceMax}`;
  return "—";
}

function markerLine(m: BloodWorkRecordWithMarkers["markers"][number]): string {
  const panel = m.category?.trim() ? `[${m.category.trim()}] ` : "";
  const lf = m.labFlag?.trim() ? ` flag=${m.labFlag.trim()}` : "";
  const fg = m.flagged ? " ⚠️FLAGGED" : "";
  return `- ${panel}${m.name}: ${m.value} ${m.unit} (ref ${formatRef(m)})${lf}${fg}`;
}

const MEAL_AND_NUTRIENT_RULES = `Apply to meal plans and per-food nutrient estimates (general patterns only — not medical advice):
- **Flagged analytes** drive priorities: adjust macroTargets, ingredient choices, and typical sodium/potassium/sat fat/fiber emphasis to support those markers.
- **Lipids high** (LDL, total chol, triglycerides): emphasize vegetables, legumes, whole grains, fish; unsaturated oils; limit deep-fried and very high saturated fat; adequate fiber.
- **Glucose / A1c / fasting glucose high**: favor lower glycemic load, consistent carb distribution across meals, high fiber; avoid making every meal carb-heavy.
- **Sodium high**: keep meal plan sodium_mg estimates moderate; prefer lower-salt prep; when estimating logged foods, stay realistic on sodium for salty items.
- **Potassium low or blood pressure context**: include potassium-rich produce/legumes where compatible with profile.
- **Iron / ferritin / hemoglobin low**: include iron-aware food sources consistent with dietary restrictions (heme/non-heme).
- **Liver enzymes (ALT/AST) high**: avoid alcohol-forward plans; emphasize whole foods; keep fat quality reasonable.
- If an analyte is **low** (e.g. vitamin D), you may slightly favor food sources — still respect calorie/macro targets.`;

const ATLAS_MAX_NON_FLAGGED_MARKERS = 45;

/**
 * Rich block for Atlas context: latest panel + explicit planning rules.
 * Caps non-flagged rows so huge CMP/CBC panels do not blow the context window.
 */
export function formatBloodWorkForAtlasContext(
  record: BloodWorkRecordWithMarkers | null,
): string {
  if (!record) {
    return "## Blood Work\nNo blood work records uploaded.";
  }

  const dateStr = record.uploadedAt.toISOString().split("T")[0];

  if (record.markers.length > 0) {
    const flagged = record.markers.filter((m) => m.flagged);
    const ok = record.markers.filter((m) => !m.flagged);
    const flaggedBlock =
      flagged.length > 0
        ? `### Flagged analytes (must influence generate_meal_plan and check-ins)\n${flagged.map(markerLine).join("\n")}`
        : "### Flagged analytes\nNone on this panel.";

    const okShown = ok.slice(0, ATLAS_MAX_NON_FLAGGED_MARKERS);
    const okOmitted = ok.length - okShown.length;
    const restBlock =
      okShown.length > 0
        ? `### Other analytes (same draw)\n${okShown.map(markerLine).join("\n")}${
            okOmitted > 0
              ? `\n- …and ${okOmitted} more analytes (see Blood Work in app for full list).`
              : ""
          }`
        : "";

    return `## Latest blood panels (${dateStr}, recordId ${record.id})
Use this draw as the **authoritative lab snapshot** until a newer upload with markers exists.
${flaggedBlock}
${restBlock}

### How to use these labs
${MEAL_AND_NUTRIENT_RULES}`;
  }

  if (record.rawText?.trim()) {
    const excerpt = record.rawText.trim().slice(0, 4500);
    const more = record.rawText.length > 4500 ? "\n…(truncated)" : "";
    return `## Latest blood work (${dateStr}) — text only (recordId ${record.id})
Markers are not in structured form yet. Use **parse_blood_work** if you need rows.
${excerpt}${more}

### How to use when planning meals
${MEAL_AND_NUTRIENT_RULES}`;
  }

  return `## Blood Work
Record from ${dateStr} has no markers or extracted text yet.`;
}

/**
 * Compact block appended to food / nutrient estimation prompts (same user).
 */
export function formatBloodWorkForNutrientEstimate(
  record: BloodWorkRecordWithMarkers | null,
): string {
  if (!record || record.markers.length === 0) {
    return "";
  }

  const flagged = record.markers.filter((m) => m.flagged);
  const dateStr = record.uploadedAt.toISOString().split("T")[0];
  const lines = flagged.length
    ? flagged.map(markerLine).join("\n")
    : record.markers.slice(0, 12).map(markerLine).join("\n");

  return `User's latest blood panel (${dateStr}):\n${lines}\n\n${MEAL_AND_NUTRIENT_RULES}\n\nWhen estimating this food, keep micronutrients realistic. If sodium or saturated fat is a concern from flagged labs, reflect that in sodium_mg / fat quality where appropriate for this item.`;
}
