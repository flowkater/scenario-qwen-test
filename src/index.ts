import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { initPipeline } from "./pipeline.js";
import { initPipelineV5, runPipelineV5 } from "./pipeline-v5.js";
import { initPipelineV6, runPipelineV6 } from "./pipeline-v6.js";
import type { TestCaseV6 } from "./pipeline-v6.js";
import { judgeResponse } from "./judge.js";
import { checkHardFails, validatePathDiff } from "./validator-v6.js";
import { loadTestCase, loadAllTestCases, loadAllExpected, runAndValidate, runEngineAndValidate } from "./runner.js";
import { generateReport, printSummary, printFailureAnalysis, suggestPromptPatches } from "./analyzer.js";
import { validateV4, validateTwoTrack } from "./validator.js";

// ─── V6 TC 로더 ──────────────────────────────────────────────────

async function loadTestCaseV6(tcId: string): Promise<TestCaseV6> {
  const dataDir = path.resolve(import.meta.dirname, "../data/v6");
  const file = path.join(dataDir, `${tcId}.json`);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as TestCaseV6;
}

async function loadAllV6TcIds(): Promise<string[]> {
  const dataDir = path.resolve(import.meta.dirname, "../data/v6");
  const files = await fs.readdir(dataDir);
  return files
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""))
    .sort();
}

type RunResult = Awaited<ReturnType<typeof runAndValidate>>;

// ── engine-test 모드 ───────────────────────────────────────
async function engineTestMode(tcId?: string) {
  const allInputs = tcId ? [await loadTestCase(tcId)] : await loadAllTestCases();
  const allExpected = await loadAllExpected();

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Engine-Only Validation (${allInputs.length} Test Cases)`);
  console.log(`${"═".repeat(60)}\n`);

  for (const input of allInputs) {
    const expected = allExpected.find(e => e.tcId === input.id);
    if (!expected) {
      console.warn(`  ⚠ No expected for ${input.id}`);
      continue;
    }
    const result = await runEngineAndValidate(input, expected);
    if (result.enginePass) {
      passed++;
      const d = result.details;
      console.log(`✅ ${input.id}: timeFit=${d.timeFit} | effort=${d.effort}`);
    } else {
      failed++;
      const issues = Object.entries(result.details)
        .filter(([, v]) => v === "false" || v === false)
        .map(([k]) => k)
        .join(", ");
      const msg = `❌ ${input.id}: FAIL [${issues}] | ${JSON.stringify(result.details)}`;
      failures.push(msg);
      console.log(msg);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULT: ${passed}/${passed + failed} ENGINE PASS`);
  if (failures.length > 0) {
    console.log(`  (Coach validation skipped — Phase A)`);
    console.log(`\nFailed TCs:`);
    failures.forEach(f => console.log(`  ${f}`));
  }
  console.log(`${"═".repeat(60)}\n`);
}

// ── iterate 모드 ──────────────────────────────────────────────
async function iterateMode(maxRounds: number, targetPass: number) {
  let round = 0;
  let failedTcIds: string[] = [];
  let noImprovementCount = 0;
  let bestScore = 0;
  const roundHistory: Array<{ round: number; passed: number }> = [];

  const allInputs = await loadAllTestCases();
  const allExpected = await loadAllExpected();

  const effectiveTarget = targetPass === 0 ? allInputs.length : targetPass;
  const passedTcIds = new Set<string>();

  while (round < maxRounds) {
    round++;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`ROUND ${round} / ${maxRounds}`);
    console.log(`${"═".repeat(60)}\n`);

    const targetInputs =
      round === 1
        ? allInputs
        : allInputs.filter(i => failedTcIds.includes(i.id));

    console.log(`Running ${targetInputs.length} TCs...`);

    const results: RunResult[] = [];
    for (const input of targetInputs) {
      const expected = allExpected.find(e => e.tcId === input.id)!;
      const result = await runAndValidate(input, expected);
      results.push(result);
      if (result.validation.overallPass) passedTcIds.add(input.id);
      else passedTcIds.delete(input.id);
      await sleep(500);
    }

    const totalPassed = passedTcIds.size;
    roundHistory.push({ round, passed: totalPassed });
    console.log(`\nRound ${round}: ${totalPassed}/${allInputs.length} PASS`);

    if (totalPassed >= effectiveTarget) {
      const report = generateReport(results, round, "SUCCESS", roundHistory);
      await saveReport(round, report);
      printSummary(report);
      console.log(`\nSUCCESS! ${totalPassed}/${allInputs.length} PASS!`);
      return;
    }

    if (totalPassed <= bestScore) {
      noImprovementCount++;
      if (noImprovementCount >= 3) {
        const report = generateReport(results, round, "STALLED", roundHistory);
        await saveReport(round, report);
        console.log(`\n3라운드 연속 개선 없음. 중단.`);
        printFailureAnalysis(results.filter(r => !r.validation.overallPass));
        return;
      }
    } else {
      noImprovementCount = 0;
      bestScore = totalPassed;
    }

    const failedResults = results.filter(r => !r.validation.overallPass);
    failedTcIds = failedResults.map(r => r.input.id);
    console.log(`\nFailed: ${failedTcIds.join(", ")}`);
    printFailureAnalysis(failedResults);

    const patches = suggestPromptPatches(failedResults);
    if (patches.length > 0) {
      console.log(`\n프롬프트 패치 제안:`);
      for (const p of patches) {
        console.log(`  [${p.failureType} x${p.count}] → ${p.suggestion}`);
      }
    }

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
  return new Promise(r => setTimeout(r, ms));
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // engine-test: AI 호출 없음, 순수 engine 검증
  if (args[0] === "engine-test") {
    await engineTestMode(args[1]);
    return;
  }

  if (!args[0]) {
    console.log(`
AI Coach TC v4/v5/v6

Commands:
  engine-test [tc-id]                      Engine-only 검증 (AI 없음)
  run <tc-id>                              단일 TC 실행 — v4 pipeline
  run-all                                  전체 42개 TC 1회 실행 — v4 pipeline
  run-v5 <tc-id>                           단일 TC 실행 — v5 clean prompt
  run-all-v5                               전체 42개 TC 1회 실행 — v5 clean prompt
  run-v6 <tc-id> [path]                    단일 TC 단일 path 실행 — v6 멀티턴 (path: A|B|C, default: A)
  run-all-v6                               전체 44 TC × 3 paths = 132 실행 — v6
  judge-v6 <tc-id> [path]                  단일 TC Claude Judge 평가 — v6
  judge-all-v6                             전체 TC Claude Judge 평가 — v6
  iterate [--max-rounds=10] [--target=42]  반복 실행 모드
  analyze                                  마지막 리포트 분석
    `);
    return;
  }

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY not set.");
    process.exit(1);
  }

  // Pipeline 초기화 (engine + coach)
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
  initPipeline(client);
  initPipelineV5(client);
  initPipelineV6(client);

  switch (args[0]) {
    case "run": {
      const input = await loadTestCase(args[1]);
      const allExpected = await loadAllExpected();
      const expected = allExpected.find(e => e.tcId === input.id);
      if (!expected) throw new Error(`Expected not found: ${input.id}`);
      const result = await runAndValidate(input, expected);
      printSummary(generateReport([result]));

      // 2-Track 리포트 출력
      if (result.twoTrack) {
        const tt = result.twoTrack;
        console.log(`\n2-Track: ENGINE ${tt.engine.enginePass ? "✅" : "❌"} | COACH ${tt.coach.coachPass ? "✅" : "❌"}`);
        console.log(`  Engine: timeFit=${tt.engine.details.timeFit} | effort=${tt.engine.details.effort}`);
        console.log(`  Coach: emotion=${tt.coach.emotionMatched} | strategy=${tt.coach.strategyKeywordsOk}`);
      }
      break;
    }

    case "run-all": {
      const inputs = await loadAllTestCases();
      const allExpected = await loadAllExpected();
      console.log(`\nRunning ${inputs.length} TCs...\n`);
      const results: RunResult[] = [];

      for (const input of inputs) {
        const expected = allExpected.find(e => e.tcId === input.id);
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

      // 2-Track 요약
      const enginePassed = results.filter(r => r.twoTrack?.engine.enginePass).length;
      const coachPassed = results.filter(r => r.twoTrack?.coach.coachPass).length;
      const overall = results.filter(r => r.validation.overallPass).length;
      console.log(`\n2-Track Summary:`);
      console.log(`  Engine: ${enginePassed}/${results.length} PASS`);
      console.log(`  Coach:  ${coachPassed}/${results.length} PASS`);
      console.log(`  Overall: ${overall}/${results.length} PASS`);

      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      await fs.writeFile(
        path.join(reportsDir, `report-${ts}.json`),
        JSON.stringify(report, null, 2)
      );
      break;
    }

    case "run-v5": {
      const input = await loadTestCase(args[1]);
      const allExpected = await loadAllExpected();
      const expected = allExpected.find(e => e.tcId === input.id);
      if (!expected) throw new Error(`Expected not found: ${input.id}`);

      console.log(`\n🔄 [V5] Running ${input.id}: ${input.name}...`);
      const start = Date.now();
      const output = await runPipelineV5(input);
      const latencyMs = Date.now() - start;

      const validation = validateV4(output, input, expected);
      const twoTrack = validateTwoTrack(output, input, expected);
      const status = validation.overallPass ? "✅ PASS" : "❌ FAIL";
      const eStatus = twoTrack.engine.enginePass ? "E✅" : "E❌";
      const cStatus = twoTrack.coach.coachPass ? "C✅" : "C❌";
      console.log(`   ${status} ${eStatus}${cStatus} (${latencyMs}ms)`);
      console.log(`\n2-Track: ENGINE ${twoTrack.engine.enginePass ? "✅" : "❌"} | COACH ${twoTrack.coach.coachPass ? "✅" : "❌"}`);
      console.log(`  Engine: timeFit=${twoTrack.engine.details.timeFit} | effort=${twoTrack.engine.details.effort}`);
      console.log(`  Coach: emotion=${twoTrack.coach.emotionMatched} | strategy=${twoTrack.coach.strategyKeywordsOk}`);
      console.log(`\nOutput:`);
      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case "run-all-v5": {
      const inputs = await loadAllTestCases();
      const allExpected = await loadAllExpected();
      console.log(`\n[V5 Clean Prompt] Running ${inputs.length} TCs...\n`);

      let enginePassed = 0;
      let coachPassed = 0;
      let overallPassed = 0;

      for (const input of inputs) {
        const expected = allExpected.find(e => e.tcId === input.id);
        if (!expected) {
          console.warn(`No expected for ${input.id}`);
          continue;
        }

        console.log(`\n🔄 [V5] ${input.id}: ${input.name}...`);
        const start = Date.now();
        let output: any = null;
        try {
          output = await runPipelineV5(input);
        } catch (e) {
          console.log(`   ❌ ERROR: ${(e as Error).message}`);
          continue;
        }
        const latencyMs = Date.now() - start;

        const validation = validateV4(output, input, expected);
        const twoTrack = validateTwoTrack(output, input, expected);

        if (twoTrack.engine.enginePass) enginePassed++;
        if (twoTrack.coach.coachPass) coachPassed++;
        if (validation.overallPass) overallPassed++;

        const eStatus = twoTrack.engine.enginePass ? "E✅" : "E❌";
        const cStatus = twoTrack.coach.coachPass ? "C✅" : "C❌";
        const overall = validation.overallPass ? "✅" : "❌";

        // Collect failure details
        const issues: string[] = [];
        if (!twoTrack.engine.enginePass) {
          issues.push(`timeFit=${twoTrack.engine.details.timeFit}`);
        }
        if (!twoTrack.coach.coachPass) {
          if (!twoTrack.coach.emotionMatched) {
            issues.push(`emotion: exp=${expected.emotionProtocol ?? "neutral"} actual=${output.emotionProtocol ?? "neutral"}`);
          }
          if (!twoTrack.coach.strategyKeywordsOk) {
            issues.push(`strategy keywords missing`);
          }
        }
        const detail = issues.length > 0 ? ` — ${issues.join(", ")}` : "";
        console.log(`   ${overall} ${eStatus}${cStatus} (${latencyMs}ms)${detail}`);

        await sleep(1000);
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`\n[V5] 2-Track Summary:`);
      console.log(`  Engine: ${enginePassed}/${inputs.length} PASS`);
      console.log(`  Coach:  ${coachPassed}/${inputs.length} PASS`);
      console.log(`  Overall: ${overallPassed}/${inputs.length} PASS`);

      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      await fs.writeFile(
        path.join(reportsDir, `v5-report-${ts}.json`),
        JSON.stringify({ enginePassed, coachPassed, overallPassed, total: inputs.length, ts }, null, 2)
      );
      break;
    }

    // ── run-v6: 단일 TC + 단일 path ──────────────────────────────
    case "run-v6": {
      const tcId = args[1];
      if (!tcId) { console.error("Usage: run-v6 <tc-id> [path]"); process.exit(1); }
      const pathKey = ((args[2] ?? "A").toUpperCase()) as "A" | "B" | "C";

      const tc = await loadTestCaseV6(tcId);
      console.log(`\n[V6] ${tc.id} Path-${pathKey}: ${tc.name}`);
      const start = Date.now();
      const result = await runPipelineV6(tc, pathKey);
      const latencyMs = Date.now() - start;

      for (const r of result.results) {
        const status = r.actionMatch ? "✅" : "❌";
        const parseErr = r.parseError ? ` PARSE_ERR: ${r.parseError}` : "";
        console.log(`  Turn ${r.turn}: ${status} action=${r.aiResponse?.action ?? "?"} (expected: ${r.expectedAction})${parseErr} [${r.latencyMs}ms]`);
      }

      const hfg = result.finalPlan ? checkHardFails(result.finalPlan, tc) : [];
      const allMatch = result.results.every(r => r.actionMatch);
      console.log(`\n  HFG: ${hfg.length === 0 ? "✅ 없음" : "❌ " + hfg.join(", ")}`);
      console.log(`  Overall: ${allMatch && hfg.length === 0 ? "✅ PASS" : "❌ FAIL"} [${latencyMs}ms]\n`);
      console.log("Final Plan:", JSON.stringify(result.finalPlan, null, 2));

      // 결과 저장 (judge-v6에서 사용)
      const resultsDir = path.resolve(import.meta.dirname, "../data/v6/results");
      await fs.mkdir(resultsDir, { recursive: true });
      await fs.writeFile(
        path.join(resultsDir, `${tcId}-${pathKey}.json`),
        JSON.stringify({ tc, result, hfg, allMatch }, null, 2)
      );
      break;
    }

    // ── run-all-v6: 전체 44 TC × 3 paths = 132 ───────────────────
    case "run-all-v6": {
      const tcIds = await loadAllV6TcIds();
      const paths = ["A", "B", "C"] as const;
      let totalPass = 0;
      let totalFail = 0;
      const reports: any[] = [];

      console.log(`\n[V6] 전체 ${tcIds.length} TCs × 3 paths = ${tcIds.length * 3} 실행\n`);

      for (const tcId of tcIds) {
        const tc = await loadTestCaseV6(tcId);
        const pathResults: Record<string, any> = {};

        for (const pk of paths) {
          if (!tc.paths[pk]) { console.log(`  ⚠ ${tcId} Path-${pk} 없음, 건너뜀`); continue; }

          process.stdout.write(`  ${tcId} Path-${pk}... `);
          const result = await runPipelineV6(tc, pk);
          pathResults[pk] = result;

          const hfg = result.finalPlan ? checkHardFails(result.finalPlan, tc) : [];
          const allMatch = result.results.every(r => r.actionMatch);
          const pass = allMatch && hfg.length === 0;
          if (pass) totalPass++; else totalFail++;
          console.log(`${pass ? "✅" : "❌"} hfg=[${hfg.join(",")}]`);
          await sleep(500);
        }

        // Path 분기 검증
        if (pathResults.A && pathResults.B && pathResults.C) {
          const diff = validatePathDiff(pathResults.A, pathResults.B, pathResults.C);
          console.log(`  ${tcId} PathDiff: ${diff.pass ? "✅" : "❌"} (diffs=${diff.diffCount})`);
        }

        reports.push({ tcId, paths: pathResults });
      }

      const total = totalPass + totalFail;
      console.log(`\n${"═".repeat(60)}`);
      console.log(`[V6] RESULT: ${totalPass}/${total} PASS (${((totalPass/total)*100).toFixed(1)}%)`);
      console.log(`${"═".repeat(60)}\n`);

      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      await fs.writeFile(
        path.join(reportsDir, `v6-run-${ts}.json`),
        JSON.stringify({ totalPass, totalFail, total, reports }, null, 2)
      );
      break;
    }

    // ── judge-v6: 단일 TC + path → 파이프라인 실행 후 결과 저장 ──
    case "judge-v6": {
      const tcId = args[1];
      if (!tcId) { console.error("Usage: judge-v6 <tc-id> [path]"); process.exit(1); }
      const pathKey = ((args[2] ?? "A").toUpperCase()) as "A" | "B" | "C";

      const tc = await loadTestCaseV6(tcId);
      console.log(`\n[V6 Judge] ${tc.id} Path-${pathKey}: ${tc.name}`);
      console.log("  Qwen 파이프라인 실행...");

      const pipelineResult = await runPipelineV6(tc, pathKey);
      const hfg = pipelineResult.finalPlan ? checkHardFails(pipelineResult.finalPlan, tc) : [];

      // 결과 저장
      const resultsDir = path.resolve(import.meta.dirname, "../data/v6/results");
      await fs.mkdir(resultsDir, { recursive: true });
      const outFile = path.join(resultsDir, `${tcId}-${pathKey}.json`);
      await fs.writeFile(outFile, JSON.stringify({ tc, pipelineResult, hfg }, null, 2));

      if (!pipelineResult.finalPlan) {
        console.log(`\n❌ No plan generated — skipping Judge evaluation`);
        console.log(`HFG: ${hfg.length === 0 ? "✅" : "❌ " + hfg.join(", ")}`);
        break;
      }

      // Claude Judge 호출
      console.log("  Claude Judge 평가 중...");
      try {
        const judgeResult = await judgeResponse(tc, pathKey, pipelineResult);
        const judgeFile = path.join(resultsDir, `${tcId}-${pathKey}-judge.json`);
        await fs.writeFile(judgeFile, JSON.stringify(judgeResult, null, 2));

        console.log(`\n${"═".repeat(60)}`);
        console.log(`[JUDGE RESULT] ${tc.id} Path-${pathKey}`);
        console.log(`${"═".repeat(60)}`);
        console.log(`\nSMART: S=${judgeResult.smart.specific.score} M=${judgeResult.smart.measurable.score} A=${judgeResult.smart.achievable.score} R=${judgeResult.smart.relevant.score} T=${judgeResult.smart.timeBound.score}`);
        console.log(`CPI:   C=${judgeResult.cpi.coverage.score} P=${judgeResult.cpi.practice.score} I=${judgeResult.cpi.insight.score}`);
        console.log(`Coach: D=${judgeResult.coach.diagnosis.score} S=${judgeResult.coach.strategy.score} H=${judgeResult.coach.honesty.score} E=${judgeResult.coach.emotion.score}`);
        console.log(`\nTotal: ${judgeResult.totalScore}/${judgeResult.maxScore} ${judgeResult.pass ? "✅ PASS" : "❌ FAIL"}`);
        console.log(`HFG: ${hfg.length === 0 ? "✅" : "❌ " + hfg.join(", ")} | Judge HF: ${judgeResult.hardFails.length === 0 ? "✅" : "❌ " + judgeResult.hardFails.join(", ")}`);
        console.log(`Summary: ${judgeResult.summary}`);
        console.log(`${"═".repeat(60)}\n`);
      } catch (e) {
        console.error(`Judge error: ${(e as Error).message}`);
      }
      break;
    }

    // ── judge-all-v6: 전체 파이프라인 실행 + 결과 저장 ─────────
    case "judge-all-v6": {
      const tcIds = await loadAllV6TcIds();
      const paths = ["A", "B", "C"] as const;
      const allSaved: string[] = [];

      console.log(`\n[V6 Judge-All] ${tcIds.length} TCs × 3 paths = ${tcIds.length * 3} 실행\n`);

      for (const tcId of tcIds) {
        const tc = await loadTestCaseV6(tcId);

        for (const pk of paths) {
          if (!tc.paths[pk]) continue;

          process.stdout.write(`  ${tcId} Path-${pk}... `);
          try {
            const pipelineResult = await runPipelineV6(tc, pk);
            const hfg = pipelineResult.finalPlan ? checkHardFails(pipelineResult.finalPlan, tc) : [];
            const allMatch = pipelineResult.results.every(r => r.actionMatch);

            const resultsDir = path.resolve(import.meta.dirname, "../data/v6/results");
            await fs.mkdir(resultsDir, { recursive: true });
            const outFile = path.join(resultsDir, `${tcId}-${pk}.json`);
            await fs.writeFile(outFile, JSON.stringify({ tc, pipelineResult, hfg, allMatch }, null, 2));
            allSaved.push(outFile);

            const pass = allMatch && hfg.length === 0;
            console.log(`${pass ? "✅" : "❌"} hfg=[${hfg.join(",")}] saved`);
            await sleep(500);
          } catch (e) {
            console.log(`❌ ERROR: ${(e as Error).message}`);
          }
        }
      }

      console.log(`\n${"═".repeat(60)}`);
      console.log(`[V6 Judge-All] ${allSaved.length}개 결과 저장 완료`);
      console.log(`결과 위치: data/v6/results/`);
      console.log(`${"═".repeat(60)}\n`);
      break;
    }

    case "iterate": {
      const maxRounds = parseInt(
        args.find(a => a.startsWith("--max-rounds="))?.split("=")[1] ?? "10"
      );
      const target = parseInt(
        args.find(a => a.startsWith("--target="))?.split("=")[1] ?? "0"
      );
      await iterateMode(maxRounds, target);
      break;
    }

    case "analyze": {
      const reportsDir = path.resolve(import.meta.dirname, "../reports");
      try {
        const files = (await fs.readdir(reportsDir))
          .filter(f => f.endsWith(".json"))
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
      console.log(`Unknown command: ${args[0]}. Run without args for help.`);
  }
}

main().catch(console.error);
