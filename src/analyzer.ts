import type { TestCaseInput, TestCaseExpected, ValidationResult } from "./types.js";

// 러너에서 받는 결과 타입
export type RunResult = {
  input: TestCaseInput;
  expected: TestCaseExpected;
  output: any | null;
  validation: ValidationResult;
  raw: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

// 실패 레벨 판정
function getFailureLevel(validation: ValidationResult): { level: number; type: string; detail: string } {
  if (!validation.parseSuccess) {
    return { level: 0, type: "parse_fail", detail: "JSON 파싱 실패" };
  }
  if (!validation.schemaValid) {
    const errors = validation.schemaErrors ?? [];
    const detail = errors.join("; ") || "스키마 검증 실패";
    return { level: 1, type: "schema_fail", detail };
  }
  if (validation.hardFailCheck && !validation.hardFailCheck.passed) {
    const failed = validation.hardFailCheck.failedRules ?? [];
    return { level: 2, type: "hfg_fail", detail: `HFG 실패: ${failed.join(", ")}` };
  }
  if (validation.timeFitCheck && !validation.timeFitCheck.matches) {
    return {
      level: 3,
      type: "timefit_fail",
      detail: `timeFit 불일치: expected=${validation.timeFitCheck.expected}, actual=${validation.timeFitCheck.actual}`,
    };
  }
  if (validation.effortModelCheck && !validation.effortModelCheck.withinRange) {
    return {
      level: 3,
      type: "effort_fail",
      detail: `effortModel 범위 초과: expected=${validation.effortModelCheck.expected}, actual=${validation.effortModelCheck.actual}, deviation=${validation.effortModelCheck.deviation}`,
    };
  }
  // 전략 키워드 미스 (warningsCheck의 missingWarnings로 proxy)
  if (validation.warningsCheck.missingWarnings.length > 0) {
    return {
      level: 4,
      type: "strategy_fail",
      detail: `누락 경고: ${validation.warningsCheck.missingWarnings.join(", ")}`,
    };
  }
  if (validation.emotionProtocolCheck && !validation.emotionProtocolCheck.matches) {
    return {
      level: 5,
      type: "emotion_fail",
      detail: `감정 프로토콜 불일치: expected=${validation.emotionProtocolCheck.expected}, actual=${validation.emotionProtocolCheck.actual}`,
    };
  }
  return { level: -1, type: "unknown_fail", detail: "알 수 없는 실패" };
}

// 프롬프트 패치 제안 맵핑
export function suggestPromptPatches(failedResults: RunResult[]): Array<{
  failureType: string;
  count: number;
  suggestion: string;
}> {
  const counts: Record<string, number> = {};
  const schemaErrorDetails: string[] = [];

  for (const r of failedResults) {
    const { type } = getFailureLevel(r.validation);
    counts[type] = (counts[type] ?? 0) + 1;

    if (type === "schema_fail" && r.validation.schemaErrors) {
      schemaErrorDetails.push(...r.validation.schemaErrors);
    }
  }

  const suggestions: Array<{ failureType: string; count: number; suggestion: string }> = [];

  const suggestionMap: Record<string, string> = {
    parse_fail: "JSON 예시 추가, response_format 강화",
    hfg_fail: buildHfgSuggestion(failedResults),
    timefit_fail: "budget 계산을 먼저 하고 timeFit 결정 순서 강제",
    effort_fail: "마스터 테이블 값을 시스템 프롬프트에 직접 포함",
    strategy_fail: "TC별 반드시 포함해야 할 전략 힌트 추가",
    emotion_fail: "감정 키워드 매칭 규칙 강화",
  };

  // schema_fail은 세부 유형 분기
  if (counts["schema_fail"]) {
    const hasEmotionMissing = schemaErrorDetails.some(e => e.includes("emotionProtocol"));
    const hasEffortMissing = schemaErrorDetails.some(e => e.includes("effortModel"));
    let schemaSuggestion = "스키마 오류 수정";
    if (hasEmotionMissing) schemaSuggestion = "emotionProtocol은 필수 필드 명시";
    else if (hasEffortMissing) schemaSuggestion = "모든 plan에 effortModel 포함 필수 강조";
    suggestions.push({ failureType: "schema_fail", count: counts["schema_fail"], suggestion: schemaSuggestion });
  }

  for (const [type, count] of Object.entries(counts)) {
    if (type === "schema_fail") continue;
    suggestions.push({
      failureType: type,
      count,
      suggestion: suggestionMap[type] ?? "프롬프트 재검토 필요",
    });
  }

  return suggestions.sort((a, b) => a.failureType < b.failureType ? -1 : 1);
}

function buildHfgSuggestion(failedResults: RunResult[]): string {
  const hfgFailed = failedResults.filter(r => {
    const { type } = getFailureLevel(r.validation);
    return type === "hfg_fail";
  });
  const rules = hfgFailed.flatMap(r => r.validation.hardFailCheck?.failedRules ?? []);
  const hasHfg1 = rules.some(r => r.includes("HFG-1") || r.toLowerCase().includes("deficit"));
  const hasHfg4 = rules.some(r => r.includes("HFG-4") || r.toLowerCase().includes("assumption"));
  if (hasHfg1 && hasHfg4) return "DEFICIT 규칙 강화 + 구체적 예시; assumptions는 반드시 1개 이상 규칙 추가";
  if (hasHfg1) return "DEFICIT 규칙 강화 + 구체적 예시";
  if (hasHfg4) return "assumptions는 반드시 1개 이상 규칙 추가";
  return "HFG 규칙 전반 재검토";
}

// 리포트 생성 - v4 필드 참조
export function generateReport(
  results: RunResult[],
  round: number = 1,
  status: "SUCCESS" | "IN_PROGRESS" | "STALLED" = "IN_PROGRESS",
  roundHistory: Array<{ round: number; passed: number }> = []
): {
  round: number;
  timestamp: string;
  model: string;
  status: "SUCCESS" | "IN_PROGRESS" | "STALLED";
  totalCases: number;
  passed: number;
  failed: number;
  passRate: string;
  failedTCs: Array<{
    id: string;
    failureLevel: number;
    failureType: string;
    detail: string;
    suggestion: string;
  }>;
  roundHistory: Array<{ round: number; passed: number }>;
  costSoFar: { totalTokens: number; estimatedCost: string };
  // legacy TestReport fields for backward compat
  runDate: string;
  results: ValidationResult[];
  summary: {
    parseRate: string;
    schemaRate: string;
    smartRate: string;
    effortModelRate: string;
    timeBudgetRate: string;
    timeFitRate: string;
    emotionProtocolRate: string;
  };
} {
  const passed = results.filter(r => r.validation.overallPass).length;
  const failed = results.length - passed;
  const failedResults = results.filter(r => !r.validation.overallPass);

  // 실패 TC 분류
  const failedTCs = failedResults.map(r => {
    const { level, type, detail } = getFailureLevel(r.validation);
    const patches = suggestPromptPatches([r]);
    const suggestion = patches.find(p => p.failureType === type)?.suggestion ?? "프롬프트 재검토 필요";
    return {
      id: r.validation.tcId,
      failureLevel: level,
      failureType: type,
      detail,
      suggestion,
    };
  });

  // 비용 계산: input $0.0003/1K, output $0.0006/1K
  const totalPromptTokens = results.reduce((sum, r) => sum + r.usage.promptTokens, 0);
  const totalCompletionTokens = results.reduce((sum, r) => sum + r.usage.completionTokens, 0);
  const totalTokens = results.reduce((sum, r) => sum + r.usage.totalTokens, 0);
  const inputCost = (totalPromptTokens / 1000) * 0.0003;
  const outputCost = (totalCompletionTokens / 1000) * 0.0006;
  const estimatedCost = `$${(inputCost + outputCost).toFixed(6)}`;

  const n = results.length;
  const parseCount = results.filter(r => r.validation.parseSuccess).length;
  const schemaCount = results.filter(r => r.validation.schemaValid).length;
  const smartCount = results.filter(r => Object.values(r.validation.smartCheck).every(Boolean)).length;
  const effortCount = results.filter(r => r.validation.effortModelCheck?.withinRange).length;
  const timeBudgetCount = results.filter(r => r.validation.timeBudgetCheck.fits).length;
  const timeFitCount = results.filter(r => r.validation.timeFitCheck?.matches).length;
  const emotionCount = results.filter(r => r.validation.emotionProtocolCheck?.matches).length;

  const passRate = n > 0 ? `${((passed / n) * 100).toFixed(1)}%` : "0%";

  const updatedHistory = [...roundHistory, { round, passed }];

  return {
    round,
    timestamp: new Date().toISOString(),
    model: "qwen3.5-flash",
    status,
    totalCases: n,
    passed,
    failed,
    passRate,
    failedTCs,
    roundHistory: updatedHistory,
    costSoFar: { totalTokens, estimatedCost },
    // legacy
    runDate: new Date().toISOString(),
    results: results.map(r => r.validation),
    summary: {
      parseRate: `${parseCount}/${n}`,
      schemaRate: `${schemaCount}/${n}`,
      smartRate: `${smartCount}/${n}`,
      effortModelRate: `${effortCount}/${n}`,
      timeBudgetRate: `${timeBudgetCount}/${n}`,
      timeFitRate: `${timeFitCount}/${n}`,
      emotionProtocolRate: `${emotionCount}/${n}`,
    },
  };
}

// 요약 출력 - v4 메트릭
export function printSummary(report: ReturnType<typeof generateReport>): void {
  console.log("\n" + "=".repeat(60));
  console.log(`TEST REPORT — Round ${report.round} — ${report.timestamp}`);
  console.log(`Model: ${report.model} | Status: ${report.status}`);
  console.log("=".repeat(60));
  console.log(`\nPassed: ${report.passed}/${report.totalCases} (${report.passRate})`);
  console.log(`Failed: ${report.failed}/${report.totalCases}`);
  console.log(`\nBreakdown:`);
  console.log(`   JSON Parse:        ${report.summary.parseRate}`);
  console.log(`   Schema Valid:      ${report.summary.schemaRate}`);
  console.log(`   SMART Check:       ${report.summary.smartRate}`);
  console.log(`   EffortModel:       ${report.summary.effortModelRate}`);
  console.log(`   TimeBudget:        ${report.summary.timeBudgetRate}`);
  console.log(`   TimeFit:           ${report.summary.timeFitRate}`);
  console.log(`   EmotionProtocol:   ${report.summary.emotionProtocolRate}`);
  console.log(`\nCost: ${report.costSoFar.estimatedCost} (${report.costSoFar.totalTokens} tokens)`);

  if (report.roundHistory.length > 1) {
    console.log(`\nRound History:`);
    for (const h of report.roundHistory) {
      console.log(`   Round ${h.round}: ${h.passed}/${report.totalCases}`);
    }
  }

  console.log(`\nPer-TC Results:`);
  for (const r of report.results) {
    const icon = r.overallPass ? "OK" : "FAIL";
    const issues: string[] = [];
    if (!r.schemaValid) issues.push("schema");
    if (!Object.values(r.smartCheck).every(Boolean)) {
      const failedKeys = Object.entries(r.smartCheck).filter(([, v]) => !v).map(([k]) => k);
      issues.push(`SMART(${failedKeys.join(",")})`);
    }
    if (r.hardFailCheck && !r.hardFailCheck.passed) {
      issues.push(`HFG(${(r.hardFailCheck.failedRules ?? []).join(",")})`);
    }
    if (r.timeFitCheck && !r.timeFitCheck.matches) {
      issues.push(`timeFit(exp:${r.timeFitCheck.expected},got:${r.timeFitCheck.actual})`);
    }
    if (r.effortModelCheck && !r.effortModelCheck.withinRange) {
      issues.push(`effort(dev:${r.effortModelCheck.deviation}%)`);
    }
    if (!r.timeBudgetCheck.fits) issues.push("overBudget");
    if (r.warningsCheck.missingWarnings.length > 0) {
      issues.push(`missingWarnings(${r.warningsCheck.missingWarnings.length})`);
    }
    if (r.emotionProtocolCheck && !r.emotionProtocolCheck.matches) {
      issues.push(`emotion(exp:${r.emotionProtocolCheck.expected},got:${r.emotionProtocolCheck.actual})`);
    }
    console.log(`   [${icon}] ${r.tcId}: ${issues.length ? issues.join(", ") : "all pass"}`);
  }
  console.log("\n" + "=".repeat(60));
}

// 실패 분석 출력 - 실패 레벨별 분류
export function printFailureAnalysis(failedResults: RunResult[]): void {
  if (failedResults.length === 0) {
    console.log("\n모든 TC 통과!");
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`실패 분석 (${failedResults.length}개 TC 실패)`);
  console.log("=".repeat(60));

  // 레벨별 그룹
  const byLevel: Record<number, RunResult[]> = {};
  for (const r of failedResults) {
    const { level } = getFailureLevel(r.validation);
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(r);
  }

  const levelLabels: Record<number, string> = {
    0: "Level 0: Parse 실패",
    1: "Level 1: Schema 실패",
    2: "Level 2: HFG(Hard Fail Gate) 실패",
    3: "Level 3: TimeFit / EffortModel 범위 초과",
    4: "Level 4: 전략 키워드 누락",
    5: "Level 5: 감정 프로토콜 불일치",
  };

  for (const levelStr of Object.keys(byLevel).sort()) {
    const level = Number(levelStr);
    const group = byLevel[level];
    console.log(`\n${levelLabels[level] ?? `Level ${level}`} (${group.length}건)`);
    for (const r of group) {
      const { type, detail } = getFailureLevel(r.validation);
      console.log(`   ${r.validation.tcId} [${type}]: ${detail}`);
    }
  }

  // 패치 제안
  const patches = suggestPromptPatches(failedResults);
  if (patches.length > 0) {
    console.log(`\n프롬프트 패치 제안:`);
    for (const p of patches) {
      console.log(`   [${p.failureType}] x${p.count}: ${p.suggestion}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}
