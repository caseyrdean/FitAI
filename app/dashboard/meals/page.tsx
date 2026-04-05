"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MealPlan, type MealPlanApi } from "@/components/meal-plan";
import { FoodLog, type FoodLogEntryApi, type FoodLogNutrients } from "@/components/food-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import {
  currentLocalWeekDateKeys,
  FOOD_LOG_SYNC_DAYS,
} from "@/lib/local-week";
import { localDateKeyFromLoggedAt } from "@/lib/nutrients/micronutrients";

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

type MacroTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function readMacroTargets(raw: unknown): MacroTargets {
  if (!isRecord(raw)) {
    return { calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 };
  }
  const num = (k: string, fallback: number) => {
    const v = raw[k];
    return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  };
  return {
    calories: num("calories", num("daily_calories", 2200)),
    protein_g: num("protein_g", num("protein", 160)),
    carbs_g: num("carbs_g", num("carbs", 220)),
    fat_g: num("fat_g", num("fat", 70)),
  };
}

export default function MealsDashboardPage() {
  const [plan, setPlan] = useState<MealPlanApi | null>(null);
  const [entries, setEntries] = useState<FoodLogEntryApi[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsTick, setStatsTick] = useState(0);

  const refreshStats = useCallback(() => {
    setStatsTick((n) => n + 1);
  }, []);

  useAtlasRefresh(refreshStats);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const [mealsRes, logRes] = await Promise.all([
          fetch("/api/meals", { cache: "no-store" }),
          fetch(`/api/foodlog?days=${FOOD_LOG_SYNC_DAYS}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const mealJson = mealsRes.ok ? ((await mealsRes.json()) as MealPlanApi | null) : null;
        const logJson = logRes.ok ? ((await logRes.json()) as FoodLogEntryApi[]) : [];
        setPlan(mealJson);
        setEntries(Array.isArray(logJson) ? logJson : []);
      } catch {
        if (!cancelled) {
          setPlan(null);
          setEntries([]);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statsTick]);

  const targets = useMemo(() => readMacroTargets(plan?.macroTargets), [plan]);

  const weekTotals = useMemo(() => {
    const weekKeySet = new Set(currentLocalWeekDateKeys());
    let calories = 0;
    let protein_g = 0;
    let carbs_g = 0;
    let fat_g = 0;
    for (const e of entries) {
      if (!weekKeySet.has(localDateKeyFromLoggedAt(e.loggedAt))) continue;
      const n = parseNutrients(e.nutrients);
      if (n.calories != null) calories += n.calories;
      if (n.protein_g != null) protein_g += n.protein_g;
      if (n.carbs_g != null) carbs_g += n.carbs_g;
      if (n.fat_g != null) fat_g += n.fat_g;
    }
    return { calories, protein_g, carbs_g, fat_g };
  }, [entries]);

  const weekTargets = useMemo(
    () => ({
      calories: targets.calories * 7,
      protein_g: targets.protein_g * 7,
      carbs_g: targets.carbs_g * 7,
      fat_g: targets.fat_g * 7,
    }),
    [targets],
  );

  const statCards: {
    label: string;
    current: number;
    target: number;
    accent: string;
    formatPair: (cur: number, tgt: number) => string;
  }[] = [
    {
      label: "Calories",
      current: weekTotals.calories,
      target: weekTargets.calories,
      accent: "text-neon-green",
      formatPair: (cur, tgt) =>
        `${Math.round(cur)} / ${Math.round(tgt)} kcal`,
    },
    {
      label: "Protein",
      current: weekTotals.protein_g,
      target: weekTargets.protein_g,
      accent: "text-neon-blue",
      formatPair: (cur, tgt) => `${Math.round(cur)}g / ${Math.round(tgt)}g`,
    },
    {
      label: "Carbs",
      current: weekTotals.carbs_g,
      target: weekTargets.carbs_g,
      accent: "text-gray-200",
      formatPair: (cur, tgt) => `${Math.round(cur)}g / ${Math.round(tgt)}g`,
    },
    {
      label: "Fat",
      current: weekTotals.fat_g,
      target: weekTargets.fat_g,
      accent: "text-neon-amber",
      formatPair: (cur, tgt) => `${Math.round(cur)}g / ${Math.round(tgt)}g`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Meals & <span className="text-neon-green">nutrition</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This week&apos;s intake (Sun–Sat) vs 7× your plan&apos;s daily macro targets. All values{" "}
          <span className="text-neon-green">~est.</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => {
          const pct =
            s.target > 0 ? Math.min(100, Math.round((s.current / s.target) * 100)) : 0;
          const [left, right] = s.formatPair(s.current, s.target).split(" / ");
          return (
            <Card
              key={s.label}
              className="border-surface-border bg-surface-light/90 text-card-foreground"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <>
                    <div className="text-2xl font-bold tabular-nums">
                      <span className={s.accent}>{left}</span>
                      <span className="text-lg font-normal text-muted-foreground">
                        {" "}
                        / {right}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This week vs 7× daily plan target (~est.)
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-border">
                      <div
                        className="h-full rounded-full bg-neon-green/80 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      ~est. from logged foods
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <MealPlan onAfterSwap={refreshStats} />
      <FoodLog mealPlan={plan} onAfterLog={refreshStats} />
    </div>
  );
}
