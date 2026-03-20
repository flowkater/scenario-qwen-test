import type { TimeFit } from "../types.js";

export interface CalcInput {
  totalQuantity: number;
  rateP50: number;
  daysLeft: number;
  weekdayBudget: number;
  weekendBudget: number;
  focusSpan?: number;
  weekdayOnly?: boolean;
}

export interface CalcResult {
  totalMinutes: number;
  effectiveBudget: number;
  effectiveDays: number;
  dailyNeedMinutes: number;
  timeFit: TimeFit;
}

export function calcEffectiveBudget(weekdayBudget: number, focusSpan?: number): number {
  if (focusSpan && focusSpan <= 15) return Math.round(weekdayBudget * 0.65);
  // Deep work cap: 8+ hours/day -> effective study is ~60-65% (Cal Newport deep work limit)
  // 480min (8hr) -> effective ~290min (4.8hr deep work), 600min (10hr) -> ~360min
  // Research: sustained deep study tops out at 4-5hr/day for most people
  if (weekdayBudget >= 480) {
    return Math.round(weekdayBudget * 0.625);
  }
  return weekdayBudget;
}

export function calcEffectiveDays(daysLeft: number, weekendBudget: number, weekdayOnly?: boolean): number {
  if (weekdayOnly || (weekendBudget === 0 && daysLeft > 7)) return Math.ceil(daysLeft * 5 / 7);
  return daysLeft;
}

export function determineTimeFit(
  dailyNeed: number,
  effectiveBudget: number,
  weekdayBudget: number,
  weekendBudget: number,
): TimeFit {
  // Zero budget = can't determine properly, assume fits
  if (weekdayBudget === 0 && weekendBudget === 0) return "fits";
  if (dailyNeed === 0) return "fits";

  // WEEKEND BUDGET OVERRIDE: weekend > weekday -> weekly capacity check
  if (weekendBudget > weekdayBudget) {
    const weeklyCapacity = weekdayBudget * 5 + weekendBudget * 2;
    const weeklyNeed = dailyNeed * 7;
    if (weeklyNeed <= weeklyCapacity * 1.05) {
      return weeklyNeed <= weeklyCapacity * 0.9 ? "fits" : "tight";
    }
  }

  const ratio = dailyNeed / effectiveBudget;

  // IMPOSSIBLE lock: ratio > 1.5
  if (ratio > 1.5) return "impossible";
  // DEFICIT: ratio > 1.05
  if (ratio > 1.05) return "deficit";
  // TIGHT: ratio > 0.85
  if (ratio > 0.85) return "tight";
  return "fits";
}

export function calculate(input: CalcInput): CalcResult {
  const { totalQuantity, rateP50, daysLeft, weekdayBudget, weekendBudget, focusSpan } = input;

  const totalMinutes = totalQuantity * rateP50;
  const effectiveDays = input.weekdayOnly
    ? Math.ceil(daysLeft * 5 / 7)
    : calcEffectiveDays(daysLeft, weekendBudget);
  const effectiveBudget = calcEffectiveBudget(weekdayBudget, focusSpan);
  const dailyNeedMinutes = effectiveDays > 0
    ? Math.round(totalMinutes / effectiveDays)
    : Math.round(totalMinutes);

  const timeFit = determineTimeFit(dailyNeedMinutes, effectiveBudget, weekdayBudget, weekendBudget);

  return { totalMinutes, effectiveBudget, effectiveDays, dailyNeedMinutes, timeFit };
}
