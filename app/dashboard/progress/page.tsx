"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { launchAtlas } from "@/lib/atlas-launch";
import { Button } from "@/components/ui/button";
import { ProgressChart, type ProgressChartPoint } from "@/components/progress-chart";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type ProgressApiEntry = {
  id: string;
  date: string;
  weight: number | null;
  energyLevel: number | null;
  notes: string | null;
};

function toChartPoint(e: ProgressApiEntry): ProgressChartPoint {
  return {
    date: e.date,
    weight: e.weight ?? null,
    energyLevel: e.energyLevel ?? null,
  };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function ProgressPage() {
  const [entries, setEntries] = useState<ProgressApiEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [energyLevel, setEnergyLevel] = useState("7");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    const res = await fetch("/api/progress", { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as ProgressApiEntry[];
    return Array.isArray(data) ? data : [];
  }, []);

  const refreshProgress = useCallback(async () => {
    try {
      const data = await loadEntries();
      setEntries(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load progress");
    }
  }, [loadEntries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadEntries();
        if (!cancelled) {
          setEntries(data);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load progress");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEntries]);

  useAtlasRefresh(
    () => {
      void refreshProgress();
    },
    { scopes: ["progress"] },
  );

  const chartData = useMemo(() => {
    if (!entries) return [];
    return [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(toChartPoint);
  }, [entries]);

  const stats = useMemo(() => {
    if (!entries || entries.length === 0) {
      return { currentWeight: null as number | null, avgEnergy7: null as number | null, total: 0 };
    }
    const sorted = [...entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const currentWeight =
      sorted.find((e) => e.weight != null && Number.isFinite(Number(e.weight)))?.weight ?? null;

    const now = startOfDay(new Date());
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentEnergy = entries
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= weekAgo.getTime() && e.energyLevel != null;
      })
      .map((e) => Number(e.energyLevel));
    const avgEnergy7 =
      recentEnergy.length > 0
        ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length
        : null;

    return { currentWeight, avgEnergy7, total: entries.length };
  }, [entries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const w = weight.trim() === "" ? undefined : Number(weight);
    if (weight.trim() !== "" && !Number.isFinite(w)) {
      setSubmitError("Enter a valid weight or leave it blank.");
      return;
    }
    const en = Number(energyLevel);
    if (!Number.isFinite(en) || en < 1 || en > 10) {
      setSubmitError("Energy must be between 1 and 10.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: w,
          energyLevel: Math.round(en),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await loadEntries();
      setEntries(data);
      setWeight("");
      setEnergyLevel("7");
      setNotes("");
      dispatchFitaiRefresh({
        source: "progress",
        scopes: ["progress", "analytics", "dashboard"],
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Progress</h1>
        <Card className="border-destructive/50 bg-card">
          <CardHeader>
            <CardTitle className="text-destructive">Could not load data</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48 bg-surface-light" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-lg bg-surface-light" />
          <Skeleton className="h-28 rounded-lg bg-surface-light" />
          <Skeleton className="h-28 rounded-lg bg-surface-light" />
        </div>
        <Skeleton className="h-80 rounded-xl bg-surface-light" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Log today first, then review trends. Weight and energy are self-reported with{" "}
          <Badge variant="outline" className="border-neon-amber/40 text-neon-amber">
            ~est.
          </Badge>{" "}
          where applicable.
        </p>
      </div>

      <Card className="border-surface-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Primary action</CardTitle>
          <CardDescription>
            Add your quick log below, then use the chart to review trend direction.
          </CardDescription>
          <Link href="/dashboard/analytics" className="text-xs text-neon-green hover:underline">
            Go to Weekly Review
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-fit border-surface-border text-xs"
            onClick={() =>
              launchAtlas({
                mode: "chat",
                prompt: "Review my recent progress trend and suggest one adjustment.",
              })
            }
          >
            Ask Atlas about this trend
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-surface-border bg-surface-light">
          <CardHeader className="pb-2">
            <CardDescription>Current weight</CardDescription>
            <CardTitle className="text-neon-green">
              {stats.currentWeight != null ? String(stats.currentWeight) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Latest logged value (your units)</span>
          </CardContent>
        </Card>

        <Card className="border-surface-border bg-surface-light">
          <CardHeader className="pb-2">
            <CardDescription>7-day avg energy</CardDescription>
            <CardTitle className="text-neon-blue">
              {stats.avgEnergy7 != null ? stats.avgEnergy7.toFixed(1) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Scale 1–10</span>
          </CardContent>
        </Card>

        <Card className="border-surface-border bg-surface-light">
          <CardHeader className="pb-2">
            <CardDescription>Total entries</CardDescription>
            <CardTitle className="text-white">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Last 90 days from API</span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-surface-border bg-surface-light">
        <CardHeader>
          <CardTitle className="text-white">Weight &amp; energy</CardTitle>
          <CardDescription>
            Green: weight (left axis). Blue: energy (right axis, 1–10).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No progress entries yet. Add one below.
            </p>
          ) : (
            <ProgressChart data={chartData} />
          )}
        </CardContent>
      </Card>

      <Card className="border-surface-border bg-surface-light">
        <CardHeader>
          <CardTitle className="text-white">Log details</CardTitle>
          <CardDescription>Save your daily progress check-in.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="weight" className="text-sm font-medium text-gray-300">
                  Weight <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 175"
                  value={weight}
                  onChange={(ev) => setWeight(ev.target.value)}
                  className="border-surface-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="energy" className="text-sm font-medium text-gray-300">
                  Energy level (1–10)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    id="energy"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={energyLevel}
                    onChange={(ev) => setEnergyLevel(ev.target.value)}
                    className="h-2 cursor-pointer accent-neon-blue"
                  />
                  <span className="w-8 tabular-nums text-neon-blue">{energyLevel}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium text-gray-300">
                Notes
              </label>
              <Textarea
                id="notes"
                placeholder="Sleep, stress, training, etc."
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
                className="border-surface-border bg-background"
              />
            </div>
            {submitError ? (
              <p className="text-sm text-destructive">{submitError}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-neon-green text-black hover:bg-neon-green/90"
            >
              {submitting ? "Saving…" : "Save entry"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
