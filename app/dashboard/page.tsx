"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import {
  FOOD_LOG_SYNC_DAYS,
  planDayIndexFromWeekStart,
  trackingWeekDateKeysForMealPlan,
} from "@/lib/local-week";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { todayLocalDateKey } from "@/lib/nutrients/micronutrients";
import { Check, MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
// --- API response types (inline) ---

type FoodLogNutrients = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

type FoodLogEntry = {
  id: string;
  userId: string;
  loggedAt: string;
  description: string;
  mealType: string;
  nutrients: unknown;
  createdAt: string;
};

type ProgressEntry = {
  id: string;
  userId: string;
  date: string;
  weight: number | null;
  energyLevel: number | null;
  notes: string | null;
  createdAt: string;
};

type MacroTargets = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

type MealPlan = {
  id: string;
  userId: string;
  weekStart: string;
  meals: unknown;
  shoppingList: unknown;
  macroTargets: unknown;
  prepGuide: unknown;
  createdAt: string;
};

type BloodWorkMarker = {
  id: string;
  recordId: string;
  category?: string;
  name: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  labFlag?: string | null;
  flagged: boolean;
};

type BloodWorkRecord = {
  id: string;
  userId: string;
  uploadedAt: string;
  filePath: string;
  rawText: string;
  parsedAt: string | null;
  markers: BloodWorkMarker[];
};

type WorkoutPlan = {
  id: string;
  userId: string;
  weekStart: string;
  days: unknown;
  createdAt: string;
};

type WorkoutSession = {
  id: string;
  userId: string;
  date: string;
  planDayRef: string;
  completed: boolean;
  notes: string | null;
  createdAt: string;
};

type WorkoutsPayload = {
  plan: WorkoutPlan | null;
  sessions: WorkoutSession[];
};

// --- helpers ---

const NEON_GREEN = "#00ff88";
const NEON_BLUE = "#00aaff";

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNutrients(entry: FoodLogEntry): FoodLogNutrients {
  const n = entry.nutrients;
  if (!n || typeof n !== "object") {
    return {};
  }
  const o = n as Record<string, unknown>;
  return {
    calories: typeof o.calories === "number" ? o.calories : Number(o.calories) || 0,
    protein_g:
      typeof o.protein_g === "number" ? o.protein_g : Number(o.protein_g) || 0,
    carbs_g: typeof o.carbs_g === "number" ? o.carbs_g : Number(o.carbs_g) || 0,
    fat_g: typeof o.fat_g === "number" ? o.fat_g : Number(o.fat_g) || 0,
  };
}

function parseMacroTargets(raw: unknown): MacroTargets | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    calories:
      typeof o.calories === "number" ? o.calories : Number(o.calories) || undefined,
    protein_g:
      typeof o.protein_g === "number"
        ? o.protein_g
        : Number(o.protein_g) || undefined,
    carbs_g:
      typeof o.carbs_g === "number" ? o.carbs_g : Number(o.carbs_g) || undefined,
    fat_g: typeof o.fat_g === "number" ? o.fat_g : Number(o.fat_g) || undefined,
  };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function foodLogStreak(entries: FoodLogEntry[]): number {
  const daysWithLogs = new Set(
    entries.map((e) => localDateKey(new Date(e.loggedAt)))
  );
  let streak = 0;
  const cursor = startOfLocalDay(new Date());
  while (daysWithLogs.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function nextCheckInLabel(progress: ProgressEntry[]): string {
  if (progress.length === 0) return "Start onboarding";
  const latest = [...progress].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  const last = startOfLocalDay(new Date(latest.date));
  const next = new Date(last);
  next.setDate(next.getDate() + 7);
  const today = startOfLocalDay(new Date());
  const diffDays = Math.round(
    (next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays <= 0) return "Due today";
  if (diffDays === 1) return "Due in 1 day";
  return `Due in ${diffDays} days`;
}

type WorkoutDayShape = {
  dayIndex?: number;
  day?: string;
  exercises?: unknown[];
};

function todayWorkoutBlock(plan: WorkoutPlan | null): {
  dayIndex: number;
  exercises: string[];
} | null {
  if (!plan?.days) return null;
  const days = plan.days;
  if (!Array.isArray(days) || days.length === 0) return null;
  const idx = planDayIndexFromWeekStart(plan.weekStart);
  const block = days[idx] as WorkoutDayShape | undefined;
  if (!block) return { dayIndex: idx, exercises: [] };

  const raw = Array.isArray(block.exercises) ? block.exercises : [];
  const exercises = raw.map((ex) => {
    if (typeof ex === "string") return ex;
    if (ex && typeof ex === "object") {
      const o = ex as Record<string, unknown>;
      const name = String(o.name ?? o.exercise ?? "Exercise");
      const sets = o.sets != null ? `${o.sets} sets` : "";
      const reps = o.reps != null ? `× ${o.reps}` : "";
      return [name, sets, reps].filter(Boolean).join(" ");
    }
    return "Exercise";
  });
  return { dayIndex: idx, exercises };
}

function sessionForToday(
  sessions: WorkoutSession[],
  plan: WorkoutPlan | null,
  dayIndex: number
): WorkoutSession | undefined {
  const today = startOfLocalDay(new Date());
  const refs = new Set([
    String(dayIndex),
    `day-${dayIndex}`,
    `Day ${dayIndex + 1}`,
  ]);
  return sessions.find((s) => {
    const sd = new Date(s.date);
    if (!sameLocalDay(sd, today)) return false;
    return refs.has(s.planDayRef);
  });
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function ChartTooltipBody(props: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: string;
  valueSuffix: string;
}) {
  const { active, payload, label, valueSuffix } = props;
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  const v =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;
  if (Number.isNaN(v)) return null;
  return (
    <div className="rounded-md border border-surface-border bg-surface px-2 py-1.5 text-xs shadow-lg">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono text-white">
        {v.toLocaleString()}
        {valueSuffix}
      </p>
    </div>
  );
}

// --- page ---

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutsPayload>({
    plan: null,
    sessions: [],
  });
  const [bloodwork, setBloodwork] = useState<BloodWorkRecord[]>([]);

  const triggerRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);
  useAtlasRefresh(triggerRefresh);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [fl, pr, mp, wo, bw] = await Promise.all([
        fetchJson<FoodLogEntry[]>(
          `/api/foodlog?days=${FOOD_LOG_SYNC_DAYS}`,
          [],
        ),
        fetchJson<ProgressEntry[]>("/api/progress", []),
        fetchJson<MealPlan | null>("/api/meals", null),
        fetchJson<WorkoutsPayload>("/api/workouts", {
          plan: null,
          sessions: [],
        }),
        fetchJson<BloodWorkRecord[]>("/api/bloodwork", []),
      ]);
      if (!cancelled) {
        setFoodLog(Array.isArray(fl) ? fl : []);
        setProgress(Array.isArray(pr) ? pr : []);
        setMealPlan(mp);
        setWorkouts(
          wo && typeof wo === "object"
            ? {
                plan: wo.plan ?? null,
                sessions: Array.isArray(wo.sessions) ? wo.sessions : [],
              }
            : { plan: null, sessions: [] }
        );
        setBloodwork(Array.isArray(bw) ? bw : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const todayKey = localDateKey(startOfLocalDay(new Date()));
  const weekRollKey = todayLocalDateKey();

  const todayTotals = useMemo(() => {
    let calories = 0;
    let protein_g = 0;
    let carbs_g = 0;
    let fat_g = 0;
    for (const e of foodLog) {
      if (localDateKey(new Date(e.loggedAt)) !== todayKey) continue;
      const n = parseNutrients(e);
      calories += n.calories ?? 0;
      protein_g += n.protein_g ?? 0;
      carbs_g += n.carbs_g ?? 0;
      fat_g += n.fat_g ?? 0;
    }
    return { calories, protein_g, carbs_g, fat_g };
  }, [foodLog, todayKey]);

  const macroTargets = parseMacroTargets(mealPlan?.macroTargets);
  const calorieTarget = macroTargets?.calories;
  const proteinTarget = macroTargets?.protein_g;
  const carbsTarget = macroTargets?.carbs_g;
  const fatTarget = macroTargets?.fat_g;

  const streak = useMemo(() => foodLogStreak(foodLog), [foodLog]);

  const calorieSeries = useMemo(() => {
    const keys = trackingWeekDateKeysForMealPlan(mealPlan?.weekStart ?? null, new Date());
    return keys.map((key) => {
      const d = new Date(`${key}T12:00:00`);
      const calories = foodLog
        .filter((e) => localDateKey(new Date(e.loggedAt)) === key)
        .reduce((sum, e) => sum + (parseNutrients(e).calories ?? 0), 0);
      return {
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        calories,
      };
    });
  }, [foodLog, mealPlan?.weekStart, weekRollKey]);

  const weightSeries = useMemo(() => {
    const cutoff = startOfLocalDay(new Date());
    cutoff.setDate(cutoff.getDate() - 30);
    return [...progress]
      .filter(
        (p) =>
          p.weight != null &&
          !Number.isNaN(p.weight) &&
          new Date(p.date) >= cutoff
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p) => ({
        label: new Date(p.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        weight: p.weight as number,
      }));
  }, [progress]);

  const recentFood = useMemo(() => {
    return [...foodLog]
      .sort(
        (a, b) =>
          new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
      )
      .slice(0, 3);
  }, [foodLog]);

  const flaggedMarkers = useMemo(() => {
    const list: BloodWorkMarker[] = [];
    for (const rec of bloodwork) {
      for (const m of rec.markers ?? []) {
        if (m.flagged) list.push(m);
      }
    }
    return list;
  }, [bloodwork]);

  const workoutBlock = useMemo(
    () => todayWorkoutBlock(workouts.plan),
    [workouts.plan]
  );

  const todaySession = useMemo(() => {
    if (!workoutBlock) return undefined;
    return sessionForToday(
      workouts.sessions,
      workouts.plan,
      workoutBlock.dayIndex
    );
  }, [workouts.sessions, workouts.plan, workoutBlock]);

  const checkInText = useMemo(() => nextCheckInLabel(progress), [progress]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Today at a glance — fuel, recovery, and signals.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="border-surface-border bg-card">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24 bg-surface-light" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-full bg-surface-light" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Today&apos;s calories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-[#00ff88]">
                  {Math.round(todayTotals.calories).toLocaleString()}
                  {calorieTarget != null && (
                    <span className="text-lg font-normal text-muted-foreground">
                      {" "}
                      / {Math.round(calorieTarget).toLocaleString()}
                    </span>
                  )}
                </p>
                {calorieTarget == null && (
                  <CardDescription className="mt-1">
                    Add a meal plan for a calorie target.
                  </CardDescription>
                )}
              </CardContent>
            </Card>

            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Macro split
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Logged today vs plan daily target
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border border-[#00ff88]/25 bg-[#00ff88]/5 px-2 py-2">
                    <p className="font-mono text-sm font-semibold text-[#00ff88]">
                      P {Math.round(todayTotals.protein_g)}g
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {proteinTarget != null
                        ? `target ${Math.round(proteinTarget)}g`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#00aaff]/25 bg-[#00aaff]/5 px-2 py-2">
                    <p className="font-mono text-sm font-semibold text-[#00aaff]">
                      C {Math.round(todayTotals.carbs_g)}g
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {carbsTarget != null
                        ? `target ${Math.round(carbsTarget)}g`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#ffaa00]/25 bg-[#ffaa00]/5 px-2 py-2">
                    <p className="font-mono text-sm font-semibold text-[#ffaa00]">
                      F {Math.round(todayTotals.fat_g)}g
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {fatTarget != null ? `target ${Math.round(fatTarget)}g` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Log streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-[#ffaa00]">
                  {streak}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    days
                  </span>
                </p>
                <CardDescription className="mt-1">
                  Consecutive days with food log entries.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Next check-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-[#00aaff]">
                  {checkInText}
                </p>
                <CardDescription className="mt-1">
                  Weekly from your last progress entry.
                </CardDescription>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Separator className="bg-surface-border" />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-surface-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">
              This week (Sun–Sat)
            </CardTitle>
            <CardDescription>
              Daily calorie totals from your food log for the current local week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-md bg-surface-light" />
            ) : calorieSeries.every((d) => d.calories === 0) ? (
              <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                No calories logged this week yet.
              </p>
            ) : (
              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={calorieSeries}>
                    <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#888", fontSize: 11 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                    />
                    <YAxis
                      width={44}
                      tick={{ fill: "#888", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={(tipProps) => (
                        <ChartTooltipBody
                          active={tipProps.active}
                          payload={tipProps.payload}
                          label={tipProps.label as string | undefined}
                          valueSuffix=" kcal"
                        />
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="calories"
                      stroke={NEON_GREEN}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: NEON_GREEN }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-surface-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">
              Weight (30 days)
            </CardTitle>
            <CardDescription>From progress check-ins</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-md bg-surface-light" />
            ) : weightSeries.length === 0 ? (
              <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                No weight entries in the last 30 days.
              </p>
            ) : (
              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightSeries}>
                    <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#888", fontSize: 11 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                    />
                    <YAxis
                      width={44}
                      tick={{ fill: "#888", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      content={(tipProps) => (
                        <ChartTooltipBody
                          active={tipProps.active}
                          payload={tipProps.payload}
                          label={tipProps.label as string | undefined}
                          valueSuffix=""
                        />
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke={NEON_BLUE}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: NEON_BLUE }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className="bg-surface-border" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent food */}
        <Card className="border-surface-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">Recent food log</CardTitle>
            <CardDescription>Latest three entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-14 w-full bg-surface-light" />
                <Skeleton className="h-14 w-full bg-surface-light" />
                <Skeleton className="h-14 w-full bg-surface-light" />
              </>
            ) : recentFood.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No food logged yet. Start tracking to see entries here.
              </p>
            ) : (
              recentFood.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-surface-border bg-surface/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {e.description}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {e.mealType}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm text-[#00ff88]">
                      {Math.round(parseNutrients(e).calories ?? 0)} kcal
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.loggedAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Flagged blood work */}
        <Card className="border-surface-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-white">
              Flagged blood work
            </CardTitle>
            <CardDescription>
              Outside target/reference or marked abnormal on your lab report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full bg-surface-light" />
                <Skeleton className="h-12 w-full bg-surface-light" />
              </>
            ) : flaggedMarkers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No flagged markers. Upload labs to see alerts here.
              </p>
            ) : (
              flaggedMarkers.map((m) => {
                const refLow = m.referenceMin;
                const refHigh = m.referenceMax;
                const high = refHigh != null && m.value > refHigh;
                const low = refLow != null && m.value < refLow;
                const accent = high || low ? "destructive" : "secondary";
                const label = high ? "High" : low ? "Low" : "Flagged";
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-[#ffaa00]/25 bg-[#ffaa00]/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {m.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.value} {m.unit}
                        {refLow != null || refHigh != null
                          ? ` · ref ${refLow ?? "—"}–${refHigh ?? "—"}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      variant={accent}
                      className={
                        high || low
                          ? "shrink-0"
                          : "shrink-0 border-[#ffaa00]/50 bg-[#ffaa00]/20 text-[#ffaa00]"
                      }
                    >
                      {label}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today&apos;s workout */}
      <Card className="border-surface-border bg-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base text-white">
              Today&apos;s workout
            </CardTitle>
            <CardDescription>From your current weekly plan</CardDescription>
          </div>
          {!loading && todaySession?.completed && (
            <Badge
              variant="outline"
              className="border-[#00ff88]/50 text-[#00ff88]"
            >
              <Check className="mr-1 h-3 w-3" />
              Done
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full bg-surface-light" />
              <Skeleton className="h-10 w-full bg-surface-light" />
            </div>
          ) : !workouts.plan ? (
            <p className="text-sm text-muted-foreground">
              No workout plan for this week. Ask Atlas to generate one.
            </p>
          ) : !workoutBlock || workoutBlock.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Rest day — no exercises scheduled for today.
            </p>
          ) : (
            <ul className="space-y-2">
              {workoutBlock.exercises.map((line, i) => (
                <li
                  key={`${line}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-surface-border bg-surface/50 px-3 py-2 text-sm text-white"
                >
                  {todaySession?.completed ? (
                    <Check className="h-4 w-4 shrink-0 text-[#00ff88]" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                  )}
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Atlas CTA — visual only; does not control AtlasChat */}
      <Button
        type="button"
        variant="ghost"
        tabIndex={-1}
        className="h-auto w-full p-0 hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-hidden="true"
      >
        <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-[#00ff88]/35 bg-[#00ff88]/5 py-6 text-[#00ff88]">
          <MessageCircle className="h-6 w-6" />
          <span className="text-center text-sm font-medium leading-relaxed text-white">
            Chat with Atlas to get personalized advice
          </span>
          <span className="text-center text-xs text-muted-foreground">
            Use the Atlas panel — this is just a reminder.
          </span>
        </div>
      </Button>
    </div>
  );
}
