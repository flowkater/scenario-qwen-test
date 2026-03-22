import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { initParserClient, callParser } from "./api.js";
import { validateParserOutput } from "./validator.js";
import type { ParserTestCase, ParserValidation, ParserOutput } from "./types.js";

const DATA_DIR = path.resolve(import.meta.dirname, "../../data/parser");
const RESULTS_DIR = path.resolve(DATA_DIR, "results");

async function loadTestCase(tcId: string): Promise<ParserTestCase> {
  const file = path.join(DATA_DIR, `${tcId}.json`);
  return JSON.parse(await fs.readFile(file, "utf-8"));
}

async function loadAllTestCases(): Promise<ParserTestCase[]> {
  const files = (await fs.readdir(DATA_DIR))
    .filter(f => f.endsWith(".json") && f.startsWith("tc-"))
    .sort();
  return Promise.all(files.map(f => loadTestCase(f.replace(".json", ""))));
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSingle(tc: ParserTestCase): Promise<{
  tc: ParserTestCase;
  output: ParserOutput | null;
  validation: ParserValidation | null;
  error: string | null;
  latencyMs: number;
  usage: any;
}> {
  const result = await callParser(tc.input);

  if (result.error || !result.parsed) {
    return {
      tc,
      output: null,
      validation: null,
      error: result.error ?? "No parsed output",
      latencyMs: result.latencyMs,
      usage: result.usage,
    };
  }

  const validation = validateParserOutput(result.parsed, tc);

  return {
    tc,
    output: result.parsed,
    validation,
    error: null,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}

// ── CLI ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (!args[0]) {
    console.log(`
AddPlan v1.0 AI Parser TC Runner

Commands:
  run <tc-id>     Run single TC
  run-all         Run all TCs
  summary         Show last run summary
`);
    return;
  }

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY not set.");
    process.exit(1);
  }

  initParserClient();
  await fs.mkdir(RESULTS_DIR, { recursive: true });

  switch (args[0]) {
    case "run": {
      const tcId = args[1];
      if (!tcId) { console.error("Usage: run <tc-id>"); process.exit(1); }

      const tc = await loadTestCase(tcId);
      console.log(`\n🔄 [Parser] ${tc.id}: ${tc.description}`);

      const result = await runSingle(tc);

      if (result.error) {
        console.log(`❌ ERROR: ${result.error}`);
        break;
      }

      const v = result.validation!;
      const status = v.overallPass ? "✅ PASS" : "❌ FAIL";
      console.log(`\n${status} (${result.latencyMs}ms)`);
      console.log(`  Name: ${v.nameMatch ? "✅" : "❌"} ${JSON.stringify(v.details.name)}`);
      console.log(`  Purpose: ${v.purposeMatch ? "✅" : "❌"} ${JSON.stringify(v.details.purpose)}`);
      console.log(`  PlanType: ${v.planTypeMatch ? "✅" : "❌"} ${JSON.stringify(v.details.planType)}`);
      console.log(`  Quantity: ${v.quantityCorrect ? "✅" : "❌"} ${JSON.stringify(v.details.quantity)}`);
      console.log(`  Deadline: ${v.deadlineCorrect ? "✅" : "❌"} ${JSON.stringify(v.details.deadline)}`);
      console.log(`  ExamPrep: ${v.examPrepMatch ? "✅" : "❌"} ${JSON.stringify(v.details.examPrep)}`);
      console.log(`  SkipDecision: ${v.skipDecisionCorrect ? "✅" : "❌"} ${JSON.stringify(v.details.skipDecision)}`);
      if (v.hardFails.length > 0) console.log(`  ⛔ Hard Fails: ${v.hardFails.join(", ")}`);
      console.log(`\nOutput:\n${JSON.stringify(result.output, null, 2)}`);

      // Save result
      await fs.writeFile(
        path.join(RESULTS_DIR, `${tcId}.json`),
        JSON.stringify(result, null, 2),
      );
      break;
    }

    case "run-all": {
      const tcs = await loadAllTestCases();
      console.log(`\n[Parser] Running ${tcs.length} TCs...\n`);

      let passed = 0;
      let failed = 0;
      let errors = 0;
      const failures: string[] = [];
      const hardFailList: string[] = [];
      let totalLatency = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for (const tc of tcs) {
        process.stdout.write(`  ${tc.id}... `);
        const result = await runSingle(tc);

        if (result.error) {
          errors++;
          console.log(`❌ ERROR: ${result.error}`);
        } else {
          const v = result.validation!;
          totalLatency += result.latencyMs;
          totalPromptTokens += result.usage?.promptTokens ?? 0;
          totalCompletionTokens += result.usage?.completionTokens ?? 0;

          if (v.overallPass) {
            passed++;
            console.log(`✅ (${result.latencyMs}ms)`);
          } else {
            failed++;
            const issues: string[] = [];
            if (!v.nameMatch) issues.push("name");
            if (!v.purposeMatch) issues.push("purpose");
            if (!v.planTypeMatch) issues.push("planType");
            if (!v.quantityCorrect) issues.push("quantity");
            if (!v.deadlineCorrect) issues.push("deadline");
            if (!v.examPrepMatch) issues.push("examPrep");
            if (!v.skipDecisionCorrect) issues.push("skipDecision");
            if (v.hardFails.length > 0) {
              issues.push(`HF:[${v.hardFails.join(",")}]`);
              hardFailList.push(...v.hardFails.map(h => `${tc.id}: ${h}`));
            }
            const msg = `❌ [${issues.join(", ")}] (${result.latencyMs}ms)`;
            failures.push(`${tc.id}: ${msg}`);
            console.log(msg);
          }
        }

        // Save each result
        await fs.writeFile(
          path.join(RESULTS_DIR, `${tc.id}.json`),
          JSON.stringify(result, null, 2),
        );

        await sleep(300);
      }

      const total = passed + failed + errors;
      const avgLatency = totalLatency / (passed + failed || 1);

      console.log(`\n${"═".repeat(60)}`);
      console.log(`[Parser v1.0] RESULT: ${passed}/${total} PASS (${((passed/total)*100).toFixed(1)}%)`);
      console.log(`  Failed: ${failed} | Errors: ${errors}`);
      console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`  Total tokens: ${totalPromptTokens} prompt + ${totalCompletionTokens} completion`);
      if (hardFailList.length > 0) {
        console.log(`\n⛔ Hard Fails (${hardFailList.length}):`);
        hardFailList.forEach(h => console.log(`  ${h}`));
      }
      if (failures.length > 0) {
        console.log(`\nFailed TCs:`);
        failures.forEach(f => console.log(`  ${f}`));
      }
      console.log(`${"═".repeat(60)}\n`);

      // Save summary
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      await fs.writeFile(
        path.join(RESULTS_DIR, `summary-${ts}.json`),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          model: "qwen3.5-flash",
          enableThinking: false,
          total, passed, failed, errors,
          passRate: `${((passed/total)*100).toFixed(1)}%`,
          avgLatencyMs: Math.round(avgLatency),
          totalPromptTokens,
          totalCompletionTokens,
          hardFails: hardFailList,
          failures: failures,
        }, null, 2),
      );
      break;
    }

    default:
      console.log(`Unknown command: ${args[0]}`);
  }
}

main().catch(console.error);
