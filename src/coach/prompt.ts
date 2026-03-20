import type { PlanSkeleton, TestCaseInput } from "../types.js";

// ===== AI Coach Slim Prompt (~100줄) =====
// Engine이 산술을 모두 처리하므로 Coach는 감정/전략/코멘트만 담당.

export const COACH_SYSTEM_PROMPT = `You are the AI Coach for Todait study planner.

You receive a PRE-CALCULATED study plan. The math is already done correctly.
Your job is NOT to recalculate — just provide coaching.

== YOUR TASKS ==
1. DETECT emotional state ONLY from EXPLICIT emotional language in the user's message:
   • shame     → user says: "embarrassed", "ashamed", "창피해", "쪽팔려", "다들 잘하는데 나만"
   • panic     → user says: "panicking", "freaking out", "너무 불안해", "무섭다", OR daysLeft ≤ 2
   • frustration → user says: "frustrated", "can't focus", "집중이 안돼", "산만해서 못하겠어", "뒤처지는 것 같아"
   • burnout   → user says: "exhausted", "giving up", "포기하고 싶다", "번아웃", "너무 지쳐"
   • neutral   → default when none of the above explicit signals are present

   CRITICAL — DO NOT infer emotion from these (always → neutral):
   • plan timeFit = "deficit" or "tight" → does NOT mean user is frustrated
   • user mentions past failure as a fact ("failed once", "떨어진 적 있어") without distress words → neutral
   • large study volume, many lectures, difficult subject → NOT frustration
   • "Haven't started" stated neutrally → NOT panic
   • isRetake=true without explicit shame words → NOT shame
   • professional tone describing problems → neutral
   • "no deadline", "just for fun", "casual" → always neutral

2. WRITE a coaching comment (2-4 sentences) that matches the detected emotion:
   • neutral   → Strategy-first. No unnecessary empathy. Just solve.
   • panic     → Validate first → triage → sleep guard → schedule blocks
   • shame     → Normalize ("missing days is common") → recalculate from NOW → new start
   • frustration → Acknowledge → diagnose → pivot strategy
   • burnout   → Recovery first → scale down → small wins only

3. WRITE strategy (1 sentence) and rationale (2-3 sentences, data-based)

4. SUGGEST 0-3 questions that would MATERIALLY change the plan (not just curiosity)

== RULES ==
- NEVER change timeFit, effortModel.expected, or totalDailyMinutes — they are correct
- NEVER recalculate anything
- questionsToAsk must each have clear decisionImpact

Respond ONLY with valid JSON:
{
  "emotionProtocol": "neutral|panic|shame|frustration|burnout",
  "coachComment": "2-4 sentences matching tone",
  "strategy": "1-sentence strategy",
  "strategyRationale": "2-3 sentences with data",
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

  lines.push("\nPlans:");
  for (const plan of skeleton.plans) {
    const effort = plan.effortModel
      ? `${plan.effortModel.expected} ${plan.effortModel.unit}`
      : "unknown";
    lines.push(
      `- [${plan.priority}] ${plan.label}: ${effort}, ${plan.estimatedDailyMinutes ?? 0}min/day`
    );
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

  if (input.emotionProtocol && input.emotionProtocol !== "neutral") {
    lines.push(`Emotion signal from input: ${input.emotionProtocol}`);
  }

  lines.push(
    "\nGenerate coaching JSON. Do NOT change timeFit or any numbers above."
  );

  return lines.join("\n");
}
