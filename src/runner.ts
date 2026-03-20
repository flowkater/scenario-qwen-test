import fs from "fs/promises";
import path from "path";
import type { TestCaseInput, TestCaseExpected, ValidationResult } from "./types.js";
import { callAICoach } from "./api.js";
import { validateV4 } from "./validator.js";
import { buildUserPrompt } from "./prompt.js";

const DATA_DIR = path.resolve(import.meta.dirname, "../data");
const RESULTS_DIR = path.resolve(import.meta.dirname, "../results");

export async function loadTestCase(tcId: string): Promise<TestCaseInput> {
  const all = await loadAllTestCases();
  const found = all.find(tc => tc.id === tcId || tc.id.startsWith(tcId + "-") || tc.id.startsWith(tcId));
  if (!found) throw new Error(`TC not found: ${tcId}`);
  return found;
}

export async function loadAllTestCases(): Promise<TestCaseInput[]> {
  const files = await fs.readdir(path.join(DATA_DIR, "input"));
  const jsonFiles = files.filter(f => f.endsWith(".json")).sort();
  const result: TestCaseInput[] = [];
  for (const f of jsonFiles) {
    const data = await fs.readFile(path.join(DATA_DIR, "input", f), "utf-8");
    const raw = JSON.parse(data);
    if (raw.profiles && Array.isArray(raw.profiles)) {
      // cross-profile TC: expand each sub-profile into a standalone TC
      for (const sp of raw.profiles) {
        result.push({
          ...sp,
          category: sp.category ?? raw.category,
          versionTag: sp.versionTag ?? raw.versionTag,
        });
      }
    } else {
      result.push(raw);
    }
  }
  return result;
}

export async function loadAllExpected(): Promise<TestCaseExpected[]> {
  const files = await fs.readdir(path.join(DATA_DIR, "expected"));
  const jsonFiles = files.filter(f => f.endsWith(".json")).sort();
  const result: TestCaseExpected[] = [];
  for (const f of jsonFiles) {
    const data = await fs.readFile(path.join(DATA_DIR, "expected", f), "utf-8");
    const raw = JSON.parse(data);
    if (raw.profiles && Array.isArray(raw.profiles)) {
      // cross-profile expected: expand each sub-profile expected
      for (const sp of raw.profiles) {
        result.push({
          ...sp,
          tcId: sp.profileId ?? sp.tcId,
          versionTag: sp.versionTag ?? raw.versionTag,
        });
      }
    } else {
      result.push(raw);
    }
  }
  return result;
}

export async function runAndValidate(
  input: TestCaseInput,
  expected: TestCaseExpected
): Promise<{
  input: TestCaseInput;
  expected: TestCaseExpected;
  output: any | null;
  validation: ValidationResult;
  raw: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  console.log(`\n🔄 Running ${input.id}: ${input.name}...`);

  const result = await callAICoach(input);

  // Save result
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = path.join(RESULTS_DIR, `${input.id}-result.json`);
  await fs.writeFile(resultFile, JSON.stringify({
    input: {
      id: input.id,
      name: input.name,
      userPrompt: buildUserPrompt(input),
    },
    output: result.parsed,
    raw: result.raw,
    error: result.error,
    usage: result.usage,
    latencyMs: result.latencyMs,
    timestamp: new Date().toISOString(),
  }, null, 2));

  // Validate
  let validation: ValidationResult;
  if (result.parsed) {
    validation = validateV4(result.parsed, input, expected);
  } else {
    validation = {
      tcId: input.id,
      parseSuccess: false,
      schemaValid: false,
      smartCheck: { specific: false, measurable: false, achievable: false, relevant: false, timeBound: false },
      timeBudgetCheck: { totalDailyMinutes: 0, weekdayBudget: input.profile?.timeBudget?.weekday ?? 60, fits: false },
      timeFitCheck: { expected: expected.expectedTimeFit, actual: "impossible" as any, matches: false },
      emotionProtocolCheck: { expected: expected.emotionProtocol, actual: "neutral" as any, matches: false },
      hardFailCheck: { rules: expected.hardFailChecks, passed: false, failedRules: ["parse_fail"] },
      toneCheck: { expectedTone: expected.toneExpectation ?? "neutral", commentTone: "" },
      warningsCheck: { expectedWarnings: expected.warnings ?? [], actualWarnings: [], missingWarnings: expected.warnings ?? [] },
      overallPass: false,
    };
  }

  const status = validation.overallPass ? "✅ PASS" : result.error ? `❌ ERROR: ${result.error}` : "❌ FAIL";
  console.log(`   ${status} (${result.latencyMs}ms, ${result.usage.totalTokens} tokens)`);

  return {
    input,
    expected,
    output: result.parsed,
    validation,
    raw: result.raw,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}
