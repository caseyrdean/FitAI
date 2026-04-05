"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getPlannedMealsForLocalDate,
  type MealPlanApi,
  type PlanMeal,
} from "@/components/meal-plan";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";
import { FOOD_LOG_SYNC_DAYS, formatLocalWeekRangeLabel } from "@/lib/local-week";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Check, X } from "lucide-react";

export type FoodLogNutrients = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
};

export type FoodLogEntryApi = {
  id: string;
  loggedAt: string;
  description: string;
  mealType: string;
  nutrients: FoodLogNutrients | Record<string, unknown>;
};

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseNumericRecord(raw: unknown): Record<string, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseNutrients(raw: unknown): FoodLogNutrients {
  if (!isRecord(raw)) return {};
  return {
    calories: typeof raw.calories === "number" ? raw.calories : undefined,
    protein_g: typeof raw.protein_g === "number" ? raw.protein_g : undefined,
    carbs_g: typeof raw.carbs_g === "number" ? raw.carbs_g : undefined,
    fat_g: typeof raw.fat_g === "number" ? raw.fat_g : undefined,
    fiber_g: typeof raw.fiber_g === "number" && Number.isFinite(raw.fiber_g) ? raw.fiber_g : undefined,
    vitamins: parseNumericRecord(raw.vitamins),
    minerals: parseNumericRecord(raw.minerals),
  };
}

// Format a Date to a local datetime-local input value (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type EditState = {
  id: string;
  loggedAt: string;       // datetime-local string
  description: string;
  mealType: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type FoodLogProps = {
  onAfterLog?: () => void;
  /** When omitted, the food log loads `/api/meals` itself. Pass from parent to avoid duplicate fetch. */
  mealPlan?: MealPlanApi | null;
};

function plannedMealTitle(meal: PlanMeal): string {
  const n = meal.name?.trim();
  if (n) return n;
  return "Planned meal";
}

function buildPlanLogDescription(mealType: string, meal: PlanMeal): string {
  const title = plannedMealTitle(meal);
  const parts = [`${mealType}: ${title}`];
  if (meal.ingredients && meal.ingredients.length > 0) {
    parts.push(meal.ingredients.slice(0, 15).join("; "));
  }
  parts.push("(meal plan)");
  return parts.join(" — ");
}

export function FoodLog({ onAfterLog, mealPlan: mealPlanProp }: FoodLogProps) {
  const [entries, setEntries] = useState<FoodLogEntryApi[]>([]);
  const [planFetched, setPlanFetched] = useState<MealPlanApi | null>(null);
  const [planLoading, setPlanLoading] = useState(mealPlanProp === undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState<string>(MEAL_TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickAdding, setQuickAdding] = useState<string | null>(null);

  const effectivePlan = mealPlanProp !== undefined ? mealPlanProp : planFetched;

  useEffect(() => {
    if (mealPlanProp !== undefined) {
      setPlanLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setPlanLoading(true);
      try {
        const res = await fetch("/api/meals");
        if (!res.ok) {
          if (!cancelled) setPlanFetched(null);
          return;
        }
        const data = (await res.json()) as MealPlanApi | null;
        if (!cancelled) setPlanFetched(data);
      } catch {
        if (!cancelled) setPlanFetched(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mealPlanProp]);

  const todayPlanned = useMemo(
    () => getPlannedMealsForLocalDate(effectivePlan, new Date()),
    [effectivePlan],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/foodlog?days=${FOOD_LOG_SYNC_DAYS}`, {
        cache: "no-store",
      });
      if (!res.ok) { setError("Could not load food log"); return; }
      const data = (await res.json()) as FoodLogEntryApi[];
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load food log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/foodlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed, mealType }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to log food");
        return;
      }
      setDescription("");
      await load();
      dispatchFitaiRefresh({ source: "foodlog" });
      onAfterLog?.();
    } catch {
      setError("Failed to log food");
    } finally {
      setSubmitting(false);
    }
  };

  const logPlannedMeal = async (slotKey: string, mealType: string, meal: PlanMeal) => {
    if (quickAdding) return;
    setQuickAdding(slotKey);
    setError(null);
    try {
      const description = buildPlanLogDescription(mealType, meal);
      const res = await fetch("/api/foodlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, mealType }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(errBody?.error ?? "Failed to log meal");
        return;
      }
      await load();
      dispatchFitaiRefresh({ source: "foodlog" });
      onAfterLog?.();
    } catch {
      setError("Failed to log meal");
    } finally {
      setQuickAdding(null);
    }
  };

  const startEdit = (entry: FoodLogEntryApi) => {
    const n = parseNutrients(entry.nutrients);
    setEditState({
      id: entry.id,
      loggedAt: toDatetimeLocal(entry.loggedAt),
      description: entry.description,
      mealType: entry.mealType,
      calories: n.calories != null ? String(Math.round(n.calories)) : "",
      protein_g: n.protein_g != null ? String(Math.round(n.protein_g)) : "",
      carbs_g: n.carbs_g != null ? String(Math.round(n.carbs_g)) : "",
      fat_g: n.fat_g != null ? String(Math.round(n.fat_g)) : "",
    });
    setError(null);
  };

  const setField = <K extends keyof EditState>(key: K, val: EditState[K]) =>
    setEditState((s) => s && { ...s, [key]: val });

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState || saving) return;
    setSaving(true);
    setError(null);
    try {
      const parseNum = (s: string) => {
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };
      const res = await fetch(`/api/foodlog/${editState.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editState.description,
          mealType: editState.mealType,
          loggedAt: new Date(editState.loggedAt).toISOString(),
          calories: parseNum(editState.calories),
          protein_g: parseNum(editState.protein_g),
          carbs_g: parseNum(editState.carbs_g),
          fat_g: parseNum(editState.fat_g),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to save changes");
        return;
      }
      setEditState(null);
      await load();
      dispatchFitaiRefresh({ source: "foodlog" });
      onAfterLog?.();
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/foodlog/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to delete entry");
        return;
      }
      await load();
      dispatchFitaiRefresh({ source: "foodlog" });
      onAfterLog?.();
    } catch {
      setError("Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  };

  // Shared input style for edit cells
  const editInput = "h-7 w-full border-neon-green/40 bg-surface-dark text-sm text-white";

  return (
    <Card className="border-surface-border bg-surface-light/80 text-card-foreground">
      <CardHeader className="border-b border-surface-border pb-4">
        <CardTitle className="text-lg text-white">Food log</CardTitle>
        <div className="text-xs text-muted-foreground">
          Quick log and recent entries. Nutrients are{" "}
          <Badge variant="outline" className="ml-1 border-neon-green/40 text-neon-green">
            ~est.
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Quick add from today's meal plan */}
        {planLoading ? (
          <p className="text-xs text-muted-foreground">Loading today&apos;s plan…</p>
        ) : !effectivePlan ? (
          <div className="rounded-lg border border-dashed border-surface-border bg-surface-dark/30 p-4">
            <h3 className="text-sm font-semibold text-white">Quick add from meal plan</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a weekly meal plan first. Then you&apos;ll see today&apos;s meals here with
              one-tap logging.
            </p>
          </div>
        ) : !todayPlanned ? (
          <div className="rounded-lg border border-dashed border-neon-amber/30 bg-surface-dark/30 p-4">
            <h3 className="text-sm font-semibold text-white">Quick add from meal plan</h3>
            <p className="text-xs text-muted-foreground">
              This plan doesn&apos;t have a recognizable meals map (expect top-level{" "}
              <span className="font-mono text-[11px]">Sunday</span>–
              <span className="font-mono text-[11px]">Saturday</span> keys, each with Breakfast /
              Lunch / Dinner / Snack).
            </p>
          </div>
        ) : todayPlanned.outsidePlanWeek ? (
          <div className="rounded-lg border border-dashed border-neon-amber/30 bg-surface-dark/30 p-4">
            <h3 className="text-sm font-semibold text-white">Quick add from meal plan</h3>
            <p className="text-xs text-muted-foreground">
              Loaded plan is{" "}
              <span className="text-white">{formatLocalWeekRangeLabel(effectivePlan.weekStart)}</span>
              , which doesn&apos;t include today. Regenerate for the current week in Atlas.
            </p>
          </div>
        ) : todayPlanned.slots.length > 0 ? (
          <div className="rounded-lg border border-neon-green/25 bg-surface-dark/50 p-4">
            <h3 className="text-sm font-semibold text-white">Quick add from today&apos;s plan</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {todayPlanned.dayName} — log the full planned meal in one tap. Macros come from your
              plan when listed; otherwise we estimate from the description.
            </p>
            <ul className="mt-3 space-y-2">
              {todayPlanned.slots.map(({ mealType, meal }, i) => {
                const slotKey = `${mealType}-${i}`;
                const busy = quickAdding === slotKey;
                const n = {
                  c: meal.calories,
                  p: meal.protein_g,
                  cb: meal.carbs_g,
                  f: meal.fat_g,
                };
                return (
                  <li
                    key={slotKey}
                    className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface-light/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-neon-blue/50 text-neon-blue"
                        >
                          {mealType}
                        </Badge>
                        <span className="font-medium text-white">{plannedMealTitle(meal)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {n.c != null && Number.isFinite(n.c) && (
                          <span className="text-neon-green">{Math.round(n.c)} kcal</span>
                        )}
                        {n.p != null && Number.isFinite(n.p) && (
                          <span>P {Math.round(n.p)}g</span>
                        )}
                        {n.cb != null && Number.isFinite(n.cb) && (
                          <span>C {Math.round(n.cb)}g</span>
                        )}
                        {n.f != null && Number.isFinite(n.f) && (
                          <span>F {Math.round(n.f)}g</span>
                        )}
                        {n.c == null && (
                          <span className="italic">Macros estimated on log</span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={busy || !!submitting || !!editState}
                      className="shrink-0 bg-neon-green text-black hover:bg-neon-green/90"
                      onClick={() => void logPlannedMeal(slotKey, mealType, meal)}
                    >
                      {busy ? "Adding…" : "Add meal"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neon-amber/30 bg-surface-dark/30 p-4">
            <h3 className="text-sm font-semibold text-white">Quick add from meal plan</h3>
            <p className="text-xs text-muted-foreground">
              Nothing listed for today: today may fall outside this plan&apos;s week (see week start on
              the meal plan card), or this weekday has no Breakfast / Lunch / Dinner / Snack blocks in
              the saved plan.
            </p>
          </div>
        )}

        {/* Add entry form */}
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label htmlFor="food-desc" className="text-xs font-medium text-muted-foreground">
              What did you eat?
            </label>
            <Input
              id="food-desc"
              placeholder="e.g. Greek yogurt with berries and honey"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              className="border-surface-border bg-surface-dark text-white placeholder:text-muted-foreground"
            />
          </div>
          <div className="w-full space-y-2 sm:w-44">
            <label htmlFor="meal-type" className="text-xs font-medium text-muted-foreground">
              Meal
            </label>
            <select
              id="meal-type"
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-input border-surface-border bg-surface-dark px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t} className="bg-surface-dark">{t}</option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            disabled={submitting || !description.trim()}
            className="bg-neon-green text-black hover:bg-neon-green/90"
          >
            {submitting ? "Logging…" : "Log food"}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-white">Recent entries</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading entries…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries in the last 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-surface-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Time</TableHead>
                    <TableHead className="text-muted-foreground">Description</TableHead>
                    <TableHead className="text-muted-foreground">Meal</TableHead>
                    <TableHead className="text-muted-foreground">kcal</TableHead>
                    <TableHead className="text-muted-foreground">Protein</TableHead>
                    <TableHead className="text-muted-foreground">Carbs</TableHead>
                    <TableHead className="text-muted-foreground">Fat</TableHead>
                    <TableHead className="w-20 text-muted-foreground" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((row) => {
                    const n = parseNutrients(row.nutrients);
                    const isEditing = editState?.id === row.id;
                    const isDeleting = deletingId === row.id;

                    return (
                      <TableRow
                        key={row.id}
                        className={`border-surface-border transition-colors ${isEditing ? "bg-surface-light/30" : ""}`}
                      >
                        {/* Time */}
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="datetime-local"
                              value={editState.loggedAt}
                              onChange={(e) => setField("loggedAt", e.target.value)}
                              className="h-7 rounded-md border border-neon-green/40 bg-surface-dark px-2 text-xs text-white"
                            />
                          ) : (
                            <span className="text-gray-300">{formatTime(row.loggedAt)}</span>
                          )}
                        </TableCell>

                        {/* Description */}
                        <TableCell className="min-w-[180px] max-w-[240px]">
                          {isEditing ? (
                            <Input
                              value={editState.description}
                              onChange={(e) => setField("description", e.target.value)}
                              className={editInput}
                              autoFocus
                            />
                          ) : (
                            <span className="text-white">{row.description}</span>
                          )}
                        </TableCell>

                        {/* Meal type */}
                        <TableCell>
                          {isEditing ? (
                            <select
                              value={editState.mealType}
                              onChange={(e) => setField("mealType", e.target.value)}
                              className="h-7 rounded-md border border-neon-green/40 bg-surface-dark px-2 text-sm text-white"
                            >
                              {MEAL_TYPES.map((t) => (
                                <option key={t} value={t} className="bg-surface-dark">{t}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-300">{row.mealType}</span>
                          )}
                        </TableCell>

                        {/* Calories */}
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editState.calories}
                              onChange={(e) => setField("calories", e.target.value)}
                              className={`${editInput} w-20`}
                              placeholder="kcal"
                            />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-neon-green">
                                {n.calories != null ? Math.round(n.calories) : "—"}
                              </span>
                              <Badge variant="outline" className="border-neon-green/30 px-1.5 py-0 text-[10px] text-neon-green">~est.</Badge>
                            </div>
                          )}
                        </TableCell>

                        {/* Protein */}
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editState.protein_g}
                              onChange={(e) => setField("protein_g", e.target.value)}
                              className={`${editInput} w-20`}
                              placeholder="g"
                            />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-neon-blue">
                                {n.protein_g != null ? `${Math.round(n.protein_g)}g` : "—"}
                              </span>
                              <Badge variant="outline" className="border-neon-blue/30 px-1.5 py-0 text-[10px] text-neon-blue">~est.</Badge>
                            </div>
                          )}
                        </TableCell>

                        {/* Carbs */}
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editState.carbs_g}
                              onChange={(e) => setField("carbs_g", e.target.value)}
                              className={`${editInput} w-20`}
                              placeholder="g"
                            />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-200">
                                {n.carbs_g != null ? `${Math.round(n.carbs_g)}g` : "—"}
                              </span>
                              <Badge variant="outline" className="border-muted-foreground/40 px-1.5 py-0 text-[10px]">~est.</Badge>
                            </div>
                          )}
                        </TableCell>

                        {/* Fat */}
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editState.fat_g}
                              onChange={(e) => setField("fat_g", e.target.value)}
                              className={`${editInput} w-20`}
                              placeholder="g"
                            />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-neon-amber">
                                {n.fat_g != null ? `${Math.round(n.fat_g)}g` : "—"}
                              </span>
                              <Badge variant="outline" className="border-neon-amber/40 px-1.5 py-0 text-[10px] text-neon-amber">~est.</Badge>
                            </div>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-neon-green hover:bg-neon-green/10"
                                  onClick={saveEdit}
                                  disabled={saving || !editState.description.trim()}
                                  title="Save"
                                >
                                  {saving ? <span className="text-xs">…</span> : <Check className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-white"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-neon-green"
                                  onClick={() => startEdit(row)}
                                  disabled={!!deletingId || !!editState}
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => void deleteEntry(row.id)}
                                  disabled={isDeleting || !!editState}
                                  title="Delete"
                                >
                                  {isDeleting
                                    ? <span className="text-xs">…</span>
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
