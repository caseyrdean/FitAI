"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { launchAtlas } from "@/lib/atlas-launch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type WeeklyScore = {
  id: string;
  weekStart: string;
  overallScore: number;
  nutritionScore: number;
  workoutScore: number;
  checkinScore: number;
  consistencyScore: number | null;
  summary: string;
  coachingRecap: string;
  highlights: string[];
  actionItems: string[];
  createdAt: string;
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

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<WeeklyScore | null>(null);
  const [history, setHistory] = useState<WeeklyScore[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [c, h] = await Promise.all([
        fetchJson<WeeklyScore | null>("/api/analytics/weekly-score", null),
        fetchJson<WeeklyScore[]>("/api/analytics/weekly-score/history?weeks=16", []),
      ]);
      if (!cancelled) {
        setCurrent(c);
        setHistory(Array.isArray(h) ? h : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(
    () =>
      [...history]
        .sort(
          (a, b) =>
            new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
        )
        .map((w) => ({
          label: new Date(w.weekStart).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          score: w.overallScore,
        })),
    [history],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Weekly review</h1>
        <p className="text-sm text-muted-foreground">
          Review weekly score trends and your top coaching priorities.
        </p>
      </div>

      <Card className="border-surface-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Primary action</CardTitle>
          <CardDescription>Review this week&apos;s top priorities first.</CardDescription>
          <div className="flex gap-3">
            <Link href="/dashboard/meals" className="text-xs text-neon-green hover:underline">
              Go to Meals
            </Link>
            <Link href="/dashboard/workouts" className="text-xs text-neon-green hover:underline">
              Go to Workouts
            </Link>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-fit border-surface-border text-xs"
            onClick={() =>
              launchAtlas({
                mode: "checkin",
                prompt: "Help me prioritize this week's top action items.",
              })
            }
          >
            Ask Atlas about this review
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full rounded-md bg-surface-light" />
          ) : !current ? (
            <p className="text-sm text-muted-foreground">No weekly review yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {(current.actionItems ?? []).slice(0, 3).map((x, i) => (
                <li key={i}>- {x}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-24 w-full rounded-md bg-surface-light" />
          ))
        ) : (
          <>
            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Overall</CardDescription>
                <CardTitle className="text-2xl text-neon-green">
                  {current?.overallScore ?? "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Nutrition</CardDescription>
                <CardTitle className="text-2xl text-white">
                  {current?.nutritionScore ?? "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Workouts</CardDescription>
                <CardTitle className="text-2xl text-white">
                  {current?.workoutScore ?? "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-surface-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Check-in</CardDescription>
                <CardTitle className="text-2xl text-white">
                  {current?.checkinScore ?? "—"}
                </CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </div>

      <Card className="border-surface-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-white">Weekly score trend</CardTitle>
          <CardDescription>Overall score by week (0-100)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[240px] w-full rounded-md bg-surface-light" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weekly scores yet.</p>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "#888", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#00ff88" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-surface-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-white">Latest coaching recap</CardTitle>
          <CardDescription>Most recent weekly analysis and actions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full rounded-md bg-surface-light" />
          ) : !current ? (
            <p className="text-sm text-muted-foreground">No coaching recap yet.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white">{current.coachingRecap || current.summary}</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {Array.isArray(current.actionItems) &&
                  current.actionItems.slice(0, 3).map((x, i) => <li key={i}>- {x}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
