import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { initClient } from "./api.js";
import { loadTestCase, loadAllTestCases, runTestCase } from "./runner.js";
import { generateReport, printSummary } from "./analyzer.js";

async function main() {
  const args = process.argv.slice(2);

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("❌ DASHSCOPE_API_KEY not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  initClient();

  if (args[0] === "run" && args[1]) {
    // Single TC: npx tsx src/index.ts run tc-1
    const input = await loadTestCase(args[1]);
    await runTestCase(input);
    console.log("\n📄 Result saved to results/");
    return;
  }

  if (args[0] === "run-all") {
    // All TCs: npx tsx src/index.ts run-all
    const inputs = await loadAllTestCases();
    console.log(`\n🚀 Running ${inputs.length} test cases...\n`);

    const results = [];
    for (const input of inputs) {
      const result = await runTestCase(input);
      results.push(result);
      await new Promise(r => setTimeout(r, 1000));  // rate limit buffer
    }

    const report = generateReport(results);
    printSummary(report);

    const reportsDir = path.resolve(import.meta.dirname, "../reports");
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFile = path.join(
      reportsDir,
      `report-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.json`
    );
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📊 Report saved to ${reportFile}`);
    return;
  }

  if (args[0] === "prompt" && args[1]) {
    // Prompt preview: npx tsx src/index.ts prompt tc-1
    const { buildUserPrompt, SYSTEM_PROMPT } = await import("./prompt.js");
    const input = await loadTestCase(args[1]);
    console.log("=== SYSTEM PROMPT ===");
    console.log(SYSTEM_PROMPT);
    console.log("\n=== USER PROMPT ===");
    console.log(buildUserPrompt(input));
    return;
  }

  // Help
  console.log(`
📋 AddPlan Scenario AI Test

Commands:
  npx tsx src/index.ts run <tc-id>    Run single test case (e.g., tc-1)
  npx tsx src/index.ts run-all        Run all 8 test cases
  npx tsx src/index.ts prompt <tc-id> Preview prompts without API call

Examples:
  npx tsx src/index.ts run tc-1
  npx tsx src/index.ts run-all
  npx tsx src/index.ts prompt tc-3
  `);
}

main().catch(console.error);
