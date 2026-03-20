import type { TestCaseInput, PlanSkeleton, TimeFit, StudyPlan } from "../../types.js";
import { calcEffectiveBudget, determineTimeFit } from "../calculator.js";

export function multiSubjectHandler(input: TestCaseInput): PlanSkeleton {
  const budget = input.profile.timeBudget;
  const focusSpan = input.profile.focusSpan;
  const effectiveBudget = calcEffectiveBudget(budget.weekday, focusSpan);
  const totalDailyMin = budget.weekday;

  const subjects = input.subjects ?? [];
  const globalBudgetInfo = (input as any).globalBudget;
  const totalDays = globalBudgetInfo?.totalDays ?? 30;
  const totalAvailableMin = totalDailyMin * totalDays;

  // CPA multi-subject: detect by subject names
  const isCPA = subjects.some(s =>
    ((s as any).name ?? "").toLowerCase().includes("far") ||
    ((s as any).name ?? "").toLowerCase().includes("reg") ||
    ((s as any).name ?? "").toLowerCase().includes("cpa")
  );

  // CSAT (수능) multi-subject
  const isCSAT = subjects.some(s =>
    ((s as any).name ?? "").toLowerCase().includes("korean") ||
    ((s as any).name ?? "").toLowerCase().includes("국어")
  ) && subjects.some(s =>
    ((s as any).name ?? "").toLowerCase().includes("math") ||
    ((s as any).name ?? "").toLowerCase().includes("수학")
  );

  // Midterm panic (3 exams same week)
  const isMidtermPanic = input.emotionProtocol === "panic" && subjects.length >= 3 && totalDays <= 7;

  let allocation: { subject: string; percentage: number }[] = [];
  let plans: StudyPlan[] = [];
  let timeFit: TimeFit;
  let warnings: string[] = [];
  let assumptions: string[] = ["Global budget divided among subjects", "P50 speed assumed"];

  if (isCPA) {
    // CPA FAR+REG: sequential strategy
    const farSubj = subjects.find(s => ((s as any).name ?? "").toLowerCase().includes("far"));
    const regSubj = subjects.find(s => ((s as any).name ?? "").toLowerCase().includes("reg"));

    // FAR retake = ~90hr, REG first = ~120hr, total ~210hr
    // Available: totalAvailableMin / 60 hours
    const availableHours = totalAvailableMin / 60;
    const neededHours = 210; // FAR 90 + REG 120
    const ratio = neededHours / availableHours;

    timeFit = ratio <= 0.9 ? "fits" : ratio <= 1.1 ? "tight" : "deficit";

    allocation = [
      { subject: farSubj ? (farSubj as any).name : "FAR", percentage: 40 },
      { subject: regSubj ? (regSubj as any).name : "REG", percentage: 60 },
    ];

    plans = [
      {
        type: "read",
        label: `${(farSubj as any)?.name ?? "FAR"} — retake targeted review`,
        scope: "FAR retake — weak sections focus",
        priority: "primary",
        effortModel: {
          type: "range",
          expected: 5.0,
          min: 4.0,
          max: 6.5,
          unit: "page",
        },
        estimatedDailyMinutes: Math.round(totalDailyMin * 0.4),
        assumptions: [...assumptions, "FAR retake efficiency: 40-60% time savings"],
      },
      {
        type: "read",
        label: `${(regSubj as any)?.name ?? "REG"} — first attempt`,
        scope: "REG fresh start",
        priority: "secondary",
        effortModel: {
          type: "range",
          expected: 3.5,
          min: 2.5,
          max: 5.0,
          unit: "page",
        },
        estimatedDailyMinutes: Math.round(totalDailyMin * 0.6),
        assumptions: [...assumptions, "REG first attempt — full study required"],
      },
    ];

    warnings = [
      "Sequential strategy recommended: FAR first (4 weeks), then REG (6 weeks)",
      "50/50 equal split = REG insufficient hours",
    ];

  } else if (isCSAT) {
    // CSAT: grade-based allocation
    const mathSubj = subjects.find(s =>
      ((s as any).name ?? "").toLowerCase().includes("math") ||
      ((s as any).name ?? "").toLowerCase().includes("수학")
    );
    const korSubj = subjects.find(s =>
      ((s as any).name ?? "").toLowerCase().includes("korean") ||
      ((s as any).name ?? "").toLowerCase().includes("국어")
    );
    const engSubj = subjects.find(s =>
      ((s as any).name ?? "").toLowerCase().includes("english") ||
      ((s as any).name ?? "").toLowerCase().includes("영어")
    );

    // Allocation: weakest subject gets most time
    allocation = [
      { subject: (mathSubj as any)?.name ?? "Math", percentage: 50 },
      { subject: (korSubj as any)?.name ?? "Korean", percentage: 30 },
      { subject: (engSubj as any)?.name ?? "English", percentage: 20 },
    ];

    timeFit = "tight"; // Marathon CSAT prep is always tight

    plans = [
      {
        type: "practice",
        label: `${(mathSubj as any)?.name ?? "Math"} — weak subject priority`,
        scope: "Math grade improvement",
        priority: "primary",
        effortModel: {
          type: "range",
          expected: 12,
          min: 8,
          max: 18,
          unit: "problem",
        },
        estimatedDailyMinutes: Math.round(totalDailyMin * 0.5),
        assumptions: [...assumptions, "Grade 4 = highest improvement potential"],
      },
      {
        type: "read",
        label: `${(korSubj as any)?.name ?? "Korean"} — steady improvement`,
        scope: "Korean reading comprehension",
        priority: "secondary",
        effortModel: {
          type: "range",
          expected: 8.5,
          min: 7.0,
          max: 11.0,
          unit: "set",
        },
        estimatedDailyMinutes: Math.round(totalDailyMin * 0.3),
        assumptions: [...assumptions, "Grade 3 — steady improvement target"],
      },
      {
        type: "read",
        label: `${(engSubj as any)?.name ?? "English"} — maintain mode`,
        scope: "English maintenance",
        priority: "secondary",
        effortModel: {
          type: "range",
          expected: 2.0,
          min: 1.5,
          max: 2.5,
          unit: "page",
        },
        estimatedDailyMinutes: Math.round(totalDailyMin * 0.2),
        assumptions: [...assumptions, "Grade 2 absolute grading — maintain mode"],
      },
    ];

    warnings = [
      "Grade-based allocation: weakest subject (Math 4th grade) gets 50%",
      "Equal split = suboptimal — ignore grade differences",
      "Phase plan with mock exam checkpoints required",
    ];

  } else if (isMidtermPanic) {
    // 3 midterms same week: global budget, exam-order priority
    allocation = subjects.map((s, i) => ({
      subject: (s as any).name ?? (s as any).subject ?? `Subject ${i + 1}`,
      percentage: i === 0 ? 45 : i === 1 ? 35 : 20,
    }));

    timeFit = "tight"; // 3 exams in 1 week with 3hr/day = tight by definition

    plans = subjects.map((s, i) => ({
      type: "read" as const,
      label: `${(s as any).name ?? (s as any).subject} — midterm prep`,
      scope: (s as any).name ?? (s as any).subject ?? "Subject",
      priority: (i === 0 ? "primary" : "secondary") as "primary" | "secondary",
      effortModel: {
        type: "range" as const,
        expected: i === 0 ? 5.5 : 4.0,
        min: i === 0 ? 4.8 : 3.0,
        max: i === 0 ? 7.0 : 5.5,
        unit: "page",
      },
      estimatedDailyMinutes: Math.round(totalDailyMin * (allocation[i].percentage / 100)),
      assumptions: [...assumptions, "Exam-order priority: earliest exam gets most focus"],
    }));

    warnings = [
      `Global budget: ${totalDailyMin}min/day shared across ${subjects.length} subjects — perfect coverage not possible`,
      "Exam-order priority: earliest exam first, then shift focus",
      "Triage principle: all subjects perfect = impossible",
    ];

  } else {
    // Default multi-subject handler
    allocation = subjects.map((s, i) => ({
      subject: (s as any).name ?? (s as any).subject ?? `Subject ${i + 1}`,
      percentage: Math.round(100 / subjects.length),
    }));

    timeFit = "tight";

    plans = subjects.map((s, i) => ({
      type: "read" as const,
      label: `${(s as any).name ?? (s as any).subject} — study plan`,
      scope: (s as any).name ?? (s as any).subject ?? "Subject",
      priority: (i === 0 ? "primary" : "secondary") as "primary" | "secondary",
      effortModel: {
        type: "range" as const,
        expected: 4.0,
        min: 3.0,
        max: 5.5,
        unit: "page",
      },
      estimatedDailyMinutes: Math.round(totalDailyMin / subjects.length),
      assumptions: [...assumptions],
    }));

    warnings = [
      `Multi-subject: ${subjects.length} subjects share ${totalDailyMin}min/day budget`,
    ];
  }

  return {
    plans,
    timeFit,
    totalDailyMinutes: totalDailyMin,
    warnings,
    assumptions,
    missingInfo: [],
    globalBudget: {
      totalDailyMin,
      allocation,
      conflictWarning: subjects.length >= 3 ? "Multiple exams — triage required" : undefined,
    },
  };
}
