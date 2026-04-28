function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type SanitizedSupplementItem = {
  supplementKind: string;
  amount: number;
  unit: string;
  rationale: string;
  /** How often the **amount** is taken (e.g. once daily, twice daily) — not a weekly rollup */
  frequency?: string;
  timing?: string;
  drivers?: string[];
};

/** Validate Atlas supplement rows — generic forms only (no retail brand names). */
export function sanitizeSupplementAdviceItems(raw: unknown): {
  items: SanitizedSupplementItem[];
  valid: boolean;
} {
  if (!Array.isArray(raw)) return { items: [], valid: false };
  const out: SanitizedSupplementItem[] = [];
  for (const x of raw) {
    if (!isRecord(x)) continue;
    const supplementKind = String(x.supplementKind ?? "").trim().slice(0, 240);
    const amount = typeof x.amount === "number" ? x.amount : Number(x.amount);
    const unit = String(x.unit ?? "").trim().slice(0, 48);
    const rationale = String(x.rationale ?? "").trim().slice(0, 4000);
    if (!supplementKind || !Number.isFinite(amount) || amount <= 0 || !unit || !rationale) {
      continue;
    }
    const frequency =
      x.frequency != null && String(x.frequency).trim()
        ? String(x.frequency).trim().slice(0, 120)
        : undefined;
    const timing =
      x.timing != null && String(x.timing).trim()
        ? String(x.timing).trim().slice(0, 400)
        : undefined;
    const driversRaw = Array.isArray(x.drivers) ? x.drivers : [];
    const drivers = driversRaw
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 12);
    out.push({
      supplementKind,
      amount,
      unit,
      rationale,
      ...(frequency ? { frequency } : {}),
      ...(timing ? { timing } : {}),
      ...(drivers.length ? { drivers } : {}),
    });
  }
  return { items: out, valid: out.length > 0 };
}
