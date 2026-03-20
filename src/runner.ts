import fs from "fs/promises";
import path from "path";
import type { TestCaseInput, TestCaseExpected, ValidationResult } from "./types.js";
import { runPipeline, runEngineOnly } from "./pipeline.js";
import { validateV4, validateTwoTrack, type TwoTrackValidation } from "./validator.js";

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
  twoTrack: TwoTrackValidation | null;
  raw: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  console.log(`\n🔄 Running ${input.id}: ${input.name}...`);
  const start = Date.now();

  let output: any = null;
  let error: string | null = null;

  try {
    output = await runPipeline(input);
  } catch (e) {
    error = `Pipeline error: ${(e as Error).message}`;
  }

  const latencyMs = Date.now() - start;

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = path.join(RESULTS_DIR, `${input.id}-result.json`);
  await fs.writeFile(resultFile, JSON.stringify({
    input: { id: input.id, name: input.name },
    output,
    error,
    latencyMs,
    timestamp: new Date().toISOString(),
  }, null, 2));

  let validation: ValidationResult;
  let twoTrack: TwoTrackValidation | null = null;

  if (output) {
    validation = validateV4(output, input, expected);
    twoTrack = validateTwoTrack(output, input, expected);
  } else {
    validation = {
      tcId: input.id,
      parseSuccess: false,
      schemaValid: false,
      smartCheck: { specific: false, measurable: false, achievable: false, relevant: false, timeBound: false },
      timeBudgetCheck: { totalDailyMinutes: 0, weekdayBudget: input.profile?.timeBudget?.weekday ?? 60, fits: false },
      timeFitCheck: { expected: expected.expectedTimeFit, actual: "impossible" as any, matches: false },
      emotionProtocolCheck: { expected: expected.emotionProtocol, actual: "neutral" as any, matches: false },
      hardFailCheck: { rules: expected.hardFailChecks, passed: false, failedRules: ["pipeline_fail"] },
      toneCheck: { expectedTone: expected.toneExpectation ?? "neutral", commentTone: "" },
      warningsCheck: { expectedWarnings: expected.warnings ?? [], actualWarnings: [], missingWarnings: expected.warnings ?? [] },
      overallPass: false,
    };
  }

  const status = validation.overallPass ? "✅ PASS" : error ? `❌ ERROR: ${error}` : "❌ FAIL";
  if (twoTrack) {
    const eStatus = twoTrack.engine.enginePass ? "E✅" : "E❌";
    const cStatus = twoTrack.coach.coachPass ? "C✅" : "C❌";
    console.log(`   ${status} ${eStatus}${cStatus} (${latencyMs}ms)`);
  } else {
    console.log(`   ${status} (${latencyMs}ms)`);
  }

  return {
    input,
    expected,
    output,
    validation,
    twoTrack,
    raw: "",
    latencyMs,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

// Engine-only run for Phase A test
export async function runEngineAndValidate(
  input: TestCaseInput,
  expected: TestCaseExpected
): Promise<{
  input: TestCaseInput;
  enginePass: boolean;
  details: Record<string, string | boolean>;
}> {
  const skeleton = runEngineOnly(input);

  // timeFit check
  function timeFitOk(actual: string, exp: string): boolean {
    if (actual === exp) return true;
    if (exp === "deficit" && actual === "impossible") return true;
    if (exp === "fits" && actual === "tight") return true;
    if (exp === "tight" && actual === "fits") return true;
    if (exp === "tight" && actual === "deficit") return true;
    return false;
  }

  // If expectedTimeFit is not defined, skip the timeFit check
  const timeFitPassed = !expected.expectedTimeFit || timeFitOk(skeleton.timeFit, expected.expectedTimeFit);

  // effortModel check
  let effortPassed = true;
  let effortDetail = "no effortModel expected";
  if (expected.effortModel && expected.effortModel.type !== "unpredictable" &&
      expected.effortModel.min != null && expected.effortModel.max != null) {
    const unit = expected.effortModel.unit;
    let plan = skeleton.plans.find(p => p.effortModel?.unit === unit);
    if (!plan) plan = skeleton.plans.find(p => p.priority === "primary");
    if (plan?.effortModel) {
      const actual = plan.effortModel.expected;
      const lo = expected.effortModel.min * 0.7;
      const hi = expected.effortModel.max * 1.3;
      effortPassed = actual >= lo && actual <= hi;
      effortDetail = `${actual} in [${lo.toFixed(1)}, ${hi.toFixed(1)}]`;
    }
  }

  const plansOk = skeleton.plans.length > 0;
  const hfgOk = !(
    (expected.hardFailChecks ?? []).includes("HFG-1") &&
    (expected.expectedTimeFit === "deficit" || expected.expectedTimeFit === "impossible") &&
    skeleton.timeFit === "fits"
  );
  const assumptionsOk = skeleton.plans.some(
    p => Array.isArray(p.assumptions) && p.assumptions.length > 0
  );

  const enginePass = timeFitPassed && effortPassed && plansOk && hfgOk && assumptionsOk;

  return {
    input,
    enginePass,
    details: {
      timeFit: `${skeleton.timeFit}(exp:${expected.expectedTimeFit}) → ${timeFitPassed}`,
      effort: effortDetail,
      plans: String(plansOk),
      hfg: String(hfgOk),
      assumptions: String(assumptionsOk),
    },
  };
}
