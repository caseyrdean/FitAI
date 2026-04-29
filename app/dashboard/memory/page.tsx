"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

type MemoryRow = {
  id: string | null;
  userId: string;
  memory: unknown;
  version: number;
  updatedBy: string;
  updatedAt: string | null;
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

type MemoryBucketKey =
  | "foodLikes"
  | "foodDislikes"
  | "scheduleConstraints"
  | "prepBudgetTime"
  | "workoutPreferences"
  | "adherenceFriction"
  | "communicationStyle";

type MemoryItem = {
  value: string;
  confidence?: number;
  source?: string;
  updatedAt?: string;
};

type MemoryForm = Record<MemoryBucketKey, string[]>;

const MEMORY_SECTIONS: {
  key: MemoryBucketKey;
  title: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "foodLikes",
    title: "Foods you like",
    hint: "Examples: salmon, Greek yogurt, stir-fry bowls",
    placeholder: "Add a food you enjoy",
  },
  {
    key: "foodDislikes",
    title: "Foods you dislike",
    hint: "Examples: mushrooms, spicy foods, very sweet snacks",
    placeholder: "Add a food to avoid",
  },
  {
    key: "scheduleConstraints",
    title: "Schedule constraints",
    hint: "Examples: no workouts before 7am, late meetings Tue/Thu",
    placeholder: "Add a schedule constraint",
  },
  {
    key: "prepBudgetTime",
    title: "Prep time and budget",
    hint: "Examples: 20-minute dinners, budget-friendly groceries",
    placeholder: "Add a prep/budget preference",
  },
  {
    key: "workoutPreferences",
    title: "Workout preferences",
    hint: "Examples: upper/lower split, low-impact cardio, home workouts",
    placeholder: "Add a workout preference",
  },
  {
    key: "adherenceFriction",
    title: "Common friction points",
    hint: "Examples: travel days, late-night snacking, low energy afternoons",
    placeholder: "Add a challenge Atlas should plan around",
  },
  {
    key: "communicationStyle",
    title: "Coaching style you prefer",
    hint: "Examples: direct, encouraging, concise, detailed",
    placeholder: "Add communication style preference",
  },
];

function emptyForm(): MemoryForm {
  return {
    foodLikes: [],
    foodDislikes: [],
    scheduleConstraints: [],
    prepBudgetTime: [],
    workoutPreferences: [],
    adherenceFriction: [],
    communicationStyle: [],
  };
}

function toFormState(raw: unknown): MemoryForm {
  const out = emptyForm();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const section of MEMORY_SECTIONS) {
    const bucket = obj[section.key];
    if (!Array.isArray(bucket)) continue;
    out[section.key] = bucket
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const asObj = item as MemoryItem;
          return typeof asObj.value === "string" ? asObj.value.trim() : "";
        }
        return "";
      })
      .filter((value) => value.length > 0);
  }
  return out;
}

function toPayload(form: MemoryForm) {
  const payload: Record<string, Array<{ value: string; source: string }>> = {};
  for (const section of MEMORY_SECTIONS) {
    const values = form[section.key]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length === 0) continue;
    payload[section.key] = values.map((value) => ({ value, source: "user" }));
  }
  return payload;
}

export default function MemoryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<MemoryRow | null>(null);
  const [form, setForm] = useState<MemoryForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchJson<MemoryRow | null>("/api/memory", null);
      if (!cancelled) {
        setRow(data);
        setForm(toFormState(data?.memory ?? {}));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalItems = useMemo(
    () => MEMORY_SECTIONS.reduce((sum, section) => sum + form[section.key].length, 0),
    [form],
  );

  const updateValue = (key: MemoryBucketKey, index: number, value: string) => {
    setForm((prev) => {
      const next = { ...prev };
      next[key] = [...next[key]];
      next[key][index] = value;
      return next;
    });
  };

  const addItem = (key: MemoryBucketKey) => {
    setForm((prev) => ({
      ...prev,
      [key]: [...prev[key], ""],
    }));
  };

  const removeItem = (key: MemoryBucketKey, index: number) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, idx) => idx !== index),
    }));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const memoryPayload = toPayload(form);
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memory: memoryPayload,
          updatedBy: "user",
          eventType: "user_edit",
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const updated = (await res.json()) as MemoryRow;
      setRow(updated);
      setForm(toFormState(updated.memory ?? {}));
      setSavedMessage("Saved. Atlas will use these preferences in future coaching.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Personalization memory</h1>
        <p className="text-sm text-muted-foreground">
          Tell Atlas your preferences in plain language so plans fit your real life.
        </p>
      </div>
      <Card className="border-surface-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Primary action</CardTitle>
          <CardDescription>
            Update key preferences and save so Atlas uses them in future coaching.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card className="border-surface-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-white">Your saved preferences</CardTitle>
          <CardDescription>
            Add as many notes as you want in each section. No coding or JSON needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-md bg-surface-light" />
          ) : (
            <>
              <div className="rounded-md border border-surface-border bg-surface/40 px-3 py-2 text-xs text-muted-foreground">
                {totalItems} saved item{totalItems === 1 ? "" : "s"} · Version {row?.version ?? 0}
                {row?.updatedBy ? ` · last updated by ${row.updatedBy}` : ""}
              </div>

              <div className="space-y-4">
                {MEMORY_SECTIONS.map((section) => (
                  <div
                    key={section.key}
                    className="rounded-md border border-surface-border bg-surface/30 p-3"
                  >
                    <p className="text-sm font-medium text-white">{section.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{section.hint}</p>
                    <div className="mt-2 space-y-2">
                      {form[section.key].map((item, idx) => (
                        <div key={`${section.key}-${idx}`} className="flex items-center gap-2">
                          <Input
                            value={item}
                            onChange={(e) => updateValue(section.key, idx, e.target.value)}
                            placeholder={section.placeholder}
                            className="border-surface-border bg-surface-dark text-white placeholder:text-muted-foreground"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="border-surface-border"
                            onClick={() => removeItem(section.key, idx)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="border-surface-border"
                        onClick={() => addItem(section.key)}
                      >
                        Add item
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Changes apply to future Atlas guidance.</p>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="bg-neon-green text-black hover:bg-neon-green/90"
                >
                  {saving ? "Saving..." : "Save preferences"}
                </Button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              {savedMessage && <p className="text-xs text-green-400">{savedMessage}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
