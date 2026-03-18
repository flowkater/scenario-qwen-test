import type { QwenOutput, TestCaseInput, TestReport, ValidationResult } from "./types.js";

export function generateReport(
  results: Array<{
    input: TestCaseInput;
    output: QwenOutput | null;
    validation: ValidationResult;
    raw: string;
    latencyMs: number;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>
): TestReport {
  const passed = results.filter(r => r.validation.overallPass).length;

  return {
    runDate: new Date().toISOString(),
    model: "qwen3.5-72b-instruct",
    totalCases: results.length,
    passed,
    failed: results.length - passed,
    results: results.map(r => r.validation),
    summary: {
      parseRate: `${results.filter(r => r.validation.parseSuccess).length}/${results.length}`,
      schemaRate: `${results.filter(r => r.validation.schemaValid).length}/${results.length}`,
      smartRate: `${results.filter(r => Object.values(r.validation.smartCheck).every(Boolean)).length}/${results.length}`,
      cpiRate: `${results.filter(r => r.validation.cpiCheck.ratioMatchesPlan).length}/${results.length}`,
      timeBudgetRate: `${results.filter(r => r.validation.timeBudgetCheck.fits).length}/${results.length}`,
    },
  };
}

export function printSummary(report: TestReport) {
  console.log("\n" + "=".repeat(60));
  console.log(`📊 TEST REPORT — ${report.runDate}`);
  console.log(`Model: ${report.model}`);
  console.log("=".repeat(60));
  console.log(`\n✅ Passed: ${report.passed}/${report.totalCases}`);
  console.log(`❌ Failed: ${report.failed}/${report.totalCases}`);
  console.log(`\n📈 Breakdown:`);
  console.log(`   JSON Parse:    ${report.summary.parseRate}`);
  console.log(`   Schema Valid:  ${report.summary.schemaRate}`);
  console.log(`   SMART Check:   ${report.summary.smartRate}`);
  console.log(`   CPI Match:     ${report.summary.cpiRate}`);
  console.log(`   TimeBudget:    ${report.summary.timeBudgetRate}`);

  console.log(`\n📋 Per-TC Results:`);
  for (const r of report.results) {
    const icon = r.overallPass ? "✅" : "❌";
    const issues: string[] = [];
    if (!r.schemaValid) issues.push("schema");
    if (!Object.values(r.smartCheck).every(Boolean)) {
      const failed = Object.entries(r.smartCheck).filter(([, v]) => !v).map(([k]) => k);
      issues.push(`SMART(${failed.join(",")})`);
    }
    if (!r.cpiCheck.ratioMatchesPlan) issues.push(`CPI(dev:${r.cpiCheck.deviation}%)`);
    if (!r.timeBudgetCheck.fits) issues.push("overBudget");
    if (!r.timeBudgetCheck.eventsOnWeekend) issues.push("eventNotWeekend");
    if (r.warningsCheck.missingWarnings.length > 0) {
      issues.push(`missingWarnings(${r.warningsCheck.missingWarnings.length})`);
    }

    console.log(`   ${icon} ${r.tcId}: ${issues.length ? issues.join(", ") : "all pass"}`);
  }
  console.log("\n" + "=".repeat(60));
}
