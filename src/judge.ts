// ─── LLM-as-Judge: Claude Sonnet이 Qwen 응답을 3축 평가 ──────────

import Anthropic from "@anthropic-ai/sdk";
import type { TestCaseV6, PipelineResultV6 } from "./pipeline-v6.js";

// ─── Judge 프롬프트 ──────────────────────────────────────────────

const JUDGE_PROMPT = `
너는 AI Study Coach 품질 평가관이다.
Qwen이 생성한 학습 코칭 응답을 3축 기준으로 평가해.

## 평가 기준

### SMART (각 0-2점)
S: 과목/자료/분량이 구체적으로 특정됐는가
M: dailyTarget이 숫자로 나왔는가
A: profile(focusSpan/level) + timeFit이 현실적으로 반영됐는가
R: 약점/우선순위가 plan 구조에 반영됐는가
T: 마감 기반으로 일정이 역산됐는가

### CPI (각 0-2점, 시험 경로 필수 / 다른 경로 보너스)
C: 전체 대비 커버리지 %가 명시됐는가
P: 인출 연습(문제풀기, 셀프테스트)이 제안됐는가
I: 이해도 확인 구조(틀린 문제 복습 등)가 제안됐는가

### Coach (각 0-2점)
진단: profile + 유저 답변이 plan에 실제로 반영됐는가
전략: timeFit에 맞는 전략인가
현실: timeFit을 솔직하게 전달했는가
감정: emotion에 맞는 톤인가, mustNotSay 위반 없는가

### Hard Fail (하나라도 있으면 전체 FAIL)
HFG-1: deficit인데 "충분히 할 수 있어"
HFG-2: mustNotSay 위반
HFG-3: 분량 모르는데 추정 없이 plan 생성
HFG-4: 시간 기반 plan (포모도로 등)
HFG-5: profile 데이터(focusSpan/level) 완전 무시

## 출력 형식 (JSON만)
{
  "smart": {
    "specific": { "score": 0, "reason": "한 줄" },
    "measurable": { "score": 0, "reason": "한 줄" },
    "achievable": { "score": 0, "reason": "한 줄" },
    "relevant": { "score": 0, "reason": "한 줄" },
    "timeBound": { "score": 0, "reason": "한 줄" }
  },
  "cpi": {
    "coverage": { "score": 0, "reason": "한 줄" },
    "practice": { "score": 0, "reason": "한 줄" },
    "insight": { "score": 0, "reason": "한 줄" }
  },
  "coach": {
    "diagnosis": { "score": 0, "reason": "한 줄" },
    "strategy": { "score": 0, "reason": "한 줄" },
    "honesty": { "score": 0, "reason": "한 줄" },
    "emotion": { "score": 0, "reason": "한 줄" }
  },
  "hardFails": [],
  "totalScore": 0,
  "maxScore": 24,
  "pass": false,
  "summary": "한 줄 총평"
}
`.trim();

// ─── 타입 ────────────────────────────────────────────────────────

export interface ScoreItem {
  score: number;
  reason: string;
}

export interface JudgeResult {
  smart: {
    specific: ScoreItem;
    measurable: ScoreItem;
    achievable: ScoreItem;
    relevant: ScoreItem;
    timeBound: ScoreItem;
  };
  cpi: {
    coverage: ScoreItem;
    practice: ScoreItem;
    insight: ScoreItem;
  };
  coach: {
    diagnosis: ScoreItem;
    strategy: ScoreItem;
    honesty: ScoreItem;
    emotion: ScoreItem;
  };
  hardFails: string[];
  totalScore: number;
  maxScore: number;
  pass: boolean;
  summary: string;
}

// ─── Judge 실행 ──────────────────────────────────────────────────

export async function judgeResponse(
  tc: TestCaseV6,
  pathKey: string,
  pipelineResult: PipelineResultV6
): Promise<JudgeResult> {
  const client = new Anthropic();
  const path = tc.paths[pathKey as "A" | "B" | "C"];

  const conversationText = pipelineResult.results
    .map(r => `Turn ${r.turn}:\n  학생: ${r.userMessage}\n  코치: ${JSON.stringify(r.aiResponse, null, 2)}`)
    .join("\n\n");

  const expectedText = JSON.stringify(
    path.conversation.map(c => c.expectedAI),
    null,
    2
  );

  const userPrompt = `
## TC 정보
ID: ${tc.id}
Path: ${pathKey}
Profile: ${JSON.stringify(tc.profile)}
Emotion: ${tc.emotionProtocol ?? "neutral"}
Category: ${tc.category}

## 대화 내역
${conversationText}

## 이 TC의 기대사항 (Path ${pathKey})
${expectedText}

위 대화를 평가해.
`.trim();

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 1500,
    messages: [
      { role: "user", content: JUDGE_PROMPT + "\n\n" + userPrompt },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // JSON 추출 (```json ... ``` 감싸진 경우 처리)
  const cleaned = text
    .replace(/^```json\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as JudgeResult;
  } catch {
    throw new Error(`Judge JSON parse error.\nRaw: ${text}`);
  }
}
