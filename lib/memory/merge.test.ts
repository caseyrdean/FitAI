import test from "node:test";
import assert from "node:assert/strict";
import { mergeMemory, normalizeMemory } from "@/lib/memory/merge";

test("normalizeMemory keeps known buckets and valid items", () => {
  const normalized = normalizeMemory({
    foodLikes: [{ value: "salmon", confidence: 0.9 }, { value: "" }],
    workoutPreferences: [{ value: "upper/lower split" }],
    invalid: [{ value: "x" }],
  });
  assert.equal(normalized.foodLikes?.length, 1);
  assert.equal(normalized.foodLikes?.[0]?.value, "salmon");
  assert.equal(normalized.workoutPreferences?.[0]?.value, "upper/lower split");
});

test("mergeMemory deduplicates and patch overwrites matching values", () => {
  const merged = mergeMemory(
    {
      foodLikes: [{ value: "Salmon", confidence: 0.5, source: "week1" }],
      communicationStyle: [{ value: "direct" }],
    },
    {
      foodLikes: [{ value: "salmon", confidence: 0.9, source: "week2" }],
      scheduleConstraints: [{ value: "no late workouts" }],
    },
  );
  assert.equal(merged.foodLikes?.length, 1);
  assert.equal(merged.foodLikes?.[0]?.confidence, 0.9);
  assert.equal(merged.foodLikes?.[0]?.source, "week2");
  assert.equal(merged.communicationStyle?.[0]?.value, "direct");
  assert.equal(merged.scheduleConstraints?.[0]?.value, "no late workouts");
});
