import OpenAI from "openai";
import type { TestCaseInput, PlanSkeleton } from "./types.js";
import { buildSkeleton } from "./engine/index.js";
import { initCoachClient, generateCoaching, fallbackCoaching } from "./coach/generate.js";

export function initPipeline(client: OpenAI) {
  initCoachClient(client);
}

// Layer 1 only — no AI call
export function runEngineOnly(input: TestCaseInput): PlanSkeleton {
  return buildSkeleton(input);
}

// Layer 1 + 2 + merge
export async function runPipeline(input: TestCaseInput): Promise<any> {
  // Layer 1: deterministic engine
  const skeleton = buildSkeleton(input);

  // Layer 2: AI coach
  const coachResult = await generateCoaching(skeleton, input);
  const coaching = coachResult.parsed ?? fallbackCoaching(input);

  // Merge: engine fields locked, coach fills narrative fields
  return {
    // Engine fields (locked)
    plans: skeleton.plans,
    timeFit: skeleton.timeFit,
    timeBudgetFit: skeleton.timeFit,  // legacy compat
    totalDailyMinutes: skeleton.totalDailyMinutes,
    warnings: skeleton.warnings,
    alternatives: skeleton.alternatives,
    globalBudget: skeleton.globalBudget,
    // Coach fields
    emotionProtocol: coaching.emotionProtocol,
    coachComment: coaching.coachComment,
    strategy: coaching.strategy,
    strategyRationale: coaching.strategyRationale,
    questionsToAsk: coaching.questionsToAsk,
  };
}

export type PipelineResult = Awaited<ReturnType<typeof runPipeline>>;
