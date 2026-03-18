import fs from "fs/promises";
import path from "path";
import type { TestCaseInput, QwenOutput } from "./types.js";
import { callQwen } from "./api.js";
import { validateFull, loadExpectedWarnings } from "./validator.js";
import { buildUserPrompt } from "./prompt.js";

const DATA_DIR = path.resolve(import.meta.dirname, "../data");
const RESULTS_DIR = path.resolve(import.meta.dirname, "../results");

export async function loadTestCase(tcId: string): Promise<TestCaseInput> {
  const files = await fs.readdir(path.join(DATA_DIR, "input"));
  const file = files.find(f => f.startsWith(tcId));
  if (!file) throw new Error(`TC not found: ${tcId}`);
  const data = await fs.readFile(path.join(DATA_DIR, "input", file), "utf-8");
  return JSON.parse(data);
}

export async function loadAllTestCases(): Promise<TestCaseInput[]> {
  const files = await fs.readdir(path.join(DATA_DIR, "input"));
  const jsonFiles = files.filter(f => f.endsWith(".json")).sort();
  return Promise.all(
    jsonFiles.map(async f => {
      const data = await fs.readFile(path.join(DATA_DIR, "input", f), "utf-8");
      return JSON.parse(data);
    })
  );
}

async function loadExpectedOutput(tcId: string): Promise<{ warnings?: string[] } | null> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "expected"));
    const file = files.find(f => f.startsWith(tcId));
    if (!file) return null;
    const data = await fs.readFile(path.join(DATA_DIR, "expected", file), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function runTestCase(input: TestCaseInput) {
  console.log(`\n🔄 Running ${input.id}: ${input.name}...`);

  const result = await callQwen(input);

  // Save result
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = path.join(RESULTS_DIR, `${input.id}-${input.name.split(" ")[0].toLowerCase()}.json`);
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

  // Load expected warnings for comparison
  const expectedOutput = await loadExpectedOutput(input.id);
  const expectedWarnings = loadExpectedWarnings(expectedOutput);

  // Validate
  let validation;
  if (result.parsed) {
    validation = validateFull(result.parsed, input, expectedWarnings);
  } else {
    validation = {
      tcId: input.id,
      parseSuccess: false,
      schemaValid: false,
      smartCheck: { specific: false, measurable: false, achievable: false, relevant: false, timeBound: false },
      cpiCheck: { ratioMatchesPlan: false, expectedRatio: { c: 0, p: 0, i: 0 }, actualRatio: { c: 0, p: 0, i: 0 }, deviation: 100 },
      timeBudgetCheck: { totalDailyMinutes: 0, weekdayBudget: input.profile.timeBudget.weekday, fits: false, eventsOnWeekend: false },
      toneCheck: { expectedTone: input.profile.tone, commentTone: "" },
      warningsCheck: { expectedWarnings, actualWarnings: [], missingWarnings: expectedWarnings },
      overallPass: false,
    };
  }

  const status = validation.overallPass ? "✅ PASS" : result.error ? `❌ ERROR: ${result.error}` : "⚠️ ISSUES";
  console.log(`   ${status} (${result.latencyMs}ms, ${result.usage.totalTokens} tokens)`);

  return { input, output: result.parsed, validation, raw: result.raw, latencyMs: result.latencyMs, usage: result.usage };
}
