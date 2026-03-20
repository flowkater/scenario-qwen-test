import type { TestCaseInput, PlanSkeleton, TimeFit } from "../../types.js";
import { matchReadingRate } from "../matcher.js";
import { calcEffectiveBudget, calcEffectiveDays, determineTimeFit } from "../calculator.js";
import { RATE_TABLE } from "../rates.js";

export function replanHandler(input: TestCaseInput): PlanSkeleton {
  const budget = input.profile.timeBudget;
  const focusSpan = input.profile.focusSpan;
  const effectiveBudget = calcEffectiveBudget(budget.weekday, focusSpan);
  const weekdayOnly = budget.weekend === 0;

  const progress = input.currentProgress;
  const remaining = (progress as any)?.remainingPages ?? (progress as any)?.remainingQuantity ?? 150;
  const daysLeft = (progress as any)?.remainingDays ?? (progress as any)?.daysRemaining ?? input.exam?.daysLeft ?? 14;
  const effectiveDays = calcEffectiveDays(daysLeft, budget.weekend, weekdayOnly);

  // Determine rate from subject context
  const subject = (input.originalPlan as any)?.subject ?? input.exam?.subject ?? input.name ?? "";
  const subjectLower = subject.toLowerCase();

  let rate = RATE_TABLE.reading["general-textbook"];

  if (subjectLower.includes("econ") || subjectLower.includes("경제")) {
    rate = RATE_TABLE.reading["econ-intro"];
  } else if (subjectLower.includes("bar exam") || subjectLower.includes("barbri")) {
    rate = RATE_TABLE.reading["bar-exam-review"];
  } else if (subjectLower.includes("korean") || subjectLower.includes("국어") || subjectLower.includes("수능")) {
    rate = RATE_TABLE.reading["suneung-textbook"];
  } else if (input.resources.length > 0) {
    rate = matchReadingRate(input.resources[0], input.profile, input.exam, input);
  }

  // Bar exam burnout special case: percentage-based calculation
  if (progress && (progress as any).remainingPercentage !== undefined) {
    return barExamReplanHandler(input, progress as any, budget, effectiveBudget, daysLeft);
  }

  // Mock exam replan: mock exam result driven
  if (progress && (progress as any).mockExamResult) {
    return mockExamReplanHandler(input, progress as any, budget, effectiveBudget, daysLeft);
  }

  const totalMinutes = remaining * rate.p50;
  const dailyNeed = effectiveDays > 0 ? Math.round(totalMinutes / effectiveDays) : Math.round(totalMinutes);
  let timeFit = determineTimeFit(dailyNeed, effectiveBudget, budget.weekday, budget.weekend);

  // Conservative bias: students who fell behind should plan realistically
  const hasFallenBehind = ((progress as any)?.daysMissed ?? 0) > 0;
  const replanRatio = effectiveBudget > 0 ? dailyNeed / effectiveBudget : 0;
  if (timeFit === "fits" && hasFallenBehind && replanRatio >= 0.75) {
    timeFit = "tight";
  }

  const warnings: string[] = [];
  if (timeFit === "tight") {
    warnings.push("Tight but feasible — triage priority chapters first");
  } else if (timeFit === "deficit" || timeFit === "impossible") {
    warnings.push(`Daily need ${dailyNeed}min exceeds budget ${budget.weekday}min`);
  }

  return {
    plans: [{
      type: "read",
      label: `${subject || "Replan"} — remaining ${remaining} pages`,
      scope: `${remaining} pages remaining`,
      weekdayTarget: effectiveDays > 0 ? Math.round(remaining / effectiveDays) : remaining,
      effortModel: {
        type: "range",
        expected: rate.p50,
        min: rate.p25,
        max: rate.p75,
        unit: rate.unit,
      },
      estimatedDailyMinutes: dailyNeed,
      priority: "primary",
      assumptions: ["P50 reading speed assumed", "Remainder recalculated from progress"],
    }],
    timeFit,
    totalDailyMinutes: dailyNeed,
    warnings,
    assumptions: ["P50 reading speed assumed", "Remainder recalculated from progress"],
    missingInfo: [],
  };
}

function barExamReplanHandler(
  input: TestCaseInput,
  progress: any,
  budget: { weekday: number; weekend: number },
  effectiveBudget: number,
  daysLeft: number
): PlanSkeleton {
  // Bar exam: ~400hr total, 70% remaining = ~280hr needed
  const totalBarHours = 400;
  const remainingPct = progress.remainingPercentage / 100;
  const remainingHours = Math.round(totalBarHours * remainingPct);
  const availableHours = Math.round(daysLeft * (budget.weekday / 60));

  // Burnout: realistic target is 6hr/day (not 8hr)
  const realisticDailyHours = Math.min(6, budget.weekday / 60);
  const realisticTotalHours = Math.round(daysLeft * realisticDailyHours);

  const dailyNeedMinutes = daysLeft > 0 ? Math.round((remainingHours * 60) / daysLeft) : remainingHours * 60;
  const deficitHours = remainingHours - realisticTotalHours;

  const timeFit: TimeFit = deficitHours > 0 ? "deficit" : "tight";

  return {
    plans: [{
      type: "read",
      label: `Bar Exam — ${progress.remainingPercentage}% remaining`,
      scope: `${progress.remainingPercentage}% material remaining`,
      effortModel: {
        type: "range",
        expected: 6.0,
        min: 4.5,
        max: 8.0,
        unit: "page",
      },
      estimatedDailyMinutes: dailyNeedMinutes,
      priority: "primary",
      assumptions: [
        "P50 reading speed assumed",
        `Bar Exam total ~${totalBarHours}hr, ${progress.remainingPercentage}% remaining = ~${remainingHours}hr`,
        "Burnout recovery: 6hr/day realistic ceiling (not 8hr)",
      ],
    }],
    timeFit,
    totalDailyMinutes: dailyNeedMinutes,
    warnings: [
      `${deficitHours > 0 ? `${deficitHours}hr deficit` : "Tight"} — triage MBE priority`,
      "Burnout recovery: scale down to 6hr/day with planned rest days",
    ],
    assumptions: [
      "P50 reading speed assumed",
      `Realistic daily target: ${realisticDailyHours}hr (burnout recovery)`,
    ],
    missingInfo: [],
    alternatives: [
      { label: "Scale to 6hr/day", description: `${realisticTotalHours}hr total — close to needed`, timeFit: "tight" },
      { label: "MBE triage", description: "Focus on highest-weight subjects only", timeFit: "tight" },
    ],
  };
}

function mockExamReplanHandler(
  input: TestCaseInput,
  progress: any,
  budget: { weekday: number; weekend: number },
  effectiveBudget: number,
  daysLeft: number
): PlanSkeleton {
  const subject = (input.originalPlan as any)?.subject ?? input.exam?.subject ?? "Subject";
  const mockResult = progress.mockExamResult;
  const dailyMinutes = budget.weekday;

  // Suneung Korean 4th grade replan
  const timeFit: TimeFit = "tight";

  return {
    plans: [{
      type: "practice",
      label: `${subject} — replan after mock exam (grade ${mockResult?.grade ?? "?"})`,
      scope: `${mockResult?.issue ?? "Replan"} focus`,
      effortModel: {
        type: "range",
        expected: 8.5,
        min: 7.0,
        max: 11.0,
        unit: "set",
      },
      estimatedDailyMinutes: dailyMinutes,
      priority: "primary",
      assumptions: [
        "P50 speed assumed",
        `Mock exam result: grade ${mockResult?.grade} — diagnosis needed`,
        "Phase-based replan with checkpoint",
      ],
    }],
    timeFit,
    totalDailyMinutes: dailyMinutes,
    warnings: [
      `Mock exam grade ${mockResult?.grade} — root cause diagnosis required before replan`,
    ],
    assumptions: [
      "P50 speed assumed",
      "Phase-based replan with 9 month mock exam as checkpoint",
    ],
    missingInfo: [],
  };
}
