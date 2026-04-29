import test from "node:test";
import assert from "node:assert/strict";
import { scoreFromSignals } from "@/lib/analytics/weekly-score";

test("weekly score math weights components deterministically", () => {
  const out = scoreFromSignals({
    loggedDays: 7,
    totalCalories: 14000,
    calorieTargetTotal: 14000,
    completedWorkoutDays: 4,
    plannedWorkoutDays: 4,
    hasCheckinThisWeek: true,
    foodStreak: 7,
    workoutStreak: 4,
  });
  assert.equal(out.nutritionScore, 100);
  assert.equal(out.workoutScore, 100);
  assert.equal(out.checkinScore, 100);
  assert.ok(out.consistencyScore >= 80);
  assert.ok(out.overallScore >= 95);
});

test("missing checkin lowers score with same other signals", () => {
  const withCheckin = scoreFromSignals({
    loggedDays: 5,
    totalCalories: 10000,
    calorieTargetTotal: 12000,
    completedWorkoutDays: 2,
    plannedWorkoutDays: 4,
    hasCheckinThisWeek: true,
    foodStreak: 2,
    workoutStreak: 1,
  });
  const noCheckin = scoreFromSignals({
    loggedDays: 5,
    totalCalories: 10000,
    calorieTargetTotal: 12000,
    completedWorkoutDays: 2,
    plannedWorkoutDays: 4,
    hasCheckinThisWeek: false,
    foodStreak: 2,
    workoutStreak: 1,
  });
  assert.equal(withCheckin.checkinScore, 100);
  assert.equal(noCheckin.checkinScore, 35);
  assert.ok(noCheckin.overallScore < withCheckin.overallScore);
});
