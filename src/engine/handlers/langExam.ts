import type { TestCaseInput, PlanSkeleton, TimeFit } from "../../types.js";
import { RATE_TABLE } from "../rates.js";

/**
 * TOEFL/JLPT score-based handler.
 * resources=[] + score-gap based calculation.
 */
export function langExamHandler(input: TestCaseInput): PlanSkeleton {
  const budget = input.profile.timeBudget;
  const msg = (input.userMessage ?? "").toLowerCase();

  // Parse current score and target from userMessage
  let currentScore = 0;
  let targetScore = 100;

  // "current score is about 80, target is 100"
  const currentMatch = msg.match(/(?:current|현재|about)\s*(?:score\s*(?:is\s*)?)?(?:about\s*)?(\d+)/);
  if (currentMatch) currentScore = parseInt(currentMatch[1]);

  const targetMatch = msg.match(/(?:target|목표|need)\s*(?:is\s*|score\s*)?(\d+)/);
  if (targetMatch) targetScore = parseInt(targetMatch[1]);

  // "Currently around 90"
  if (!currentScore) {
    const aroundMatch = msg.match(/currently\s*(?:around\s*)?(\d+)/);
    if (aroundMatch) currentScore = parseInt(aroundMatch[1]);
  }

  // "현재 85점"
  if (!currentScore) {
    const korMatch = msg.match(/(\d+)\s*점/);
    if (korMatch) currentScore = parseInt(korMatch[1]);
  }

  // "100+"
  if (msg.includes("100+")) targetScore = 100;

  const scoreGap = targetScore - currentScore;
  const daysLeft = 60; // "2 months" default for TOEFL
  const weekdayOnly = budget.weekend === 0;

  // Calculate effective study days
  let effectiveDays = daysLeft;
  if (weekdayOnly) {
    effectiveDays = Math.ceil(daysLeft * 5 / 7);
  }

  // Total available hours
  const dailyHours = budget.weekday / 60;
  const totalAvailableHours = effectiveDays * dailyHours;

  // TOEFL: ~100hr per 10 points for low range (below 90), ~135hr for high range (90+)
  let totalNeededHours = 0;

  if (scoreGap <= 0) {
    totalNeededHours = 0;
  } else {
    // Split into ranges
    const lowGap = Math.min(scoreGap, Math.max(0, 90 - currentScore)); // points below 90
    const highGap = scoreGap - lowGap; // points above 90

    const lowRate = RATE_TABLE.langExam["toefl-per-10pts-low"].p50; // 70hr per 10pts
    const highRate = RATE_TABLE.langExam["toefl-per-10pts-high"].p50; // 135hr per 10pts

    totalNeededHours = (lowGap / 10) * lowRate + (highGap / 10) * highRate;
  }

  const ratio = totalAvailableHours > 0 ? totalNeededHours / totalAvailableHours : Infinity;

  let timeFit: TimeFit;
  if (ratio <= 0.9) timeFit = "fits";
  else if (ratio <= 1.15) timeFit = "tight";
  else if (ratio <= 2.0) timeFit = "deficit";
  else timeFit = "impossible";

  const dailyNeedMinutes = daysLeft > 0 ? Math.round((totalNeededHours * 60) / daysLeft) : 0;

  const warnings: string[] = [];
  if (timeFit === "impossible" || timeFit === "deficit") {
    warnings.push(`${Math.round(totalAvailableHours)}hr available for ${scoreGap}-point gain requiring ~${Math.round(totalNeededHours)}hr`);
  }

  return {
    plans: [{
      type: "practice",
      label: `TOEFL ${currentScore}→${targetScore} study plan`,
      scope: `${scoreGap}-point improvement`,
      priority: "primary",
      effortModel: {
        type: "fixed",
        expected: 0,
        min: 0,
        max: 0,
        unit: "session",
        citation: `TOEFL score gain: ~100hr per 10pts (low range), ~135hr per 10pts (high range)`,
      },
      estimatedDailyMinutes: dailyNeedMinutes,
      assumptions: [
        "P50 TOEFL score-gain rates assumed",
        `${currentScore}→${targetScore}: ${scoreGap}pts, ~${Math.round(totalNeededHours)}hr needed`,
        `Available: ${Math.round(totalAvailableHours)}hr (${effectiveDays} days × ${dailyHours}hr/day)`,
      ],
    }],
    timeFit,
    totalDailyMinutes: dailyNeedMinutes,
    warnings,
    assumptions: [
      "TOEFL score-gain: non-linear (higher scores need more hours per point)",
      `Available budget: ${Math.round(totalAvailableHours)}hr total`,
    ],
    missingInfo: [],
    alternatives: timeFit === "impossible" ? [
      { label: "Adjust target", description: `Realistic target: ${currentScore + Math.floor(totalAvailableHours / 10)}`, timeFit: "tight" },
      { label: "Extend timeline", description: "More months needed for full score gain", timeFit: "fits" },
      { label: "Increase daily hours", description: "Double daily study time", timeFit: "tight" },
    ] : undefined,
  };
}
