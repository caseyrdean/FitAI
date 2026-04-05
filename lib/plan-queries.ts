import { prisma } from "@/lib/db/client";
import {
  endExclusiveLocalWeek,
  localDayInPlanWeek,
  startOfLocalWeekSunday,
  toLocalDateOnly,
} from "@/lib/local-week";

/** Meal plan whose local week contains today; if several, newest by `createdAt`. */
export async function getMealPlanForToday(userId: string) {
  const today = toLocalDateOnly(new Date());
  const rows = await prisma.mealPlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const matches = rows.filter((p) => localDayInPlanWeek(today, p.weekStart));
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0];
}

/** Workout plan whose local week contains today; if several, newest by `createdAt`. */
export async function getWorkoutPlanForToday(userId: string) {
  const today = toLocalDateOnly(new Date());
  const rows = await prisma.workoutPlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const matches = rows.filter((p) => localDayInPlanWeek(today, p.weekStart));
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0];
}

/** Sessions in the current local Sunday-week (even if there is no plan). */
export async function getWorkoutSessionsForCurrentLocalWeek(userId: string) {
  const ws = startOfLocalWeekSunday(new Date());
  const we = endExclusiveLocalWeek(ws);
  return prisma.workoutSession.findMany({
    where: { userId, date: { gte: ws, lt: we } },
    orderBy: { date: "asc" },
  });
}
