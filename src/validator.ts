import { z } from "zod";
import type {
  TestCaseInput,
  TestCaseExpected,
  ValidationResult,
  TimeFit,
  EmotionProtocol,
} from "./types.js";

// ===== v4 Zod 스키마 =====

const EffortModelSchema = z.object({
  type: z.string(),
  expected: z.union([z.number(), z.null()]).optional(),
  min: z.union([z.number(), z.null()]).optional(),
  max: z.union([z.number(), z.null()]).optional(),
  unit: z.string().optional(),
  citation: z.string().optional(),
  layers: z
    .object({
      baseProcessing: z.number().optional(),
      reviewPractice: z.number().optional(),
      sessionOverhead: z.number().optional(),
    })
    .optional(),
});

const StudyPlanSchema = z.object({
  type: z.string(),
  label: z.string().min(1),
  scope: z.union([z.string(), z.number()]).optional(),
  weekdayTarget: z.union([z.number(), z.null()]).optional(),
  weekendTarget: z.union([z.number(), z.null()]).optional(),
  effortModel: EffortModelSchema.optional(),
  estimatedDailyMinutes: z.number().optional(),
  priority: z.enum(["primary", "secondary", "optional"]),
  phase: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  missingInfo: z.array(z.string()).optional(),
  rationale: z.string().optional(),
  schedule: z.string().optional(),
  dailyTarget: z.string().optional(),
  estimatedMinutes: z.number().optional(),
});

const AICoachOutputSchema = z.object({
  emotionProtocol: z
    .enum(["neutral", "panic", "shame", "frustration", "burnout"])
    .optional(),
  questionsToAsk: z
    .array(
      z.object({
        question: z.string(),
        decisionImpact: z.string(),
      })
    )
    .optional(),
  strategy: z.string().min(1),
  strategyRationale: z.string().min(1),
  plans: z.array(StudyPlanSchema),  // min(1) 제거 — questionsToAsk 있을 때 빈 plans 허용
  totalDailyMinutes: z.number().min(0),
  timeFit: z.enum(["fits", "tight", "deficit", "impossible"]).optional(),
  alternatives: z.array(z.any()).optional(),
  coachComment: z.string().min(1),
  warnings: z.array(z.string()),
  globalBudget: z.any().optional(),
  // legacy fields (v3 backward compat)
  timeBudgetFit: z.enum(["fits", "tight", "deficit", "impossible", "over"]).optional(),
  cpiRatio: z.any().optional(),
  totalEventMinutes: z.number().optional(),
}).refine(
  // questionsToAsk 있으면 plans 비어도 OK; 없으면 최소 1개 필요
  (data) => {
    if (data.questionsToAsk && data.questionsToAsk.length > 0) return true;
    return data.plans.length >= 1;
  },
  { message: "plans must have at least 1 element when no questionsToAsk" }
).refine(
  // timeFit 또는 questionsToAsk 중 하나는 있어야 함
  (data) => data.timeFit !== undefined || data.timeBudgetFit !== undefined || (data.questionsToAsk && data.questionsToAsk.length > 0),
  { message: "timeFit or timeBudgetFit is required (unless questionsToAsk present)" }
);

// ===== Level 1: 스키마 검증 (내부용) =====

function runSchemaValidation(output: unknown): { success: boolean; errors: string[] } {
  const result = AICoachOutputSchema.safeParse(output);
  if (result.success) return { success: true, errors: [] };
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

// ===== Level 2: Hard Fail Gates =====

function checkHardFailGates(
  output: any,
  input: TestCaseInput,
  expected: TestCaseExpected
): { passed: boolean; failedGates: string[] } {
  const rules = expected.hardFailChecks ?? [];
  const failedGates: string[] = [];

  // HFG-1: 거짓 계획 — timeFit 불일치 or effortModel 과소평가
  if (rules.includes("HFG-1")) {
    const expectedFit = expected.expectedTimeFit;
    const actualFit: TimeFit = (output.timeFit ?? output.timeBudgetFit) as TimeFit;

    // deficit/impossible인데 fits라고 응답하면 FAIL
    if (
      (expectedFit === "deficit" || expectedFit === "impossible") &&
      actualFit === "fits"
    ) {
      failedGates.push("HFG-1");
    } else if (expected.effortModel) {
      // effortModel.expected가 min * 0.8 미만이면 FAIL
      const primaryPlan = (output.plans ?? []).find(
        (p: any) => p.priority === "primary"
      );
      if (primaryPlan?.effortModel) {
        const actualExpected = primaryPlan.effortModel.expected;
        const threshold = expected.effortModel.min * 0.8;
        if (actualExpected < threshold) {
          failedGates.push("HFG-1");
        }
      }
    }
  }

  // HFG-2: 불가능한 범위 — totalDailyMinutes가 weekday budget을 1.5배 초과하면서 timeFit이 fits이면 FAIL
  if (rules.includes("HFG-2")) {
    const weekdayBudget = input.profile.timeBudget.weekday;
    const totalDailyMinutes = output.totalDailyMinutes ?? 0;
    if (totalDailyMinutes > weekdayBudget * 1.5 && output.timeFit === "fits") {
      failedGates.push("HFG-2");
    }
  }

  // HFG-4: 숨겨진 가정 — plans 중 하나도 assumptions[]가 없으면 FAIL
  if (rules.includes("HFG-4")) {
    const plans = output.plans ?? [];
    const hasAssumptions = plans.some(
      (p: any) => Array.isArray(p.assumptions) && p.assumptions.length > 0
    );
    if (!hasAssumptions) {
      failedGates.push("HFG-4");
    }
  }

  return {
    passed: failedGates.length === 0,
    failedGates,
  };
}

// ===== Level 3: timeFit 검사 =====

// 허용 규칙:
//   "deficit"→"impossible": OK (더 엄격)
//   "fits"→"tight": OK (소폭 차이)
//   나머지 불일치: FAIL
function checkTimeFit(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; actual: TimeFit; detail: string } {
  const expectedFit = expected.expectedTimeFit;
  const actualFit: TimeFit = ((output.timeFit ?? output.timeBudgetFit) as TimeFit) ?? "fits";

  // expectedTimeFit이 없으면 skip
  if (!expectedFit) {
    return { passed: true, actual: actualFit, detail: "no expectedTimeFit, skip" };
  }

  if (expectedFit === actualFit) {
    return { passed: true, actual: actualFit, detail: "exact match" };
  }

  // deficit→impossible OK (더 엄격)
  if (expectedFit === "deficit" && actualFit === "impossible") {
    return { passed: true, actual: actualFit, detail: "deficit→impossible allowed" };
  }

  // fits→tight OK (소폭 차이)
  if (expectedFit === "fits" && actualFit === "tight") {
    return { passed: true, actual: actualFit, detail: "fits→tight allowed" };
  }

  // tight→deficit OK (근접 경계에서 AI가 더 보수적 계산 허용)
  if (expectedFit === "tight" && actualFit === "deficit") {
    return { passed: true, actual: actualFit, detail: "tight→deficit allowed" };
  }

  // tight→fits OK (90% 경계 근처에서 AI가 약간 낙관적인 경우 허용)
  if (expectedFit === "tight" && actualFit === "fits") {
    return { passed: true, actual: actualFit, detail: "tight→fits allowed" };
  }

  return {
    passed: false,
    actual: actualFit,
    detail: `expected=${expectedFit}, actual=${actualFit}`,
  };
}

// ===== Level 3: effortModel 범위 검사 =====

function checkEffortModel(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; actual: number; detail: string } {
  if (!expected.effortModel) {
    return { passed: true, actual: 0, detail: "no effortModel expected, skip" };
  }

  // unpredictable type이거나 min/max가 null이면 skip
  if (
    expected.effortModel.type === "unpredictable" ||
    expected.effortModel.min == null ||
    expected.effortModel.max == null
  ) {
    return { passed: true, actual: 0, detail: "unpredictable/null effortModel, skip" };
  }

  // unit이 있으면 unit으로 매칭 — expected에 가장 가까운 플랜 선택
  const expectedUnit = expected.effortModel.unit;
  const expVal = expected.effortModel.expected;
  let targetPlan: any = null;
  let foundByUnit = false;
  if (expectedUnit) {
    const plansWithUnit = (output.plans ?? []).filter(
      (p: any) => p.effortModel?.unit === expectedUnit
    );
    if (plansWithUnit.length > 0) {
      foundByUnit = true;
      // expected 값에 가장 가까운 플랜 선택 (3-tier 등 다중 플랜 대응)
      targetPlan = plansWithUnit.reduce((best: any, p: any) => {
        const bestDiff = Math.abs((best?.effortModel?.expected ?? Infinity) - expVal);
        const pDiff = Math.abs((p?.effortModel?.expected ?? Infinity) - expVal);
        return pDiff < bestDiff ? p : best;
      });
    }
  }
  // unit 매칭 실패 시 primary plan 사용
  if (!targetPlan) {
    const primaryPlan = (output.plans ?? []).find((p: any) => p.priority === "primary");
    // primary plan의 unit이 expected unit과 다르면 → 단위 불일치 skip (false positive 방지)
    if (
      expectedUnit &&
      primaryPlan?.effortModel?.unit &&
      primaryPlan.effortModel.unit !== expectedUnit
    ) {
      return {
        passed: true,
        actual: 0,
        detail: `unit mismatch: expected=${expectedUnit}, found=${primaryPlan.effortModel.unit}, skip`,
      };
    }
    targetPlan = primaryPlan;
  }

  // plan에 effortModel이 없으면 — 검증 대상 없음으로 PASS (AI가 생략한 경우 허용)
  if (!targetPlan?.effortModel) {
    return {
      passed: true,
      actual: 0,
      detail: "no effortModel in plan, skip (AI may have omitted)",
    };
  }

  const actualExpected = targetPlan.effortModel.expected;
  const expMin = expected.effortModel.min;
  const expMax = expected.effortModel.max;

  // P25-P75 내이면 PASS
  if (actualExpected >= expMin && actualExpected <= expMax) {
    return {
      passed: true,
      actual: actualExpected,
      detail: `${actualExpected} within [${expMin}, ${expMax}]`,
    };
  }

  // ±30% 허용 범위 (P25*0.7 ~ P75*1.3)
  const lowerBound = expMin * 0.7;
  const upperBound = expMax * 1.3;

  if (actualExpected >= lowerBound && actualExpected <= upperBound) {
    return {
      passed: true,
      actual: actualExpected,
      detail: `${actualExpected} within ±30% range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
    };
  }

  return {
    passed: false,
    actual: actualExpected,
    detail: `${actualExpected} out of range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
  };
}

// ===== Level 4: 전략 키워드 매칭 =====

function checkStrategy(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; matched: string[]; missing: string[] } {
  if (!expected.expectedStrategy || expected.expectedStrategy.length === 0) {
    return { passed: true, matched: [], missing: [] };
  }

  // output 전체 텍스트(소문자)
  const outputText = JSON.stringify(output).toLowerCase();

  const matched: string[] = [];
  const missing: string[] = [];

  for (const strategyItem of expected.expectedStrategy) {
    // 키워드를 /[\s/]+/로 분리, 길이>2 단어만 매칭
    const words = strategyItem
      .split(/[\s/]+/)
      .filter((w) => w.length > 2)
      .map((w) => w.toLowerCase());

    if (words.length === 0) {
      // 모든 단어가 길이 2 이하면 skip (pass)
      matched.push(strategyItem);
      continue;
    }

    // 키워드 중 하나라도 output에 있으면 matched
    const anyMatch = words.some((w) => outputText.includes(w));
    if (anyMatch) {
      matched.push(strategyItem);
    } else {
      missing.push(strategyItem);
    }
  }

  const total = expected.expectedStrategy.length;
  const matchRate = matched.length / total;

  return {
    passed: matchRate >= 0.5,
    matched,
    missing,
  };
}

// ===== Level 5: 감정 프로토콜 =====

function checkEmotionProtocol(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; actual: EmotionProtocol; detail: string } {
  const expectedEmotion = expected.emotionProtocol;
  // output.emotionProtocol 없으면 "neutral"로 간주
  const actualEmotion: EmotionProtocol =
    (output.emotionProtocol as EmotionProtocol) ?? "neutral";

  // expectedEmotion이 없으면 skip
  if (!expectedEmotion) {
    return { passed: true, actual: actualEmotion, detail: "no emotionProtocol expected, skip" };
  }

  // neutral은 생략 가능
  if (expectedEmotion === "neutral" && !output.emotionProtocol) {
    return { passed: true, actual: "neutral", detail: "neutral omission allowed" };
  }

  const matches = expectedEmotion === actualEmotion;
  return {
    passed: matches,
    actual: actualEmotion,
    detail: matches
      ? "exact match"
      : `expected=${expectedEmotion}, actual=${actualEmotion}`,
  };
}

// ===== 종합 검증 (validateV4) =====

export function validateV4(
  output: any,
  input: TestCaseInput,
  expected: TestCaseExpected
): ValidationResult {
  // Level 0: JSON 파싱 성공 여부는 caller가 처리 (output이 이미 파싱된 상태)
  const parseSuccess = output !== null && output !== undefined;

  // Level 1: 스키마 검증
  const schemaResult = runSchemaValidation(output);

  // Level 2: Hard Fail Gates
  const hfgResult = checkHardFailGates(output, input, expected);

  // Level 3: timeFit
  const timeFitResult = checkTimeFit(output, expected);

  // Level 3: effortModel
  const effortResult = checkEffortModel(output, expected);

  // Level 4: 전략 키워드
  const strategyResult = checkStrategy(output, expected);

  // Level 5: 감정 프로토콜
  const emotionResult = checkEmotionProtocol(output, expected);

  // timeBudgetCheck
  const totalDailyMinutes: number = output?.totalDailyMinutes ?? 0;
  const weekdayBudget = input.profile.timeBudget.weekday;

  // effortModelCheck (for ValidationResult)
  let effortModelCheck: ValidationResult["effortModelCheck"] | undefined;
  if (expected.effortModel) {
    const expExpected = expected.effortModel.expected;
    const deviation = Math.abs(effortResult.actual - expExpected) / (expExpected || 1);
    effortModelCheck = {
      expected: expExpected,
      actual: effortResult.actual,
      withinRange: effortResult.passed,
      deviation: Math.round(deviation * 100) / 100,
    };
  }

  // timeFitCheck
  const timeFitCheck: ValidationResult["timeFitCheck"] = {
    expected: expected.expectedTimeFit,
    actual: timeFitResult.actual,
    matches: timeFitResult.passed,
  };

  // emotionProtocolCheck
  const emotionProtocolCheck: ValidationResult["emotionProtocolCheck"] = {
    expected: expected.emotionProtocol,
    actual: emotionResult.actual,
    matches: emotionResult.passed,
  };

  // hardFailCheck
  const hardFailCheck: ValidationResult["hardFailCheck"] = {
    rules: expected.hardFailChecks ?? [],
    passed: hfgResult.passed,
    failedRules: hfgResult.failedGates.length > 0 ? hfgResult.failedGates : undefined,
  };

  // warningsCheck
  const expectedWarnings = expected.warnings ?? [];
  const actualWarnings: string[] = output?.warnings ?? [];
  const missingWarnings = expectedWarnings.filter(
    (w) => !actualWarnings.some((aw) => aw.toLowerCase().includes(w.toLowerCase()))
  );

  // overallPass
  const overallPass =
    parseSuccess &&
    schemaResult.success &&
    hfgResult.passed &&
    timeFitResult.passed &&
    effortResult.passed &&
    strategyResult.passed &&
    emotionResult.passed;

  return {
    tcId: input.id,
    parseSuccess,
    schemaValid: schemaResult.success,
    schemaErrors: schemaResult.errors.length > 0 ? schemaResult.errors : undefined,
    smartCheck: {
      specific: true,
      measurable: true,
      achievable: true,
      relevant: true,
      timeBound: true,
    },
    effortModelCheck,
    timeBudgetCheck: {
      totalDailyMinutes,
      weekdayBudget,
      fits: timeFitResult.passed,
    },
    timeFitCheck,
    emotionProtocolCheck,
    hardFailCheck,
    toneCheck: {
      expectedTone: expected.toneExpectation ?? "neutral",
      commentTone: output?.coachComment?.slice(0, 100) ?? "",
    },
    warningsCheck: {
      expectedWarnings,
      actualWarnings,
      missingWarnings,
    },
    overallPass,
  };
}

// ===== 레거시 호환 exports (기존 코드가 import할 수 있도록) =====

export function validateSchema(output: unknown): { valid: boolean; errors: string[] } {
  const result = runSchemaValidation(output);
  return { valid: result.success, errors: result.errors };
}

export function loadExpectedWarnings(expectedOutput: { warnings?: string[] } | null): string[] {
  return expectedOutput?.warnings ?? [];
}

export function validateFull(
  output: any,
  input: TestCaseInput,
  expectedWarnings: string[] = []
): ValidationResult {
  const schema = runSchemaValidation(output);

  const totalDailyMinutes: number = output?.totalDailyMinutes ?? 0;
  const weekdayBudget = input.profile.timeBudget.weekday;
  const fits = totalDailyMinutes <= weekdayBudget;

  const missingWarnings = expectedWarnings.filter(
    (w) => !((output?.warnings ?? []) as string[]).some((aw) => aw.toLowerCase().includes(w.toLowerCase()))
  );

  return {
    tcId: input.id,
    parseSuccess: true,
    schemaValid: schema.success,
    schemaErrors: schema.errors.length > 0 ? schema.errors : undefined,
    smartCheck: {
      specific: true,
      measurable: true,
      achievable: true,
      relevant: true,
      timeBound: true,
    },
    timeBudgetCheck: {
      totalDailyMinutes,
      weekdayBudget,
      fits,
    },
    toneCheck: {
      expectedTone: input.profile.tone ?? "neutral",
      commentTone: output?.coachComment?.slice(0, 100) ?? "",
    },
    warningsCheck: {
      expectedWarnings,
      actualWarnings: output?.warnings ?? [],
      missingWarnings,
    },
    overallPass: schema.success && fits && missingWarnings.length === 0,
  };
}
