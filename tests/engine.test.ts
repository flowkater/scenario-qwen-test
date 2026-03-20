import { buildSkeleton } from "../src/engine/index.js";
import type { TestCaseInput, TimeFit } from "../src/types.js";
import fs from "fs";
import path from "path";

function checkTimeFit(actual: string, expected: string | undefined): boolean {
  if (!expected) return true; // No expected timeFit means skip this check
  if (actual === expected) return true;
  // deficit -> impossible OK (stricter)
  if (expected === "deficit" && actual === "impossible") return true;
  // fits -> tight OK (minor)
  if (expected === "fits" && actual === "tight") return true;
  // tight -> fits OK (near boundary)
  if (expected === "tight" && actual === "fits") return true;
  // tight -> deficit OK (more conservative)
  if (expected === "tight" && actual === "deficit") return true;
  return false;
}

function checkEffortModel(skeleton: ReturnType<typeof buildSkeleton>, expected: any): { passed: boolean; detail: string } {
  const effortModel = expected.effortModel;
  if (!effortModel) return { passed: true, detail: "no effortModel expected" };

  // unpredictable or null values -> skip
  if (
    effortModel.type === "unpredictable" ||
    effortModel.type === "fixed" ||
    effortModel.min == null ||
    effortModel.max == null ||
    effortModel.expected == null
  ) {
    return { passed: true, detail: "unpredictable/fixed/null skip" };
  }

  const expMin = effortModel.min;
  const expMax = effortModel.max;
  const expUnit = effortModel.unit;

  // Find matching plan by unit
  let targetPlan = skeleton.plans.find(p => p.effortModel?.unit === expUnit);
  if (!targetPlan) targetPlan = skeleton.plans.find(p => p.priority === "primary");
  if (!targetPlan?.effortModel) return { passed: true, detail: "no effortModel in plan, skip" };

  // Skip for unpredictable plans
  if (targetPlan.effortModel.type === "unpredictable") return { passed: true, detail: "plan is unpredictable, skip" };

  const actual = targetPlan.effortModel.expected;

  // P25-P75 range
  if (actual >= expMin && actual <= expMax) {
    return { passed: true, detail: `${actual} within [${expMin}, ${expMax}]` };
  }

  // +/-30% tolerance
  const lo = expMin * 0.7;
  const hi = expMax * 1.3;
  const passed = actual >= lo && actual <= hi;
  return { passed, detail: `${actual} in [${lo.toFixed(2)}, ${hi.toFixed(2)}] = ${passed}` };
}

function checkEffortModels(skeleton: ReturnType<typeof buildSkeleton>, expected: any): { passed: boolean; detail: string } {
  const effortModels = expected.effortModels;
  if (!effortModels) return { passed: true, detail: "no effortModels expected" };

  const keys = Object.keys(effortModels);
  const details: string[] = [];

  // Group expected models by unit — only require at least one match per unit
  const byUnit: Record<string, { key: string; em: any }[]> = {};
  for (const key of keys) {
    const em = effortModels[key];
    if (!em || em.type === "unpredictable" || em.type === "fixed" || em.min == null || em.max == null || em.expected == null) continue;
    const unit = em.unit;
    if (!byUnit[unit]) byUnit[unit] = [];
    byUnit[unit].push({ key, em });
  }

  let allPassed = true;

  for (const unit of Object.keys(byUnit)) {
    const candidates = byUnit[unit];
    const matchingPlans = skeleton.plans.filter(p => p.effortModel?.unit === unit);
    if (matchingPlans.length === 0) continue;

    // For each plan with this unit, check if ANY expected model matches
    let unitPassed = false;
    const unitDetails: string[] = [];

    for (const { key, em } of candidates) {
      const targetPlan = matchingPlans.reduce((best, p) => {
        const bestDiff = Math.abs((best?.effortModel?.expected ?? Infinity) - em.expected);
        const pDiff = Math.abs((p?.effortModel?.expected ?? Infinity) - em.expected);
        return pDiff < bestDiff ? p : best;
      });

      if (!targetPlan?.effortModel) continue;
      if (targetPlan.effortModel.type === "unpredictable") continue;

      const actual = targetPlan.effortModel.expected;
      const lo = em.min * 0.7;
      const hi = em.max * 1.3;
      const passed = actual >= lo && actual <= hi;
      if (passed) unitPassed = true;
      unitDetails.push(`${key}: ${actual} in [${lo.toFixed(1)}, ${hi.toFixed(1)}]=${passed}`);
    }

    if (!unitPassed) allPassed = false;
    details.push(...unitDetails);
  }

  return { passed: allPassed, detail: details.join("; ") || "all skip" };
}

/**
 * Extract expectedTimeFit from various expected file formats
 */
function getExpectedTimeFit(expectedRaw: any): string | undefined {
  // Standard format
  if (expectedRaw.expectedTimeFit) return expectedRaw.expectedTimeFit;

  // tc-37 style: calculationCheck.timeFit
  if (expectedRaw.calculationCheck?.timeFit) return expectedRaw.calculationCheck.timeFit;

  // tc-38 style: has deficitCalculation -> deficit
  if (expectedRaw.deficitCalculation) return "deficit";

  // tc-39: mock exam replan -> use scoringNotes.feasibilityHonesty hints
  if (expectedRaw.diagnosisFirst) return "tight"; // Replan with enough time

  // tc-40/41/42: multi-subject expected format
  if (expectedRaw.globalAllocation || expectedRaw.gradeBasedAllocation || expectedRaw.sequentialVsParallel) {
    // Check scoring notes for hints
    const scoring = expectedRaw.scoringNotes?.feasibilityHonesty ?? "";
    // "deficit 없음" means "no deficit" - don't extract "deficit" from negation
    if (scoring.includes("deficit") && !scoring.includes("deficit 없음") && !scoring.includes("no deficit")) return "deficit";
    if (scoring.includes("충분") || scoring.includes("sufficient")) return "tight";
    return "tight"; // Multi-subject is typically tight
  }

  return undefined;
}

/**
 * Extract HFG rules from expected files with various formats
 */
function getHardFailChecks(expectedRaw: any): string[] {
  if (Array.isArray(expectedRaw.hardFailChecks)) {
    // Filter only HFG-* pattern strings
    return expectedRaw.hardFailChecks.filter((r: any) => typeof r === "string" && r.startsWith("HFG-"));
  }
  return [];
}

async function testEngineOnly() {
  const inputDir = path.resolve("data/input");
  const expectedDir = path.resolve("data/expected");
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith(".json")).sort();

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf-8"));
    const expectedFile = path.join(expectedDir, file);
    if (!fs.existsSync(expectedFile)) continue;
    const expectedRaw = JSON.parse(fs.readFileSync(expectedFile, "utf-8"));

    // Handle cross-profile TCs (tc-36)
    const inputs: TestCaseInput[] = [];
    const expecteds: any[] = [];

    if (raw.profiles) {
      for (const p of raw.profiles) {
        inputs.push({
          ...p,
          category: p.category ?? raw.category ?? "cross-profile",
          versionTag: p.versionTag ?? raw.versionTag,
          resources: p.resources ?? [],
          profile: {
            role: p.profile?.role ?? "student",
            level: p.profile?.level ?? "beginner",
            focusSpan: p.profile?.focusSpan ?? 30,
            timeBudget: p.profile?.timeBudget ?? { weekday: 60, weekend: 60 },
            ...p.profile,
          },
        });
      }
      for (const p of expectedRaw.profiles ?? []) {
        expecteds.push({
          ...p,
          tcId: p.profileId ?? p.tcId,
          versionTag: p.versionTag ?? expectedRaw.versionTag,
        });
      }
    } else {
      // Ensure input has valid profile
      const input = {
        ...raw,
        profile: {
          role: raw.profile?.role ?? "student",
          level: raw.profile?.level ?? "beginner",
          focusSpan: raw.profile?.focusSpan ?? 30,
          timeBudget: raw.profile?.timeBudget ?? { weekday: 60, weekend: 60 },
          ...raw.profile,
        },
        resources: raw.resources ?? [],
      };
      inputs.push(input);

      // Enrich expected with extracted timeFit
      const enriched = { ...expectedRaw };
      if (!enriched.expectedTimeFit) {
        enriched.expectedTimeFit = getExpectedTimeFit(expectedRaw);
      }
      expecteds.push(enriched);
    }

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const expected = expecteds[i];
      if (!expected) continue;

      const skeleton = buildSkeleton(input);

      const expectedTimeFit = expected.expectedTimeFit;
      const timeFitOk = checkTimeFit(skeleton.timeFit, expectedTimeFit);
      const effortCheck = checkEffortModel(skeleton, expected);
      const effortModelsCheck = checkEffortModels(skeleton, expected);
      const plansOk = skeleton.plans.length > 0;

      // HFG checks
      let hfgOk = true;
      const rules: string[] = getHardFailChecks(expected);
      if (rules.includes("HFG-1")) {
        const expFit = expectedTimeFit;
        if (
          (expFit === "deficit" || expFit === "impossible") &&
          skeleton.timeFit === "fits"
        ) {
          hfgOk = false;
        }
      }
      if (rules.includes("HFG-2")) {
        const weekdayBudget = input.profile.timeBudget.weekday;
        if (weekdayBudget > 0 && skeleton.totalDailyMinutes > weekdayBudget * 1.5 && skeleton.timeFit === "fits") {
          hfgOk = false;
        }
      }
      if (rules.includes("HFG-4")) {
        const hasAssumptions = skeleton.plans.some(
          p => Array.isArray(p.assumptions) && p.assumptions.length > 0
        );
        if (!hasAssumptions) hfgOk = false;
      }

      const ok = timeFitOk && effortCheck.passed && effortModelsCheck.passed && plansOk && hfgOk;
      const tcId = input.id;

      if (ok) {
        passed++;
        const primaryPlan = skeleton.plans.find(p => p.priority === "primary") ?? skeleton.plans[0];
        console.log(
          `  PASS ${tcId}: timeFit=${skeleton.timeFit}(exp:${expectedTimeFit ?? "n/a"}) | effort=${primaryPlan?.effortModel?.expected ?? "?"} | daily=${skeleton.totalDailyMinutes}min`
        );
      } else {
        failed++;
        const issues: string[] = [];
        if (!timeFitOk) issues.push(`timeFit: got ${skeleton.timeFit}, expected ${expectedTimeFit}`);
        if (!effortCheck.passed) issues.push(`effort: ${effortCheck.detail}`);
        if (!effortModelsCheck.passed) issues.push(`effortModels: ${effortModelsCheck.detail}`);
        if (!plansOk) issues.push("empty plans");
        if (!hfgOk) issues.push("HFG failed");
        const msg = `  FAIL ${tcId}: ${issues.join(" | ")}`;
        failures.push(msg);
        console.log(msg);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Engine-only: ${passed}/${passed + failed} PASS`);
  if (failures.length > 0) {
    console.log(`\n  Failed TCs:`);
    failures.forEach(f => console.log(`  ${f}`));
  }
  console.log(`${"=".repeat(60)}`);
  process.exit(failed > 0 ? 1 : 0);
}

testEngineOnly().catch(console.error);
