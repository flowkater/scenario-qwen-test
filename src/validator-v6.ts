// ─── V6 검증기: HFG 자동 체크 + Path 분기 검증 ───────────────────

import type { TestCaseV6, PipelineResultV6 } from "./pipeline-v6.js";

// ─── 감정 프로토콜 금지 문구 ─────────────────────────────────────

const EMOTION_MUST_NOT_SAY: Record<string, string[]> = {
  frustration: ["더 집중해", "집중력이 부족", "게으른", "lazy", "왜 안 했어", "why didn't you"],
  shame: ["왜 안 했어", "이미 늦었", "시간을 낭비했", "잘못됐어", "you wasted", "too late"],
  panic: ["충분히 할 수 있어", "다 할 수 있어", "you'll be fine", "no problem", "걱정 마"],
  burnout: ["열심히", "더 해야", "노력이 필요", "work harder", "try harder"],
  neutral: [],
};

const POSITIVE_PHRASES = [
  "충분히 할 수 있어",
  "다 할 수 있어",
  "걱정 마",
  "문제 없어",
  "you can do it",
  "you'll be fine",
  "no problem",
  "you'll manage",
  "enough time",
];

// ─── HFG 자동 검증 ───────────────────────────────────────────────

function containsPositive(message: string): boolean {
  const lower = message.toLowerCase();
  return POSITIVE_PHRASES.some(p => lower.includes(p.toLowerCase()));
}

function hasTimeBasedPlan(response: any): boolean {
  if (!response?.message) return false;
  const m = (response.message as string).toLowerCase();
  const timePhrases = [
    "포모도로", "pomodoro",
    "시간 블록", "time block",
    "09:", "08:", "07:", "10:", // HH: 패턴 (시간 기반 스케줄)
    "25분", "50분", "25 min", "50 min",
  ];
  return timePhrases.some(p => m.includes(p));
}

function hasUnknownQuantity(response: any): boolean {
  if (!Array.isArray(response?.plans)) return false;
  return response.plans.some(
    (p: any) => !p.dailyTarget?.value || p.dailyTarget.value === 0 || !p.totalQuantity
  );
}

export function checkHardFails(response: any, tc: TestCaseV6): string[] {
  const fails: string[] = [];
  if (!response) return fails;

  const msg = response.message ?? "";

  // HFG-1: deficit/impossible인데 긍정적 메시지
  if (response.timeFit === "deficit" || response.timeFit === "impossible") {
    if (containsPositive(msg)) fails.push("HFG-1");
  }

  // HFG-2: mustNotSay 위반
  const protocol = tc.emotionProtocol ?? "neutral";
  const forbidden = EMOTION_MUST_NOT_SAY[protocol] ?? [];
  const msgLower = msg.toLowerCase();
  if (forbidden.some(p => msgLower.includes(p.toLowerCase()))) {
    fails.push("HFG-2");
  }

  // HFG-3: plan 생성인데 분량이 0이거나 누락
  if (response.action === "generate_plan" && hasUnknownQuantity(response)) {
    fails.push("HFG-3");
  }

  // HFG-4: 시간 기반 plan
  if (hasTimeBasedPlan(response)) fails.push("HFG-4");

  // HFG-5: generate_plan인데 plans 없음 (profile 무시 징후)
  if (response.action === "generate_plan" && (!response.plans || response.plans.length === 0)) {
    fails.push("HFG-5");
  }

  return fails;
}

// ─── Path 분기 검증 ──────────────────────────────────────────────

function extractFinalPlan(result: PipelineResultV6): any[] {
  return result.finalPlan?.plans ?? [];
}

function getDailyTargetSig(plans: any[]): string {
  return plans
    .map(p => `${p.dailyTarget?.value ?? 0}${p.dailyTarget?.unit ?? ""}`)
    .sort()
    .join(",");
}

function getPrioritySig(plans: any[]): string {
  return plans
    .map(p => p.priority ?? "")
    .sort()
    .join(",");
}

export interface PathDiffResult {
  diffs: {
    planCount: boolean;
    dailyTargetDiff: boolean;
    priorityDiff: boolean;
    strategyDiff: boolean;
    timeFitDiff: boolean;
  };
  diffCount: number;
  pass: boolean;
}

export function validatePathDiff(
  pathAResult: PipelineResultV6,
  pathBResult: PipelineResultV6,
  pathCResult: PipelineResultV6
): PathDiffResult {
  const planA = extractFinalPlan(pathAResult);
  const planB = extractFinalPlan(pathBResult);
  const planC = extractFinalPlan(pathCResult);

  // plan 수 차이
  const planCount = new Set([planA.length, planB.length, planC.length]).size > 1;

  // dailyTarget 차이
  const [sigA, sigB, sigC] = [getDailyTargetSig(planA), getDailyTargetSig(planB), getDailyTargetSig(planC)];
  const dailyTargetDiff = !(sigA === sigB && sigB === sigC);

  // priority 차이
  const [priA, priB, priC] = [getPrioritySig(planA), getPrioritySig(planB), getPrioritySig(planC)];
  const priorityDiff = !(priA === priB && priB === priC);

  // strategy (message 앞 100자 비교)
  const getMsgSig = (r: PipelineResultV6) => (r.finalPlan?.message ?? "").slice(0, 80);
  const strategyDiff = !(
    getMsgSig(pathAResult) === getMsgSig(pathBResult) &&
    getMsgSig(pathBResult) === getMsgSig(pathCResult)
  );

  // timeFit 차이
  const getFit = (r: PipelineResultV6) => r.finalPlan?.timeFit ?? "";
  const timeFitDiff = new Set([getFit(pathAResult), getFit(pathBResult), getFit(pathCResult)]).size > 1;

  const diffs = { planCount, dailyTargetDiff, priorityDiff, strategyDiff, timeFitDiff };
  const diffCount = Object.values(diffs).filter(Boolean).length;

  return { diffs, diffCount, pass: diffCount >= 2 };
}
