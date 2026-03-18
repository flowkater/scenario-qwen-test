import { z } from "zod";
import type { QwenOutput, TestCaseInput, ValidationResult } from "./types.js";

const StudyPlanSchema = z.object({
  type: z.enum(["read", "practice", "review"]),
  schedule: z.enum(["daily", "event"]),
  label: z.string().min(1),
  scope: z.string().min(1),
  dailyTarget: z.string().min(1),
  estimatedMinutes: z.number().positive(),
  priority: z.enum(["primary", "secondary", "optional"]),
  rationale: z.string().min(1),
});

const QwenOutputSchema = z.object({
  strategy: z.string().min(1),
  strategyRationale: z.string().min(1),
  cpiRatio: z.object({
    c: z.number().min(0).max(100),
    p: z.number().min(0).max(100),
    i: z.number().min(0).max(100),
  }),
  plans: z.array(StudyPlanSchema).min(1),
  totalDailyMinutes: z.number().min(0),
  totalEventMinutes: z.number().min(0),
  timeBudgetFit: z.enum(["fits", "tight", "over"]),
  coachComment: z.string().min(1),
  warnings: z.array(z.string()),
});

export function validateSchema(output: unknown): { valid: boolean; errors: string[] } {
  const result = QwenOutputSchema.safeParse(output);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`),
  };
}

export function validateSmart(output: QwenOutput): ValidationResult["smartCheck"] {
  const plans = output.plans;
  return {
    specific: plans.every(p => p.label.length > 5 && p.scope.length > 3),
    measurable: plans.every(p => /\d/.test(p.dailyTarget)),
    achievable: output.timeBudgetFit !== "over",
    relevant: output.cpiRatio.c + output.cpiRatio.p + output.cpiRatio.i > 0,
    timeBound: plans.some(p => /[Dd]ay/.test(p.dailyTarget) || /\/day/.test(p.dailyTarget)),
  };
}

export function validateCpi(
  output: QwenOutput,
  _input: TestCaseInput
): ValidationResult["cpiCheck"] {
  const dailyPlans = output.plans.filter(p => p.schedule === "daily");
  const cMinutes = dailyPlans.filter(p => p.type === "read").reduce((s, p) => s + p.estimatedMinutes, 0);
  const pMinutes = dailyPlans.filter(p => p.type === "practice").reduce((s, p) => s + p.estimatedMinutes, 0);
  const iMinutes = dailyPlans.filter(p => p.type === "review").reduce((s, p) => s + p.estimatedMinutes, 0);
  const total = cMinutes + pMinutes + iMinutes || 1;

  const actualRatio = {
    c: Math.round((cMinutes / total) * 100),
    p: Math.round((pMinutes / total) * 100),
    i: Math.round((iMinutes / total) * 100),
  };

  const expectedRatio = output.cpiRatio;
  const deviation = Math.max(
    Math.abs(actualRatio.c - expectedRatio.c),
    Math.abs(actualRatio.p - expectedRatio.p),
    Math.abs(actualRatio.i - expectedRatio.i),
  );

  return {
    ratioMatchesPlan: deviation <= 15,
    expectedRatio,
    actualRatio,
    deviation,
  };
}

export function validateTimeBudget(
  output: QwenOutput,
  input: TestCaseInput
): ValidationResult["timeBudgetCheck"] {
  const weekdayBudget = input.profile.timeBudget.weekday;
  const fits = output.totalDailyMinutes <= weekdayBudget;

  const bigEvents = output.plans.filter(
    p => p.schedule === "event" && p.estimatedMinutes > 60
  );
  const eventsOnWeekend = bigEvents.length === 0 ||
    bigEvents.every(p => /[Ww]eekend|[Ss]at|[Ss]un/.test(p.dailyTarget));

  return {
    totalDailyMinutes: output.totalDailyMinutes,
    weekdayBudget,
    fits,
    eventsOnWeekend,
  };
}

export function loadExpectedWarnings(expectedOutput: { warnings?: string[] } | null): string[] {
  return expectedOutput?.warnings ?? [];
}

export function validateFull(
  output: QwenOutput,
  input: TestCaseInput,
  expectedWarnings: string[] = []
): ValidationResult {
  const schema = validateSchema(output);
  const smart = validateSmart(output);
  const cpi = validateCpi(output, input);
  const time = validateTimeBudget(output, input);

  const missingWarnings = expectedWarnings.filter(
    w => !output.warnings.some(aw => aw.toLowerCase().includes(w.toLowerCase()))
  );

  return {
    tcId: input.id,
    parseSuccess: true,
    schemaValid: schema.valid,
    schemaErrors: schema.errors.length ? schema.errors : undefined,
    smartCheck: smart,
    cpiCheck: cpi,
    timeBudgetCheck: time,
    toneCheck: {
      expectedTone: input.profile.tone,
      commentTone: output.coachComment,
    },
    warningsCheck: {
      expectedWarnings,
      actualWarnings: output.warnings,
      missingWarnings,
    },
    overallPass: schema.valid &&
      Object.values(smart).every(Boolean) &&
      cpi.ratioMatchesPlan &&
      time.fits &&
      time.eventsOnWeekend,
  };
}
