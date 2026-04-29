import { prisma } from "@/lib/db/client";
import {
  endExclusiveLocalWeek,
  parseWeekStartToLocalSunday,
  startOfLocalWeekSunday,
} from "@/lib/local-week";

const DAY_MS = 24 * 60 * 60 * 1000;
function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function streakFromDateKeys(keys: Set<string>, endDate: Date): number {
  let streak = 0;
  const cursor = new Date(endDate);
  cursor.setHours(0, 0, 0, 0);
  while (keys.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function safeNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

type WeeklyComponentScores = {
  nutritionScore: number;
  workoutScore: number;
  checkinScore: number;
  consistencyScore: number;
  overallScore: number;
};

type WeeklyScoreResult = WeeklyComponentScores & {
  summary: string;
  coachingRecap: string;
  highlights: string[];
  actionItems: string[];
  weekStart: Date;
};

export function scoreFromSignals(input: {
  loggedDays: number;
  totalCalories: number;
  calorieTargetTotal: number;
  completedWorkoutDays: number;
  plannedWorkoutDays: number;
  hasCheckinThisWeek: boolean;
  foodStreak: number;
  workoutStreak: number;
}): WeeklyComponentScores {
  const logCoverage = (input.loggedDays / 7) * 100;
  const calorieAdherence =
    input.calorieTargetTotal > 0
      ? 100 - Math.min(100, Math.abs(input.totalCalories - input.calorieTargetTotal) / input.calorieTargetTotal * 100)
      : 70;
  const nutritionScore = clampScore(logCoverage * 0.7 + calorieAdherence * 0.3);
  const workoutCompletion =
    input.plannedWorkoutDays > 0
      ? (input.completedWorkoutDays / input.plannedWorkoutDays) * 100
      : 60;
  const workoutScore = clampScore(workoutCompletion);
  const checkinScore = input.hasCheckinThisWeek ? 100 : 35;
  const consistencyScore = clampScore(
    Math.min(100, input.foodStreak * 14) * 0.6 +
      Math.min(100, input.workoutStreak * 20) * 0.4,
  );
  const overallScore = clampScore(
    nutritionScore * 0.4 +
      workoutScore * 0.3 +
      checkinScore * 0.2 +
      consistencyScore * 0.1,
  );
  return {
    nutritionScore,
    workoutScore,
    checkinScore,
    consistencyScore,
    overallScore,
  };
}

export async function computeWeeklyScore(
  userId: string,
  weekStartInput?: string,
): Promise<WeeklyScoreResult> {
  const anchor = weekStartInput
    ? parseWeekStartToLocalSunday(weekStartInput, new Date())
    : startOfLocalWeekSunday(new Date());
  const weekStart = new Date(anchor);
  const weekEnd = endExclusiveLocalWeek(weekStart);

  const [foodLogs, workoutsPayload, mealPlan, checkinMessages] = await Promise.all([
    prisma.foodLogEntry.findMany({
      where: { userId, loggedAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { loggedAt: "asc" },
    }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: weekStart, lt: weekEnd } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mealPlan.findFirst({
      where: { userId, weekStart: { gte: weekStart, lt: weekEnd } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.atlasMessage.findMany({
      where: {
        role: "assistant",
        createdAt: { gte: weekStart, lt: weekEnd },
        conversation: { userId, type: "checkin" },
      },
      select: { toolCalls: true },
    }),
  ]);

  const loggedDayKeys = new Set(foodLogs.map((f) => localDateKey(new Date(f.loggedAt))));
  const totalCalories = foodLogs.reduce((sum, row) => {
    const payload = (row.nutrients ?? {}) as Record<string, unknown>;
    return sum + safeNum(payload.calories);
  }, 0);
  const targets = (mealPlan?.macroTargets ?? {}) as Record<string, unknown>;
  const calorieTargetDaily = safeNum(targets.calories || targets.daily_calories);
  const calorieTargetTotal = calorieTargetDaily > 0 ? calorieTargetDaily * 7 : 0;

  const latestByRef = new Map<string, { createdAt: Date; completed: boolean }>();
  for (const s of workoutsPayload) {
    const prev = latestByRef.get(s.planDayRef);
    if (!prev || s.createdAt > prev.createdAt) {
      latestByRef.set(s.planDayRef, { createdAt: s.createdAt, completed: s.completed });
    }
  }
  const plannedWorkoutDays = latestByRef.size;
  const completedWorkoutDays = Array.from(latestByRef.values()).filter((x) => x.completed).length;

  const hasCheckinThisWeek = checkinMessages.some((m) => {
    const asText = JSON.stringify(m.toolCalls ?? "").toLowerCase();
    return asText.includes("generate_meal_plan") || asText.includes("generate_workout_plan");
  });

  const foodStreak = streakFromDateKeys(loggedDayKeys, new Date());
  const completedWorkoutDateKeys = new Set(
    workoutsPayload.filter((s) => s.completed).map((s) => localDateKey(new Date(s.date))),
  );
  const exerciseStreak = streakFromDateKeys(completedWorkoutDateKeys, new Date());

  const scores = scoreFromSignals({
    loggedDays: loggedDayKeys.size,
    totalCalories,
    calorieTargetTotal,
    completedWorkoutDays,
    plannedWorkoutDays,
    hasCheckinThisWeek,
    foodStreak,
    workoutStreak: exerciseStreak,
  });

  const highlights = [
    `Logged nutrition on ${loggedDayKeys.size}/7 days.`,
    `Completed ${completedWorkoutDays}/${Math.max(plannedWorkoutDays, 1)} workout day(s).`,
    hasCheckinThisWeek ? "Completed this week's check-in with Atlas." : "No Atlas check-in saved this week yet.",
  ];
  const actionItems: string[] = [];
  if (scores.nutritionScore < 75) actionItems.push("Log meals daily and aim to stay closer to your calorie target.");
  if (scores.workoutScore < 75) actionItems.push("Complete at least one more planned training day this week.");
  if (!hasCheckinThisWeek) actionItems.push("Run your weekly Atlas check-in to refresh plans and guidance.");
  if (actionItems.length === 0) actionItems.push("Keep your current consistency and repeat this pattern next week.");

  return {
    ...scores,
    summary: `Weekly score ${scores.overallScore}/100 with nutrition ${scores.nutritionScore}, workouts ${scores.workoutScore}, check-in ${scores.checkinScore}.`,
    coachingRecap:
      actionItems.length > 0
        ? `Strong work this week. Next best move: ${actionItems[0]}`
        : "Strong work this week. Keep momentum into next week.",
    highlights,
    actionItems,
    weekStart,
  };
}

export async function upsertWeeklyScore(
  userId: string,
  weekStartInput?: string,
) {
  const computed = await computeWeeklyScore(userId, weekStartInput);
  const row = await prisma.weeklyScore.upsert({
    where: {
      userId_weekStart: { userId, weekStart: computed.weekStart },
    },
    create: {
      userId,
      weekStart: computed.weekStart,
      overallScore: computed.overallScore,
      nutritionScore: computed.nutritionScore,
      workoutScore: computed.workoutScore,
      checkinScore: computed.checkinScore,
      consistencyScore: computed.consistencyScore,
      summary: computed.summary,
      coachingRecap: computed.coachingRecap,
      highlights: computed.highlights,
      actionItems: computed.actionItems,
    },
    update: {
      overallScore: computed.overallScore,
      nutritionScore: computed.nutritionScore,
      workoutScore: computed.workoutScore,
      checkinScore: computed.checkinScore,
      consistencyScore: computed.consistencyScore,
      summary: computed.summary,
      coachingRecap: computed.coachingRecap,
      highlights: computed.highlights,
      actionItems: computed.actionItems,
    },
  });
  return row;
}
