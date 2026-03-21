// ─── V6 멀티턴 파이프라인 ────────────────────────────────────────

import OpenAI from "openai";
import { V6_SYSTEM_PROMPT, buildUserPromptV6 } from "./prompt-v6.js";
import type { V6Profile, ConversationTurn, EngineCalcResult } from "./prompt-v6.js";
import { calcEffectiveBudget, determineTimeFit } from "./engine/calculator.js";

// ─── TC v6 타입 ──────────────────────────────────────────────────

export interface V6ExpectedAI {
  action: "ask" | "generate_plan";
  question?: string;
  choices?: Array<{ id: string; text: string; planImpact?: string }>;
  mustInclude?: {
    smart?: Record<string, string>;
    cpi?: Record<string, string>;
    coach?: Record<string, string>;
  };
  mustNotDo?: string[];
  mustDifferFrom?: string;
}

export interface V6ConversationTurn {
  turn: number;
  user: string;
  expectedAI: V6ExpectedAI;
}

export interface V6Path {
  label: string;
  conversation: V6ConversationTurn[];
}

export interface TestCaseV6 {
  id: string;
  category: string;
  name: string;
  path: string;
  emotionProtocol?: string;
  profile: V6Profile;
  paths: {
    A: V6Path;
    B: V6Path;
    C: V6Path;
  };
  hardFailGates: string[];
}

export interface TurnResult {
  turn: number;
  userMessage: string;
  aiResponse: any;
  expectedAction: string;
  actionMatch: boolean;
  parseError: string | null;
  latencyMs: number;
}

export interface PipelineResultV6 {
  tcId: string;
  path: string;
  results: TurnResult[];
  finalPlan: any | null;
  error: string | null;
}

// ─── Engine Pre-calculate ────────────────────────────────────────

function extractDays(text: string): number {
  const m = text.match(/(\d+)\s*days?\b/i);
  return m ? parseInt(m[1]) : 14;
}

function extractEngineCalc(profile: V6Profile, history: ConversationTurn[]): EngineCalcResult {
  const allText = history.map(t => t.user).join(" ");
  const days = extractDays(allText);

  const focusMultiplier =
    profile.focusSpan <= 15 ? 0.65 :
    profile.focusSpan <= 25 ? 0.80 : 0.90;

  const effectiveBudget = calcEffectiveBudget(profile.timeBudget.weekday, profile.focusSpan);
  const resources: EngineCalcResult["resources"] = [];

  // 페이지 추출
  const pageMatch = allText.match(/(\d+)\s*pages?/i);
  if (pageMatch) {
    const qty = parseInt(pageMatch[1]);
    const rateP50 = 5.0; // general textbook
    const dailyNeedMinutes = Math.round((qty * rateP50) / days);
    const timeFit = determineTimeFit(
      dailyNeedMinutes, effectiveBudget,
      profile.timeBudget.weekday, profile.timeBudget.weekend
    );
    resources.push({
      label: "Textbook",
      quantity: qty,
      unit: "page",
      rateP50,
      dailyTarget: Math.ceil(qty / days),
      dailyNeedMinutes,
      timeFit,
    });
  }

  // 문제 추출
  const probMatch = allText.match(/(\d+)\s*(?:problems?|questions?)/i);
  if (probMatch) {
    const qty = parseInt(probMatch[1]);
    const rateP50 = 10.0; // general problem
    const dailyNeedMinutes = Math.round((qty * rateP50) / days);
    resources.push({
      label: "Practice",
      quantity: qty,
      unit: "problem",
      rateP50,
      dailyTarget: Math.ceil(qty / days),
      dailyNeedMinutes,
    });
  }

  return {
    days,
    effectiveBudget,
    focusMultiplier,
    resources,
    note: `focusSpan=${profile.focusSpan}min → effective ${effectiveBudget}min/day (×${focusMultiplier})`,
  };
}

// ─── Qwen 호출 ───────────────────────────────────────────────────

let _clientV6: OpenAI | null = null;

export function initPipelineV6(client: OpenAI) {
  _clientV6 = client;
}

async function callQwenV6(userPrompt: string): Promise<{
  raw: string;
  parsed: any;
  error: string | null;
  latencyMs: number;
}> {
  if (!_clientV6) {
    return { raw: "", parsed: null, error: "V6 client not initialized", latencyMs: 0 };
  }

  const start = Date.now();
  try {
    const response = await _clientV6.chat.completions.create({
      model: "qwen3.5-flash",
      messages: [
        { role: "system", content: V6_SYSTEM_PROMPT },
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

// ─── 메인 파이프라인 ─────────────────────────────────────────────

export async function runPipelineV6(
  tc: TestCaseV6,
  pathKey: "A" | "B" | "C"
): Promise<PipelineResultV6> {
  const tcPath = tc.paths[pathKey];
  const results: TurnResult[] = [];
  const conversationHistory: ConversationTurn[] = [];
  let finalPlan: any = null;

  for (const turn of tcPath.conversation) {
    // 1. 현재 유저 메시지 히스토리에 추가 (aiResponse는 아직 없음)
    conversationHistory.push({ user: turn.user });

    // 2. 마지막 턴이면 engine pre-calc 수행
    const isLastTurn = turn === tcPath.conversation[tcPath.conversation.length - 1];
    const engineCalc = isLastTurn
      ? extractEngineCalc(tc.profile, conversationHistory)
      : undefined;

    // 3. 누적 대화 + profile + engine calc으로 user prompt 빌드
    const userPrompt = buildUserPromptV6(tc.profile, conversationHistory, engineCalc);

    // 4. Qwen 호출
    const { parsed, error, latencyMs } = await callQwenV6(userPrompt);

    // 5. generate_plan이면 finalPlan 저장
    if (parsed?.action === "generate_plan") {
      finalPlan = parsed;
    }

    // 6. 히스토리에 AI 응답 반영
    conversationHistory[conversationHistory.length - 1].aiResponse = parsed;

    results.push({
      turn: turn.turn,
      userMessage: turn.user,
      aiResponse: parsed,
      expectedAction: turn.expectedAI.action,
      actionMatch: !error && parsed?.action === turn.expectedAI.action,
      parseError: error,
      latencyMs,
    });
  }

  return { tcId: tc.id, path: pathKey, results, finalPlan, error: null };
}
