import OpenAI from "openai";
import type { TestCaseInput, CoachOutput, PlanSkeleton } from "../types.js";
import { COACH_SYSTEM_PROMPT, buildCoachUserPrompt } from "./prompt.js";

let _client: OpenAI | null = null;

export function initCoachClient(client: OpenAI) {
  _client = client;
}

export async function generateCoaching(
  skeleton: PlanSkeleton,
  input: TestCaseInput
): Promise<{
  raw: string;
  parsed: CoachOutput | null;
  error: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
}> {
  if (!_client) {
    return {
      raw: "",
      parsed: null,
      error: "Coach client not initialized",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    };
  }

  const userPrompt = buildCoachUserPrompt(skeleton, input);
  const start = Date.now();

  try {
    const response = await _client.chat.completions.create({
      model: "qwen3.5-flash",
      messages: [
        { role: "system", content: COACH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      // @ts-ignore DashScope-specific
      enable_thinking: false,
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    let parsed: CoachOutput | null = null;
    let error: string | null = null;
    try {
      const cleaned = raw
        .replace(/^```json\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned) as CoachOutput;
    } catch (e) {
      error = `JSON parse error: ${(e as Error).message}`;
    }

    return { raw, parsed, error, usage, latencyMs };
  } catch (e) {
    return {
      raw: "",
      parsed: null,
      error: `API error: ${(e as Error).message}`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: Date.now() - start,
    };
  }
}

// Fallback coaching when AI call fails
export function fallbackCoaching(input: TestCaseInput): CoachOutput {
  return {
    emotionProtocol: input.emotionProtocol ?? "neutral",
    coachComment: "Study plan created based on your inputs.",
    strategy: "Follow the plan consistently each day.",
    strategyRationale:
      "The plan is calculated based on your available time and study material.",
    questionsToAsk: [],
  };
}
