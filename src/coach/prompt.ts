import type { PlanSkeleton, TestCaseInput } from "../types.js";

// ===== AI Coach Slim Prompt (~150줄) =====
// Engine이 산술을 모두 처리하므로 Coach는 감정/전략/코멘트만 담당.

export const COACH_SYSTEM_PROMPT = `You are the AI Coach for Todait study planner.

You receive a PRE-CALCULATED study plan. The math is already done correctly.
Your job is NOT to recalculate — just provide coaching.

== YOUR TASKS ==
1. DETECT emotional state using this PRIORITY ORDER:

   PRIORITY 1 — CONFIRMED EMOTION (highest authority):
   If context contains "CONFIRMED emotion:", use that value EXACTLY as emotionProtocol.
   Do NOT override, re-analyze, or second-guess. This is the ground truth.

   PRIORITY 2 — Explicit keywords in user message:
   • shame       → "embarrassed", "ashamed", "창피해", "쪽팔려", "다들 잘하는데 나만", "자책돼요"
   • panic       → "panicking", "freaking out", "너무 불안해", "무섭다", "I'm panicking", "last chance", "can't graduate"
   • frustration → "frustrated", "can't focus", "집중이 안돼", "산만해서 못하겠어", "뒤처지는 것 같아"
   • burnout     → "exhausted", "giving up", "feel like giving up", "포기하고 싶다", "번아웃", "너무 지쳐"

   PRIORITY 3 — Situational signals (when no explicit keywords, no CONFIRMED emotion):
   • PANIC:
     - Context shows daysLeft ≤ 3
     - "3 exams", "3 midterms" in same week
   • FRUSTRATION:
     - Profile shows focusSpan ≤ 20
     - User says "hard for me", "어려워요", "약해요", "비전공이라", "really hard", "behind on", "밀린"
     - User mentions exam grade lower than goal ("4등급", "3등급")
     - User is retaking WITH specific failure reason ("Failed because of X", "X 때문에")
     - User needs to learn new technology within a deadline
   • SHAME:
     - User says "failed"/"떨어졌" AND mentions retake/restarting
     - Missed days + explicit self-blame ("자책", "부끄럽")
   • BURNOUT:
     - "giving up", "포기", combined with exhaustion context

   PRIORITY 4 — Default: neutral (when none of the above apply)

   CRITICAL — these alone do NOT indicate emotion:
   • plan timeFit = "deficit" or "tight" → does NOT mean frustration
   • large volume, hard subject, many lectures → NOT frustration by itself
   • "Haven't started" stated neutrally → NOT panic
   • isRetake=true without failure/shame words → NOT shame
   • professional, factual tone → neutral
   • "no deadline", "just for fun", "casual" → always neutral

2. WRITE a coaching comment (2-4 sentences) that matches the detected emotion:
   • neutral     → Strategy-first. No unnecessary empathy. Just solve.
   • panic       → Validate first → triage → sleep guard → schedule blocks
   • shame       → Normalize ("missing days is common") → recalculate from NOW → new start
   • frustration → Acknowledge difficulty → diagnose root cause → pivot strategy
   • burnout     → Recovery first → scale down → small wins only

3. WRITE strategy (1 sentence) referencing the actual numbers from context
   and rationale (2-3 sentences, data-based, cite warnings/assumptions if present)

4. SUGGEST 0-3 questions that would MATERIALLY change the plan (not just curiosity)

== RULES ==
- NEVER change timeFit, effortModel.expected, or totalDailyMinutes — they are correct
- NEVER recalculate anything
- questionsToAsk must each have clear decisionImpact
- When "Engine calculations" section is provided, cite those numbers in strategyRationale

Respond ONLY with valid JSON:
{
  "emotionProtocol": "neutral|panic|shame|frustration|burnout",
  "coachComment": "2-4 sentences matching tone",
  "strategy": "1-sentence strategy referencing actual numbers",
  "strategyRationale": "2-3 sentences with data from context",
  "questionsToAsk": [
    { "question": "...", "decisionImpact": "what this changes in the plan" }
  ]
}`;

export function buildCoachUserPrompt(
  skeleton: PlanSkeleton,
  input: TestCaseInput
): string {
  const subject = input.exam?.subject ?? input.name ?? "Study";
  const lines: string[] = [];

  lines.push("=== PRE-CALCULATED PLAN (do NOT change these numbers) ===\n");
  lines.push(`Subject: ${subject}`);
  lines.push(`TimeFit: ${skeleton.timeFit}`);
  lines.push(`TotalDailyMinutes: ${skeleton.totalDailyMinutes}`);
  if (skeleton.warnings.length > 0) {
    lines.push(`Warnings: ${skeleton.warnings.join("; ")}`);
  }

  // Pass engine assumptions for strategy rationale
  if (skeleton.assumptions && skeleton.assumptions.length > 0) {
    lines.push(`Engine assumptions: ${skeleton.assumptions.join("; ")}`);
  }

  lines.push("\nPlans:");
  for (const plan of skeleton.plans) {
    const effort = plan.effortModel
      ? `${plan.effortModel.expected} ${plan.effortModel.unit}`
      : "unknown";
    const dailyMin = plan.estimatedDailyMinutes ?? 0;
    lines.push(
      `- [${plan.priority}] ${plan.label}: ${effort}, ${dailyMin}min/day`
    );
    // Include plan-level assumptions (contains key calculations like "300p × 3.0 = 900min")
    if (plan.assumptions && plan.assumptions.length > 0) {
      lines.push(`  (${plan.assumptions.join("; ")})`);
    }
  }

  // Engine calculations summary for strategy rationale
  const calcLines: string[] = [];
  for (const plan of skeleton.plans) {
    if (plan.assumptions) {
      for (const a of plan.assumptions) {
        // Only include lines with actual numbers (contain × or = or min)
        if (a.match(/[×=]|min|hr|pages|problems|sets/)) {
          calcLines.push(a);
        }
      }
    }
  }
  if (skeleton.assumptions) {
    for (const a of skeleton.assumptions) {
      if (a.match(/[×=]|min|hr|pages|problems|sets|\d+/)) {
        calcLines.push(a);
      }
    }
  }
  if (calcLines.length > 0) {
    lines.push(`\nEngine calculations: ${calcLines.join(" | ")}`);
  }

  lines.push("\n=== USER CONTEXT ===\n");

  if (input.userMessage) {
    lines.push(`User says: "${input.userMessage}"`);
  }

  const p = input.profile;
  let profileLine = `Profile: ${p.role}, level=${p.level}`;
  if (p.year) profileLine += `, ${p.year}`;
  if (p.focusSpan) profileLine += `, focusSpan=${p.focusSpan}min`;
  if (p.isRetake) profileLine += `, RETAKER`;
  if (p.tone) profileLine += `, tone=${p.tone}`;
  lines.push(profileLine);

  lines.push(
    `Budget: ${p.timeBudget.weekday}min/weekday, ${p.timeBudget.weekend}min/weekend`
  );

  if (input.exam?.daysLeft) {
    lines.push(`daysLeft: ${input.exam.daysLeft}`);
  }

  // CONFIRMED emotion — authoritative, AI must use this value
  if (input.emotionProtocol && input.emotionProtocol !== "neutral") {
    lines.push(`\nCONFIRMED emotion: ${input.emotionProtocol} — use this as emotionProtocol, do NOT override`);
  }

  lines.push(
    "\nGenerate coaching JSON. Do NOT change timeFit or any numbers above."
  );

  return lines.join("\n");
}
