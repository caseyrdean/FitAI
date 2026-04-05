"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  aggregateFromEntries,
  aggregateMacrosFromEntries,
  buildTrendSeriesForDateKeys,
  localDateKeyFromLoggedAt,
  rowsFromTotalsScaled,
  todayLocalDateKey,
  type IntakeRow,
} from "@/lib/nutrients/micronutrients";
import {
  currentLocalWeekDateKeys,
  FOOD_LOG_SYNC_DAYS,
  formatLocalWeekRangeLabel,
  startOfLocalWeekSunday,
} from "@/lib/local-week";

type FoodLogEntry = {
  id: string;
  loggedAt: string;
  nutrients: unknown;
};

const NEON_GREEN = "#00ff88";
const NEON_BLUE = "#00aaff";
const MUTED = "#666";

function formatAmount(n: number | undefined, unit: string): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (v === 0) return "—";
  if (v >= 100) return `${Math.round(v)} ${unit}`;
  if (v >= 10) return `${v.toFixed(1)} ${unit}`;
  return `${v.toFixed(2)} ${unit}`;
}

function PctBadge({ pct }: { pct: number }) {
  const p = Number.isFinite(pct) ? pct : 0;
  const color =
    p >= 100
      ? "border-neon-green/50 text-neon-green"
      : p >= 50
        ? "border-neon-amber/50 text-neon-amber"
        : "border-destructive/50 text-destructive";
  return (
    <Badge variant="outline" className={`font-mono tabular-nums ${color}`}>
      {p}%
    </Badge>
  );
}

function MicronutrientTable({
  title,
  rows,
  intakeColumn = "You (this week)",
  targetColumn = "Target (7× day)",
  description = "Summed from this week's food log vs 7× one-day reference (~est., not lab data).",
}: {
  title: string;
  rows: IntakeRow[];
  intakeColumn?: string;
  targetColumn?: string;
  description?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="border-surface-border bg-surface-light/90">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No rows.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-surface-border bg-surface-light/90">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-2">
        <Table>
          <TableHeader>
            <TableRow className="border-surface-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Nutrient</TableHead>
              <TableHead className="text-right text-muted-foreground">{intakeColumn}</TableHead>
              <TableHead className="text-right text-muted-foreground">{targetColumn}</TableHead>
              <TableHead className="text-right text-muted-foreground">% of target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key} className="border-surface-border">
                <TableCell className="font-medium text-white">{r.label}</TableCell>
                <TableCell className="text-right font-mono text-sm text-gray-200">
                  {formatAmount(r.intake, r.unit)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {r.target} {r.unit}
                </TableCell>
                <TableCell className="text-right">
                  <PctBadge pct={r.pct} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function NutrientsPage() {
  const [entries, setEntries] = useState<FoodLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /** Must be computed in the browser so "today" matches the user's timezone (SSR used server TZ). */
  const [todayKey, setTodayKey] = useState("");

  const triggerRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);
  useAtlasRefresh(triggerRefresh);

  useLayoutEffect(() => {
    setTodayKey(todayLocalDateKey());
  }, [refreshTick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/foodlog?days=${FOOD_LOG_SYNC_DAYS}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const raw = (await res.json()) as unknown;
        const list = Array.isArray(raw) ? raw : [];
        const normalized: FoodLogEntry[] = list
          .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
          .map((row) => {
            let loggedAt = row.loggedAt;
            if (
              loggedAt &&
              typeof loggedAt === "object" &&
              "toISOString" in (loggedAt as object)
            ) {
              loggedAt = (loggedAt as Date).toISOString();
            }
            return {
              id: String(row.id ?? ""),
              loggedAt: typeof loggedAt === "string" ? loggedAt : String(loggedAt ?? ""),
              nutrients: row.nutrients ?? {},
            };
          });
        if (!cancelled) setEntries(normalized);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load food log");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  /** State can lag one frame; always fall back so we never drop rows when `entries` is loaded. */
  const effectiveTodayKey = todayKey || todayLocalDateKey();

  const weekEntries = useMemo(() => {
    if (!entries) return [];
    const set = new Set(currentLocalWeekDateKeys());
    return entries.filter((e) => set.has(localDateKeyFromLoggedAt(e.loggedAt)));
  }, [entries]);

  const weekMacros = useMemo(
    () => aggregateMacrosFromEntries(weekEntries),
    [weekEntries],
  );

  const hasMacrosWeek =
    weekMacros.calories > 0 ||
    weekMacros.protein_g > 0 ||
    weekMacros.carbs_g > 0 ||
    weekMacros.fat_g > 0 ||
    weekMacros.fiber_g > 0;

  const weekRows = useMemo(() => {
    const totals = aggregateFromEntries(weekEntries);
    return rowsFromTotalsScaled(totals, 7);
  }, [weekEntries]);

  const weekRangeLabel = formatLocalWeekRangeLabel(startOfLocalWeekSunday());

  const vitaminRowsWeek = useMemo(
    () => weekRows.filter((r) => r.group === "vitamin"),
    [weekRows],
  );
  const mineralRowsWeek = useMemo(
    () => weekRows.filter((r) => r.group === "mineral"),
    [weekRows],
  );

  const hasLogsWeek = weekEntries.length > 0;

  const hasAnyMicronutrientIntake = useMemo(
    () => weekRows.some((r) => r.intake > 0),
    [weekRows],
  );

  const trendData = useMemo(() => {
    if (!entries) return [];
    return buildTrendSeriesForDateKeys(entries, currentLocalWeekDateKeys());
  }, [entries]);

  const trendSummary = useMemo(() => {
    if (!entries || trendData.length === 0) return null;
    const anyCoverage = trendData.some(
      (d) => d.vitaminsPct > 0 || d.mineralsPct > 0,
    );
    if (!anyCoverage) return null;
    const point =
      trendData.find((d) => d.dateKey === effectiveTodayKey) ??
      trendData[trendData.length - 1];
    return { vit: point.vitaminsPct, min: point.mineralsPct, label: point.label };
  }, [entries, trendData, effectiveTodayKey]);

  const yAxisMax = useMemo(() => {
    let m = 100;
    for (const p of trendData) {
      m = Math.max(m, p.vitaminsPct, p.mineralsPct);
    }
    return Math.min(200, Math.ceil(m / 10) * 10 + 10);
  }, [trendData]);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Micronutrients</h1>
        <Card className="border-destructive/50 bg-card">
          <CardHeader>
            <CardTitle className="text-destructive">Could not load data</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64 bg-surface-light" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-lg bg-surface-light" />
          <Skeleton className="h-96 rounded-lg bg-surface-light" />
        </div>
        <Skeleton className="h-80 rounded-xl bg-surface-light" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Micronutrients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tables and macros use your <span className="text-white/90">current local week</span>{" "}
          (Sun–Sat), matching the dashboard and meals views. Data comes only from your{" "}
          <span className="text-white/90">food log</span> (typed entries and meal-plan quick add both
          estimate nutrients from the same description text). All amounts are{" "}
          <Badge variant="outline" className="border-neon-amber/40 text-neon-amber">
            ~est.
          </Badge>{" "}
          — not lab values.
        </p>
      </div>

      {/* Week macros — always stored on food log rows; visible even when micros are missing */}
      {hasLogsWeek && (
        <Card className="border-surface-border bg-surface-light/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">This week — from your food log (macros)</CardTitle>
            <CardDescription className="text-xs">
              Sum of calories, protein, carbs, fat, and fiber for Sun–Sat ({weekRangeLabel}). The
              micro tables need vitamin/mineral data on those rows (from the estimate pipeline).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasMacrosWeek ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-lg bg-surface-dark/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Calories
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-white">
                    {Math.round(weekMacros.calories)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-dark/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Protein
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-neon-green">
                    {weekMacros.protein_g.toFixed(0)} g
                  </p>
                </div>
                <div className="rounded-lg bg-surface-dark/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Carbs</p>
                  <p className="text-lg font-semibold tabular-nums text-neon-blue">
                    {weekMacros.carbs_g.toFixed(0)} g
                  </p>
                </div>
                <div className="rounded-lg bg-surface-dark/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fat</p>
                  <p className="text-lg font-semibold tabular-nums text-amber-200/90">
                    {weekMacros.fat_g.toFixed(0)} g
                  </p>
                </div>
                <div className="rounded-lg bg-surface-dark/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fiber</p>
                  <p className="text-lg font-semibold tabular-nums text-gray-200">
                    {weekMacros.fiber_g > 0 ? `${weekMacros.fiber_g.toFixed(1)} g` : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This week&apos;s entries have no macro totals stored (unexpected). Try re-saving a
                log entry.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary chips (today&apos;s point on the week chart, when available) */}
      {trendSummary && (
        <div className="flex flex-wrap gap-3">
          <Card className="border-surface-border bg-surface-light/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Vitamins (avg % of daily ref.)</p>
            <p className="text-xl font-semibold tabular-nums text-neon-blue">{trendSummary.vit}%</p>
            <p className="text-[10px] text-muted-foreground">as of {trendSummary.label}</p>
          </Card>
          <Card className="border-surface-border bg-surface-light/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Minerals &amp; fiber (avg %)</p>
            <p className="text-xl font-semibold tabular-nums text-neon-green">{trendSummary.min}%</p>
            <p className="text-[10px] text-muted-foreground">as of {trendSummary.label}</p>
          </Card>
        </div>
      )}

      {/* Vitamins + minerals for the current week */}
      <div>
        <h2 className="mb-1 text-lg font-semibold text-white">This week — intake vs 7× daily target</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Local week <span className="font-medium text-white/90">{weekRangeLabel}</span>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            (today {effectiveTodayKey})
          </span>
        </p>
        {hasLogsWeek && !hasAnyMicronutrientIntake && (
          <p className="mb-3 text-xs text-amber-200/80">
            Your food log has entries this week, but stored rows have no usable{" "}
            <code className="text-[11px]">vitamins</code> /{" "}
            <code className="text-[11px]">minerals</code> (see macros card above). Older entries may
            be macro-only; new logs estimate full nutrients from the description text. Try re-logging a
            meal or adding a new entry.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <MicronutrientTable title="Vitamins" rows={vitaminRowsWeek} />
          <MicronutrientTable title="Minerals &amp; fiber" rows={mineralRowsWeek} />
        </div>
      </div>

      {/* Trend chart — same Sun–Sat week */}
      <Card className="border-surface-border bg-surface-light/90">
        <CardHeader>
          <CardTitle className="text-white">This week — daily coverage</CardTitle>
          <CardDescription>
            Each day is the <strong className="text-foreground">average % of daily reference</strong>{" "}
            for that day&apos;s logged food (vitamins vs minerals &amp; fiber). The dashed line is{" "}
            <strong className="text-foreground">100%</strong> — meeting the full daily reference for
            every nutrient in the group on average for that day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: MUTED, fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={40}
                  domain={[0, yAxisMax]}
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <ReferenceLine
                  y={100}
                  stroke="#888"
                  strokeDasharray="6 4"
                  label={{
                    value: "100% ref.",
                    fill: "#888",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#ccc" }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : Number(value);
                    const n = String(name);
                    if (n === "vitaminsPct") return [`${v}%`, "Vitamins (avg)"];
                    if (n === "mineralsPct") return [`${v}%`, "Minerals & fiber (avg)"];
                    return [v, n] as [string | number, string];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                  formatter={(value) =>
                    value === "vitaminsPct"
                      ? "Vitamins (avg % of daily ref.)"
                      : value === "mineralsPct"
                        ? "Minerals & fiber (avg %)"
                        : value
                  }
                />
                <Line
                  type="monotone"
                  dataKey="vitaminsPct"
                  name="vitaminsPct"
                  stroke={NEON_BLUE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: NEON_BLUE }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="mineralsPct"
                  name="mineralsPct"
                  stroke={NEON_GREEN}
                  strokeWidth={2}
                  dot={{ r: 3, fill: NEON_GREEN }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {trendData.every((d) => d.vitaminsPct === 0 && d.mineralsPct === 0) && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              No micronutrient data for this week yet. Log meals (typed or quick-add); each entry gets
              vitamins and minerals estimated from its description, same as manual logging.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
