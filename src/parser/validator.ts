import type { ParserOutput, ParserTestCase, ParserValidation } from "./types.js";

// Confidence thresholds
const THRESHOLDS = {
  name: 0.60,
  purpose: 0.65,
  quantity: 0.75,
  deadline: 0.80,
};

export function validateParserOutput(
  output: ParserOutput,
  tc: ParserTestCase,
): ParserValidation {
  const expected = tc.expected;
  const details: Record<string, any> = {};

  // 1. Name match (flexible — substring or exact)
  const nameMatch = expected.name === null
    ? output.name === null
    : output.name !== null && (
        output.name.toLowerCase().includes(expected.name.toLowerCase()) ||
        expected.name.toLowerCase().includes(output.name.toLowerCase()) ||
        output.name === expected.name
      );
  details.name = { expected: expected.name, actual: output.name, match: nameMatch };

  // 2. Purpose match
  const purposeMatch = expected.purpose === null
    ? output.purpose === null || (output.confidence?.purpose ?? 0) < THRESHOLDS.purpose
    : output.purpose === expected.purpose;
  details.purpose = { expected: expected.purpose, actual: output.purpose, match: purposeMatch };

  // 3. PlanType match
  const planTypeMatch = expected.planType === null
    ? true  // if expected is null, any planType from purpose is fine
    : output.planType === expected.planType;
  details.planType = { expected: expected.planType, actual: output.planType, match: planTypeMatch };

  // 4. Quantity check
  let quantityCorrect = true;
  if (expected.startValue !== undefined) {
    if (expected.startValue === null) {
      quantityCorrect = quantityCorrect && (output.startValue === null || output.startValue === undefined);
    } else {
      quantityCorrect = quantityCorrect && output.startValue === expected.startValue;
    }
  }
  if (expected.endValue !== undefined) {
    if (expected.endValue === null) {
      quantityCorrect = quantityCorrect && (output.endValue === null || output.endValue === undefined);
    } else {
      quantityCorrect = quantityCorrect && output.endValue === expected.endValue;
    }
  }
  if (expected.totalQuantity !== undefined) {
    if (expected.totalQuantity === null) {
      quantityCorrect = quantityCorrect && (output.totalQuantity === null || output.totalQuantity === undefined);
    } else {
      quantityCorrect = quantityCorrect && output.totalQuantity === expected.totalQuantity;
    }
  }
  details.quantity = {
    expected: { start: expected.startValue, end: expected.endValue, total: expected.totalQuantity },
    actual: { start: output.startValue, end: output.endValue, total: output.totalQuantity },
    match: quantityCorrect,
  };

  // 5. Deadline check
  let deadlineCorrect = true;
  if (expected.deadline !== undefined) {
    if (expected.deadline === null) {
      deadlineCorrect = output.deadline === null || output.deadline === undefined;
    } else {
      deadlineCorrect = output.deadline === expected.deadline;
    }
  }
  details.deadline = { expected: expected.deadline, actual: output.deadline, match: deadlineCorrect };

  // 6. ExamPrep match
  const examPrepMatch = output.examPrep === expected.examPrep;
  details.examPrep = { expected: expected.examPrep, actual: output.examPrep, match: examPrepMatch };

  // 7. Skip decision check
  const conf = output.confidence ?? { name: 0, purpose: 0, quantity: 0, deadline: 0 };
  const actualSkipped: string[] = [];
  const actualShown: string[] = [];

  if (conf.purpose >= THRESHOLDS.purpose && output.purpose !== null) actualSkipped.push("purpose");
  else actualShown.push("purpose");

  if (conf.quantity >= THRESHOLDS.quantity && (output.startValue !== null || output.endValue !== null || output.totalQuantity !== null)) actualSkipped.push("quantity");
  else actualShown.push("quantity");

  if (conf.deadline >= THRESHOLDS.deadline && output.deadline !== null) actualSkipped.push("deadline");
  else actualShown.push("deadline");

  actualShown.push("weekday"); // weekday always shown

  const skipDecisionCorrect =
    expected.expectedSkipped.every(s => actualSkipped.includes(s)) &&
    expected.expectedShown.filter(s => s !== "weekday").every(s => actualShown.includes(s));

  details.skipDecision = {
    expectedSkipped: expected.expectedSkipped,
    actualSkipped,
    expectedShown: expected.expectedShown,
    actualShown,
    match: skipDecisionCorrect,
  };

  // 8. Hard Fail checks
  const hardFails: string[] = [];

  // HF-1: AI가 Description에 없는 숫자를 만들어냄
  if (expected.totalQuantity === null && output.totalQuantity !== null) {
    // Check if the number actually appears in the description
    const desc = tc.input.description;
    const qty = String(output.totalQuantity);
    if (!desc.includes(qty)) {
      hardFails.push("HF-1: Fabricated quantity");
    }
  }
  if (expected.startValue === null && expected.endValue === null &&
      (output.startValue !== null || output.endValue !== null)) {
    const desc = tc.input.description;
    if (output.startValue && !desc.includes(String(output.startValue))) {
      hardFails.push("HF-1: Fabricated start value");
    }
    if (output.endValue && !desc.includes(String(output.endValue))) {
      hardFails.push("HF-1: Fabricated end value");
    }
  }

  // HF-2: 시간 기반 값을 quantity로 변환
  const timePatterns = /(\d+)\s*(hours?|hrs?|minutes?|mins?|시간|분)/i;
  const timeMatch = tc.input.description.match(timePatterns);
  if (timeMatch && output.totalQuantity !== null) {
    const timeNum = parseInt(timeMatch[1]);
    if (output.totalQuantity === timeNum) {
      hardFails.push("HF-2: Time converted to quantity");
    }
  }

  // HF-3: Profile이 Description의 명시적 의도를 override
  if (tc.hardFailChecks.includes("HF-3")) {
    // TC-specific: checked manually based on expected
    if (!examPrepMatch && expected.examPrep === false && output.examPrep === true) {
      hardFails.push("HF-3: Profile overrode description intent");
    }
  }

  // HF-4: 비시험 활동에 examPrep=true
  if (tc.hardFailChecks.includes("HF-4")) {
    if (expected.examPrep === false && output.examPrep === true) {
      hardFails.push("HF-4: examPrep on non-exam activity");
    }
  }

  // HF-5: Category 변경/재추천 (output에 category 필드가 있으면)
  if ((output as any).suggestedCategory || (output as any).category) {
    const outCat = (output as any).suggestedCategory ?? (output as any).category;
    if (outCat && outCat !== tc.input.category) {
      hardFails.push("HF-5: Category change suggested");
    }
  }

  const overallPass =
    nameMatch &&
    purposeMatch &&
    planTypeMatch &&
    quantityCorrect &&
    deadlineCorrect &&
    examPrepMatch &&
    skipDecisionCorrect &&
    hardFails.length === 0;

  return {
    tcId: tc.id,
    parseSuccess: true,
    nameMatch,
    purposeMatch,
    planTypeMatch,
    quantityCorrect,
    deadlineCorrect,
    examPrepMatch,
    skipDecisionCorrect,
    hardFails,
    overallPass,
    details,
  };
}
