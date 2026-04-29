export type MemoryItem = {
  value: string;
  confidence?: number;
  source?: string;
  updatedAt?: string;
};

export type PersonalizationMemoryShape = {
  foodLikes?: MemoryItem[];
  foodDislikes?: MemoryItem[];
  scheduleConstraints?: MemoryItem[];
  prepBudgetTime?: MemoryItem[];
  workoutPreferences?: MemoryItem[];
  adherenceFriction?: MemoryItem[];
  communicationStyle?: MemoryItem[];
};

function asItem(raw: unknown): MemoryItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.value !== "string" || r.value.trim().length === 0) return null;
  return {
    value: r.value.trim(),
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
    source: typeof r.source === "string" ? r.source : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

function normalizeBucket(raw: unknown): MemoryItem[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, MemoryItem>();
  for (const item of raw) {
    const parsed = asItem(item);
    if (!parsed) continue;
    map.set(parsed.value.toLowerCase(), parsed);
  }
  return [...map.values()];
}

export function normalizeMemory(raw: unknown): PersonalizationMemoryShape {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  return {
    foodLikes: normalizeBucket(obj.foodLikes),
    foodDislikes: normalizeBucket(obj.foodDislikes),
    scheduleConstraints: normalizeBucket(obj.scheduleConstraints),
    prepBudgetTime: normalizeBucket(obj.prepBudgetTime),
    workoutPreferences: normalizeBucket(obj.workoutPreferences),
    adherenceFriction: normalizeBucket(obj.adherenceFriction),
    communicationStyle: normalizeBucket(obj.communicationStyle),
  };
}

function mergeBucket(base: MemoryItem[] = [], patch: MemoryItem[] = []): MemoryItem[] {
  const merged = new Map<string, MemoryItem>();
  for (const item of base) merged.set(item.value.toLowerCase(), item);
  for (const item of patch) merged.set(item.value.toLowerCase(), item);
  return [...merged.values()];
}

export function mergeMemory(
  baseRaw: unknown,
  patchRaw: unknown,
): PersonalizationMemoryShape {
  const base = normalizeMemory(baseRaw);
  const patch = normalizeMemory(patchRaw);
  return {
    foodLikes: mergeBucket(base.foodLikes, patch.foodLikes),
    foodDislikes: mergeBucket(base.foodDislikes, patch.foodDislikes),
    scheduleConstraints: mergeBucket(base.scheduleConstraints, patch.scheduleConstraints),
    prepBudgetTime: mergeBucket(base.prepBudgetTime, patch.prepBudgetTime),
    workoutPreferences: mergeBucket(base.workoutPreferences, patch.workoutPreferences),
    adherenceFriction: mergeBucket(base.adherenceFriction, patch.adherenceFriction),
    communicationStyle: mergeBucket(base.communicationStyle, patch.communicationStyle),
  };
}
