import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { initClient } from "./api.js";
import { loadTestCase, loadAllTestCases, loadAllExpected, runAndValidate } from "./runner.js";
import { generateReport, printSummary, printFailureAnalysis, suggestPromptPatches } from "./analyzer.js";

// RunResult 타입 (runner.ts의 runAndValidate 반환값)
type RunResult = Awaited<ReturnType<typeof runAndValidate>>;

// ── iterate 모드 ──────────────────────────────────────────────
async function iterateMode(maxRounds: number, targetPass: number) {
  let round = 0;
  let failedTcIds: string[] = [];
  let noImprovementCount = 0;
  let bestScore = 0;
  const roundHistory: Array<{ round: number; passed: number }> = [];

  const allInputs = await loadAllTestCases();
  const allExpected = await loadAllExpected();

  // target=0 means "all TCs" (set dynamically after loading)
  const effectiveTarget = targetPass === 0 ? allInputs.length : targetPass;

  // 전체 통과한 TC ID 추적 (누적)
  const passedTcIds = new Set<string>();

  while (round < maxRounds) {
    round++;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`ROUND ${round} / ${maxRounds}`);
    console.log(`${"═".repeat(60)}\n`);

    // 실행 대상: 1라운드는 전체, 이후는 실패분만
    const targetInputs =
      round === 1
        ? allInputs
        : allInputs.filter((i) => failedTcIds.includes(i.id));

    console.log(`Running ${targetInputs.length} TCs...`);

    const results: RunResult[] = [];
    for (const input of targetInputs) {
      const expected = allExpected.find((e) => e.tcId === input.id)!;
      const result = await runAndValidate(input, expected);
      results.push(result);
      if (result.validation.overallPass) passedTcIds.add(input.id);
      else passedTcIds.delete(input.id);
      await sleep(500); // rate limit
    }

    const totalPassed = passedTcIds.size;
    roundHistory.push({ round, passed: totalPassed });

    console.log(`\nRound ${round}: ${totalPassed}/${allInputs.length} PASS`);

    // 성공 조건
    if (totalPassed >= effectiveTarget) {
      const report = generateReport(results, round, "SUCCESS", roundHistory);
      await saveReport(round, report);
      printSummary(report);
      console.log(`\nSUCCESS! ${totalPassed}/${allInputs.length} PASS!`);
      return;
    }

    // 개선 여부
    if (totalPassed <= bestScore) {
      noImprovementCount++;
      if (noImprovementCount >= 3) {
        const report = generateReport(results, round, "STALLED", roundHistory);
        await saveReport(round, report);
        console.log(`\n3라운드 연속 개선 없음. 중단.`);
        printFailureAnalysis(results.filter((r) => !r.validation.overallPass));
        return;
      }
    } else {
      noImprovementCount = 0;
      bestScore = totalPassed;
    }

    // 실패 분석 + 패치 제안
    const failedResults = results.filter((r) => !r.validation.overallPass);
    failedTcIds = failedResults.map((r) => r.input.id);
    console.log(`\nFailed: ${failedTcIds.join(", ")}`);
    printFailureAnalysis(failedResults);

    const patches = suggestPromptPatches(failedResults);
    if (patches.length > 0) {
      console.log(`\n프롬프트 패치 제안:`);
      for (const p of patches) {
        console.log(`  [${p.failureType} x${p.count}] → ${p.suggestion}`);
      }
    }

    // 리포트 저장
    const report = generateReport(results, round, "IN_PROGRESS", roundHistory);
    await saveReport(round, report);
  }

  console.log(`\nMax rounds (${maxRounds}) reached.`);
}

async function saveReport(round: number, report: any) {
  const reportsDir = path.resolve(import.meta.dirname, "../reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const file = path.join(reportsDir, `round-${round}-${timestamp}.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${file}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "prompt" && args[1]) {
    // prompt 커맨드는 API 키 불필요 — 먼저 처리
    const { buildUserPrompt, SYSTEM_PROMPT } = await import("./prompt.js");
    const input = await loadTestCase(args[1]);
    console.log("=== SYSTEM PROMPT ===\n" + SYSTEM_PROMPT);
    console.log("\n=== USER PROMPT ===\n" + buildUserPrompt(input));
    return;
  }

  if (!args[0]) {
    console.log(`
AI Coach 42 TC v4

Commands:
  run <tc-id>                              단일 TC 실행 (예: tc-01)
  run-all                                  전체 42개 TC 1회 실행
  iterate [--max-rounds=10] [--target=42]  반복 실행 모드
  prompt <tc-id>                           프롬프트 미리보기 (API 호출 없음)
  analyze                                  마지막 리포트 분석
    `);
    return;
  }

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY not set.");
    process.exit(1);
  }

  initClient();

  switch (args[0]) {
    case "run": {
      // npx tsx src/index.ts run tc-01
      const input = await loadTestCase(args[1]);
      const allExpected = await loadAllExpected();
      const expected = allExpected.find((e) => e.tcId === input.id);
      if (!expected) throw new Error(`Expected not found: ${input.id}`);
      const result = await runAndValidate(input, expected);
      printSummary(generateReport([result]));
      break;
    }

    case "run-all": {
      // npx tsx src/index.ts run-all
      const inputs = await loadAllTestCases();
      const allExpected = await loadAllExpected();
      console.log(`\nRunning ${inputs.length} TCs...\n`);
      const results: RunResult[] = [];
      for (const input of inputs) {
        const expected = allExpected.find((e) => e.tcId === input.id);
        if (!expected) {
          console.warn(`No expected for ${input.id}`);
          continue;
        }
        const result = await runAndValidate(input, expected);
        results.push(result);
        await sleep(1000);
      }
      const report = generateReport(results);
      printSummary(report);
      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      await fs.writeFile(
        path.join(reportsDir, `report-${ts}.json`),
        JSON.stringify(report, null, 2)
      );
      break;
    }

    case "iterate": {
      // npx tsx src/index.ts iterate [--max-rounds=10] [--target=44]
      const maxRounds = parseInt(
        args.find((a) => a.startsWith("--max-rounds="))?.split("=")[1] ?? "10"
      );
      // target=0 means "all TCs" (resolved dynamically in iterateMode)
      const target = parseInt(
        args.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "0"
      );
      await iterateMode(maxRounds, target);
      break;
    }

    case "analyze": {
      // npx tsx src/index.ts analyze (마지막 리포트 분석)
      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      try {
        const files = (await fs.readdir(reportsDir))
          .filter((f) => f.endsWith(".json"))
          .sort();
        if (files.length === 0) {
          console.log("No reports found.");
          break;
        }
        const latest = files[files.length - 1];
        const report = JSON.parse(
          await fs.readFile(path.join(reportsDir, latest), "utf-8")
        );
        console.log(`\nLatest report: ${latest}`);
        printSummary(report);
      } catch {
        console.log("No reports directory found. Run run-all first.");
      }
      break;
    }

    default:
      console.log(`
AI Coach 42 TC v4

Commands:
  run <tc-id>                              단일 TC 실행 (예: tc-01)
  run-all                                  전체 42개 TC 1회 실행
  iterate [--max-rounds=10] [--target=42]  반복 실행 모드
  prompt <tc-id>                           프롬프트 미리보기 (API 호출 없음)
  analyze                                  마지막 리포트 분석
      `);
  }
}

main().catch(console.error);
