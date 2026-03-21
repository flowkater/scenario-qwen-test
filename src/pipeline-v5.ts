import OpenAI from "openai";
import type { TestCaseInput, PlanSkeleton } from "./types.js";
import { buildSkeleton } from "./engine/index.js";
import { V5_SYSTEM_PROMPT, buildUserPromptV5 } from "./prompt-v5.js";

let _clientV5: OpenAI | null = null;

export function initPipelineV5(client: OpenAI) {
  _clientV5 = client;
}

async function callAICoachV5(
  skeleton: PlanSkeleton,
  input: TestCaseInput
): Promise<{
  raw: string;
  parsed: any | null;
  error: string | null;
  latencyMs: number;
}> {
  if (!_clientV5) {
    return { raw: "", parsed: null, error: "V5 client not initialized", latencyMs: 0 };
  }

  const userPrompt = buildUserPromptV5(skeleton, input);
  const start = Date.now();

  try {
    const response = await _clientV5.chat.completions.create({
      model: "qwen3.5-flash",
      messages: [
        { role: "system", content: V5_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      // @ts-ignore DashScope-specific: enable chain-of-thought thinking tokens
      enable_thinking: true,
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";

    let parsed: any = null;
    let error: string | null = null;
    try {
      const cleaned = raw
        .replace(/^```json\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      error = `JSON parse error: ${(e as Error).message}`;
    }

    return { raw, parsed, error, latencyMs };
  } catch (e) {
    return {
      raw: "",
      parsed: null,
      error: `API error: ${(e as Error).message}`,
      latencyMs: Date.now() - start,
    };
  }
}

function fallbackCoachingV5(input: TestCaseInput) {
  return {
    emotionProtocol: input.emotionProtocol ?? "neutral",
    coachComment: "Study plan created based on your inputs.",
    strategy: "Follow the plan consistently each day.",
    strategyRationale: "The plan is calculated based on your available time and study material.",
    questionsToAsk: [],
  };
}

export async function runPipelineV5(input: TestCaseInput): Promise<any> {
  // Layer 1: Engine calculates math
  const skeleton = buildSkeleton(input);

  // Layer 2: AI Coach with V5 clean principles prompt
  const coachResult = await callAICoachV5(skeleton, input);
  const coaching = coachResult.parsed ?? fallbackCoachingV5(input);

  // Merge: Engine fields locked, Coach adds judgment layer
  return {
    // Engine fields (locked)
    plans: skeleton.plans,
    timeFit: skeleton.timeFit,
    timeBudgetFit: skeleton.timeFit,
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
