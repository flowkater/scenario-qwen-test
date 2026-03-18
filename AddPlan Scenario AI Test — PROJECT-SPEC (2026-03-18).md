# AddPlan Scenario AI Test — 프로젝트 명세서

> **목적**: Todait AddPlan Phase 3-E의 SMART+CPI 기반 학습 계획 생성을 Qwen-3.5-flash 단일턴 API로 테스트한다.
> **범위**: Qwen API 호출 → JSON 입출력 → 결과 검증. UI/서버 없음. CLI 실행.
> **언어**: TypeScript + Node.js (tsx 실행)
> **API**: DashScope (Alibaba Cloud) — `qwen3.5-flash` 모델 (flash 급)

---

## 1. 프로젝트 구조

```
add-plan-scenario-ai-test/
├── .env                          # DASHSCOPE_API_KEY (사용자 입력)
├── .env.example                  # 환경변수 템플릿
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md                     # 실행 가이드
│
├── src/
│   ├── types.ts                  # 전체 타입 정의
│   ├── prompt.ts                 # System Prompt + User Prompt 빌더
│   ├── api.ts                    # DashScope API 호출
│   ├── validator.ts              # 출력 JSON 스키마 검증 (zod)
│   ├── analyzer.ts               # 결과 분석 (SMART/CPI 정합성)
│   ├── runner.ts                 # 테스트 러너 (단일/전체)
│   └── index.ts                  # CLI 엔트리포인트
│
├── data/
│   ├── input/                    # 사전 데이터 (TC별 인터뷰 결과)
│   │   ├── tc-1-tyler.json
│   │   ├── tc-2-emma.json
│   │   ├── tc-3-cpa-retake.json
│   │   ├── tc-4-pmp-working.json
│   │   ├── tc-5-jlpt-self.json
│   │   ├── tc-6-sat-hs.json
│   │   ├── tc-7-all-unknown.json
│   │   └── tc-8-over-budget.json
│   │
│   └── expected/                 # 예상 출력 (비교 기준)
│       ├── tc-1-tyler.json
│       ├── tc-2-emma.json
│       ├── tc-3-cpa-retake.json
│       ├── tc-4-pmp-working.json
│       ├── tc-5-jlpt-self.json
│       ├── tc-6-sat-hs.json
│       ├── tc-7-all-unknown.json
│       └── tc-8-over-budget.json
│
├── results/                      # 실제 Qwen 출력 (실행 시 생성)
│   └── (실행 후 tc-X-*.json 자동 생성)
│
└── reports/                      # 분석 리포트 (실행 시 생성)
    └── (실행 후 report-YYYY-MM-DD-HHmm.json 자동 생성)
```

---

## 2. 의존성

```json
{
  "dependencies": {
    "openai": "^4.x",
    "zod": "^3.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/node": "^22.x"
  }
}
```

- **openai**: DashScope는 OpenAI 호환 API 제공 → `openai` SDK 사용 가능
- **zod**: 출력 JSON 스키마 검증
- **dotenv**: `.env` 파일 로드
- **tsx**: TypeScript 직접 실행 (빌드 불필요)

---

## 3. 환경 설정

### `.env.example`
```
DASHSCOPE_API_KEY=sk-your-key-here
```

### `.env` (사용자가 직접 입력)
```
DASHSCOPE_API_KEY=sk-xxxxx
```

### DashScope API 설정
```typescript
// src/api.ts
const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

const MODEL = "qwen3.5-72b-instruct";
```

---

## 4. 타입 정의

### `src/types.ts`

```typescript
// ===== 입력 (인터뷰 결과) =====

export interface TimeBudget {
  weekday: number;  // minutes
  weekend: number;  // minutes
}

export interface StudentProfile {
  role: "student" | "working" | "examPrep" | "self";
  studentLevel?: "highschool" | "college" | "other";
  collegeType?: "undergrad" | "grad";
  year?: string;
  readSpeed?: "fast" | "medium" | "slow";
  level: "beginner" | "capable" | "confident";
  tone: "encouraging" | "guiding" | "neutral" | "optimizing";
  focusSpan: number;  // minutes
  timeBudget: TimeBudget;
  firstTime?: boolean;
  isRetake?: boolean;
  examPrepDuration?: "justStarting" | "fewMonths" | "sixPlus" | "overYear";
  selfLearnerGoal?: "specific" | "habit" | "exploring";
}

export interface ExamDetails {
  subject: string;
  examDate: string;       // "D-5", "D-18" etc
  daysLeft: number;
  examType: "multipleChoice" | "essay" | "problemSolving" | "mixed" | "unknown";
  ddayBucket: "urgent" | "normal" | "marathon";
}

export interface Resource {
  type: "textbook" | "practice" | "lectures" | "studyGuide" | "app" | "other";
  description: string;
  quantity?: string;       // "300p", "200 problems", "9 lectures"
  watched?: string;        // for lectures: "all watched", "5/9"
  isEstimated?: boolean;   // 🤷 fallback
}

export interface ExamScope {
  description: string;     // "Ch.1-8", "전 범위", "5 domains"
  isEstimated?: boolean;   // 🤷 fallback
}

export interface CurrentState {
  description: string;     // "Read through Ch.1-5", "Haven't started"
  progressPercent?: number;
  isEstimated?: boolean;
  retakeIssue?: string;    // isRetake 시: "Not enough practice"
}

export interface TestCaseInput {
  id: string;              // "tc-1"
  name: string;            // "Tyler (FR, beginner, urgent, MC)"
  description: string;     // TC 설명
  profile: StudentProfile;
  exam: ExamDetails;
  resources: Resource[];
  examScope: ExamScope;
  currentState: CurrentState;
}

// ===== 출력 (Qwen 응답) =====

export interface StudyPlan {
  type: "read" | "practice" | "review";
  schedule: "daily" | "event";
  label: string;
  scope: string;
  dailyTarget: string;
  estimatedMinutes: number;
  priority: "primary" | "secondary" | "optional";
  rationale: string;
}

export interface QwenOutput {
  strategy: string;
  strategyRationale: string;
  cpiRatio: { c: number; p: number; i: number };
  plans: StudyPlan[];
  totalDailyMinutes: number;
  totalEventMinutes: number;
  timeBudgetFit: "fits" | "tight" | "over";
  coachComment: string;
  warnings: string[];
}

// ===== 분석 결과 =====

export interface ValidationResult {
  tcId: string;
  parseSuccess: boolean;       // JSON 파싱 성공?
  schemaValid: boolean;        // zod 스키마 통과?
  schemaErrors?: string[];
  smartCheck: {
    specific: boolean;         // label에 구체적 범위?
    measurable: boolean;       // dailyTarget에 숫자?
    achievable: boolean;       // totalDailyMinutes ≤ timeBudget?
    relevant: boolean;         // CPI 비율이 시험유형에 맞음?
    timeBound: boolean;        // 기간 명시?
  };
  cpiCheck: {
    ratioMatchesPlan: boolean; // cpiRatio와 실제 minutes 일치?
    expectedRatio: { c: number; p: number; i: number };
    actualRatio: { c: number; p: number; i: number };
    deviation: number;         // 허용 편차 (%)
  };
  timeBudgetCheck: {
    totalDailyMinutes: number;
    weekdayBudget: number;
    fits: boolean;
    eventsOnWeekend: boolean;  // 60min+ event가 weekend 스케줄?
  };
  toneCheck: {
    expectedTone: string;
    commentTone: string;       // 수동 확인 필요 (참고용)
  };
  warningsCheck: {
    expectedWarnings: string[];
    actualWarnings: string[];
    missingWarnings: string[];
  };
  overallPass: boolean;
}

export interface TestReport {
  runDate: string;
  model: string;
  totalCases: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
  summary: {
    parseRate: string;         // "8/8"
    schemaRate: string;
    smartRate: string;
    cpiRate: string;
    timeBudgetRate: string;
  };
}
```

---

## 5. System Prompt (고정)

`src/prompt.ts` 에 상수로 저장. 테스트셋 문서의 System Prompt 그대로 사용.

```typescript
export const SYSTEM_PROMPT = `You are a study plan advisor for the Todait app.
Given a student's exam details, generate an optimal study plan.

Rules:
1. Every plan must be SMART (Specific, Measurable, Achievable, Relevant, Time-bound).
2. Use the CPI framework:
   - Coverage (C): Reading/reviewing material
   - Practice (P): Solving problems, applying knowledge
   - Insight (I): Reviewing mistakes, finding patterns
3. Use this D-day × ExamType CPI ratio table:

   ≤7 days (urgent):
     MC: C10 P60 I30 | Essay: C20 P50 I30 | Problem: C5 P70 I25 | Mixed: C15 P55 I30

   8-28 days (normal):
     MC: C20 P50 I30 | Essay: C35 P40 I25 | Problem: C15 P60 I25 | Mixed: C25 P45 I30

   29+ days (marathon):
     MC: C30 P40 I30 | Essay: C40 P30 I30 | Problem: C20 P50 I30 | Mixed: C30 P40 I30

   If exam type is unknown, use Mixed ratios.

4. Resource adjustment:
   - If no practice resources exist, set P=0 and redistribute: C += remainder×0.4, I += remainder×0.6
   - If no textbook (study guide only), reduce C time estimate (study guide is faster).

5. Total daily time must not exceed timeBudget (weekday). Weekend activities should be scheduled on weekends only.
   - timeBudgetFit: "fits" = totalDailyMinutes ≤ 90% of weekday timeBudget, "tight" = 91-110%, "over" = >110%
   - Full exam simulations (>60min) MUST be scheduled on weekends if weekday budget < simulation time.

6. Plan types:
   - "daily": repeated every day (e.g., "25p/day")
   - "event": one-time activity on a specific day (e.g., "Day 8: full exam simulation")
   - totalDailyMinutes should reflect daily plans only. Events are separate.

7. Each plan needs: label, type (read/practice/review), schedule (daily/event), dailyTarget, estimatedMinutes, priority, rationale.

8. Coach comment must match the student's tone preference:
   - encouraging: warm, supportive ("You got this!")
   - guiding: steady, informative ("Here's the approach...")
   - neutral: matter-of-fact ("Standard pace.")
   - optimizing: direct, efficiency-focused ("Buffer built in. Maximize weak areas.")

9. Generate warnings when:
   - timeBudgetFit = "over" → "Plan exceeds daily budget — reduce scope or extend days"
   - P > 0 but no practice resources → "No practice resources — consider making your own"
   - totalDailyMinutes > 240 → "Heavy load — monitor burnout risk"
   - daysLeft ≤ 3 → "Extremely tight — focus on highest-impact activity only"

10. cpiRatio values must match the actual time allocation of your plans (in minutes).

11. Respond in English. Respond in JSON format only. Do not include markdown fences or any text outside the JSON.

Example output:
{
  "strategy": "PI-heavy",
  "strategyRationale": "5 days + no practice problems → read remaining + self-quiz",
  "cpiRatio": { "c": 50, "p": 0, "i": 50 },
  "plans": [
    {
      "type": "read",
      "schedule": "daily",
      "label": "Finish Ch.6-8",
      "scope": "Ch.6-8, ~75p",
      "dailyTarget": "15p/day",
      "estimatedMinutes": 30,
      "priority": "primary",
      "rationale": "Must cover remaining material before exam"
    },
    {
      "type": "review",
      "schedule": "daily",
      "label": "Study guide self-quiz",
      "scope": "30p study guide",
      "dailyTarget": "6p/day + self-test",
      "estimatedMinutes": 30,
      "priority": "primary",
      "rationale": "No practice available — study guide as quiz substitute"
    }
  ],
  "totalDailyMinutes": 60,
  "totalEventMinutes": 0,
  "timeBudgetFit": "fits",
  "coachComment": "Focus on finishing the chapters, then quiz yourself. You got this!",
  "warnings": ["No practice problems — try making flashcards from the study guide"]
}`;
```

---

## 6. User Prompt 빌더

`src/prompt.ts` 에 함수로 구현.

```typescript
export function buildUserPrompt(input: TestCaseInput): string {
  const { profile, exam, resources, examScope, currentState } = input;

  const resourceLines = resources.map(r => {
    let line = `- ${r.type}: ${r.description}`;
    if (r.quantity) line += ` (${r.quantity})`;
    if (r.watched) line += ` [watched: ${r.watched}]`;
    if (r.isEstimated) line += ` [estimated]`;
    return line;
  }).join("\n");

  const examTypeMap: Record<string, string> = {
    multipleChoice: "Multiple choice",
    essay: "Essay / Short answer",
    problemSolving: "Problem-solving",
    mixed: "Mixed",
    unknown: "Unknown",
  };

  let prompt = `Student profile:
- Role: ${profile.role}${profile.studentLevel ? ` (${profile.studentLevel})` : ""}${profile.year ? `, ${profile.year}` : ""}
- Level: ${profile.level}
- Tone preference: ${profile.tone}
- Focus span: ${profile.focusSpan}min

Exam details:
- Subject: ${exam.subject}
- Exam date: ${exam.examDate} (${exam.daysLeft} days left)
- Exam type: ${examTypeMap[exam.examType]}
- Time budget: ${profile.timeBudget.weekday}min weekday, ${profile.timeBudget.weekend}min weekend

Resources:
${resourceLines || "- None"}

Exam scope: ${examScope.description}${examScope.isEstimated ? " [estimated — student unsure]" : ""}

Current state: ${currentState.description}${currentState.progressPercent != null ? ` (~${currentState.progressPercent}% done)` : ""}${currentState.isEstimated ? " [estimated]" : ""}`;

  if (currentState.retakeIssue) {
    prompt += `\nPrevious attempt failed due to: ${currentState.retakeIssue}`;
  }

  if (profile.firstTime) {
    prompt += `\nNote: First exam ever for this student.`;
  }

  prompt += `\n\nGenerate an optimal study plan.`;

  return prompt;
}
```

---

## 7. API 호출

`src/api.ts`

```typescript
import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import type { TestCaseInput, QwenOutput } from "./types.js";

let client: OpenAI;

export function initClient() {
  client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
}

export async function callQwen(input: TestCaseInput): Promise<{
  raw: string;
  parsed: QwenOutput | null;
  error: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
}> {
  const userPrompt = buildUserPrompt(input);
  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: "qwen3.5-72b-instruct",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,       // 낮은 temperature → 일관된 출력
      max_tokens: 2000,
      response_format: { type: "json_object" },  // JSON 모드 강제
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    // JSON 파싱 시도
    let parsed: QwenOutput | null = null;
    let error: string | null = null;
    try {
      // markdown fence 제거 (혹시 모를 경우)
      const cleaned = raw.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
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
```

---

## 8. 출력 스키마 검증

`src/validator.ts`

```typescript
import { z } from "zod";
import type { QwenOutput, TestCaseInput, ValidationResult } from "./types.js";

const StudyPlanSchema = z.object({
  type: z.enum(["read", "practice", "review"]),
  schedule: z.enum(["daily", "event"]),
  label: z.string().min(1),
  scope: z.string().min(1),
  dailyTarget: z.string().min(1),
  estimatedMinutes: z.number().positive(),
  priority: z.enum(["primary", "secondary", "optional"]),
  rationale: z.string().min(1),
});

const QwenOutputSchema = z.object({
  strategy: z.string().min(1),
  strategyRationale: z.string().min(1),
  cpiRatio: z.object({
    c: z.number().min(0).max(100),
    p: z.number().min(0).max(100),
    i: z.number().min(0).max(100),
  }),
  plans: z.array(StudyPlanSchema).min(1),
  totalDailyMinutes: z.number().min(0),
  totalEventMinutes: z.number().min(0),
  timeBudgetFit: z.enum(["fits", "tight", "over"]),
  coachComment: z.string().min(1),
  warnings: z.array(z.string()),
});

export function validateSchema(output: unknown): { valid: boolean; errors: string[] } {
  const result = QwenOutputSchema.safeParse(output);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`),
  };
}

export function validateSmart(output: QwenOutput): ValidationResult["smartCheck"] {
  const plans = output.plans;
  return {
    specific: plans.every(p => p.label.length > 5 && p.scope.length > 3),
    measurable: plans.every(p => /\d/.test(p.dailyTarget)),
    achievable: output.timeBudgetFit !== "over",
    relevant: output.cpiRatio.c + output.cpiRatio.p + output.cpiRatio.i > 0,
    timeBound: plans.some(p => /[Dd]ay/.test(p.dailyTarget) || /\/day/.test(p.dailyTarget)),
  };
}

export function validateCpi(
  output: QwenOutput,
  input: TestCaseInput
): ValidationResult["cpiCheck"] {
  // 실제 plan minutes에서 CPI 비율 계산
  const dailyPlans = output.plans.filter(p => p.schedule === "daily");
  const cMinutes = dailyPlans.filter(p => p.type === "read").reduce((s, p) => s + p.estimatedMinutes, 0);
  const pMinutes = dailyPlans.filter(p => p.type === "practice").reduce((s, p) => s + p.estimatedMinutes, 0);
  const iMinutes = dailyPlans.filter(p => p.type === "review").reduce((s, p) => s + p.estimatedMinutes, 0);
  const total = cMinutes + pMinutes + iMinutes || 1;

  const actualRatio = {
    c: Math.round((cMinutes / total) * 100),
    p: Math.round((pMinutes / total) * 100),
    i: Math.round((iMinutes / total) * 100),
  };

  const expectedRatio = output.cpiRatio;
  const deviation = Math.max(
    Math.abs(actualRatio.c - expectedRatio.c),
    Math.abs(actualRatio.p - expectedRatio.p),
    Math.abs(actualRatio.i - expectedRatio.i),
  );

  return {
    ratioMatchesPlan: deviation <= 15,  // 15% 허용 편차
    expectedRatio,
    actualRatio,
    deviation,
  };
}

export function validateTimeBudget(
  output: QwenOutput,
  input: TestCaseInput
): ValidationResult["timeBudgetCheck"] {
  const weekdayBudget = input.profile.timeBudget.weekday;
  const fits = output.totalDailyMinutes <= weekdayBudget;

  // 60min+ event가 weekend 스케줄인지 체크
  const bigEvents = output.plans.filter(
    p => p.schedule === "event" && p.estimatedMinutes > 60
  );
  const eventsOnWeekend = bigEvents.length === 0 ||
    bigEvents.every(p => /[Ww]eekend|[Ss]at|[Ss]un/.test(p.dailyTarget));

  return {
    totalDailyMinutes: output.totalDailyMinutes,
    weekdayBudget,
    fits,
    eventsOnWeekend,
  };
}

export function validateFull(output: QwenOutput, input: TestCaseInput): ValidationResult {
  const schema = validateSchema(output);
  const smart = validateSmart(output);
  const cpi = validateCpi(output, input);
  const time = validateTimeBudget(output, input);

  return {
    tcId: input.id,
    parseSuccess: true,
    schemaValid: schema.valid,
    schemaErrors: schema.errors.length ? schema.errors : undefined,
    smartCheck: smart,
    cpiCheck: cpi,
    timeBudgetCheck: time,
    toneCheck: {
      expectedTone: input.profile.tone,
      commentTone: output.coachComment,
    },
    warningsCheck: {
      expectedWarnings: [],  // 나중에 expected에서 로드
      actualWarnings: output.warnings,
      missingWarnings: [],
    },
    overallPass: schema.valid &&
      Object.values(smart).every(Boolean) &&
      cpi.ratioMatchesPlan &&
      time.fits &&
      time.eventsOnWeekend,
  };
}
```

---

## 9. 결과 분석기

`src/analyzer.ts`

```typescript
import type { QwenOutput, TestCaseInput, TestReport, ValidationResult } from "./types.js";

export function generateReport(
  results: Array<{
    input: TestCaseInput;
    output: QwenOutput | null;
    validation: ValidationResult;
    raw: string;
    latencyMs: number;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>
): TestReport {
  const passed = results.filter(r => r.validation.overallPass).length;

  return {
    runDate: new Date().toISOString(),
    model: "qwen3.5-72b-instruct",
    totalCases: results.length,
    passed,
    failed: results.length - passed,
    results: results.map(r => r.validation),
    summary: {
      parseRate: `${results.filter(r => r.validation.parseSuccess).length}/${results.length}`,
      schemaRate: `${results.filter(r => r.validation.schemaValid).length}/${results.length}`,
      smartRate: `${results.filter(r => Object.values(r.validation.smartCheck).every(Boolean)).length}/${results.length}`,
      cpiRate: `${results.filter(r => r.validation.cpiCheck.ratioMatchesPlan).length}/${results.length}`,
      timeBudgetRate: `${results.filter(r => r.validation.timeBudgetCheck.fits).length}/${results.length}`,
    },
  };
}

export function printSummary(report: TestReport) {
  console.log("\n" + "=".repeat(60));
  console.log(`📊 TEST REPORT — ${report.runDate}`);
  console.log(`Model: ${report.model}`);
  console.log("=".repeat(60));
  console.log(`\n✅ Passed: ${report.passed}/${report.totalCases}`);
  console.log(`❌ Failed: ${report.failed}/${report.totalCases}`);
  console.log(`\n📈 Breakdown:`);
  console.log(`   JSON Parse:    ${report.summary.parseRate}`);
  console.log(`   Schema Valid:  ${report.summary.schemaRate}`);
  console.log(`   SMART Check:   ${report.summary.smartRate}`);
  console.log(`   CPI Match:     ${report.summary.cpiRate}`);
  console.log(`   TimeBudget:    ${report.summary.timeBudgetRate}`);

  console.log(`\n📋 Per-TC Results:`);
  for (const r of report.results) {
    const icon = r.overallPass ? "✅" : "❌";
    const issues: string[] = [];
    if (!r.schemaValid) issues.push("schema");
    if (!Object.values(r.smartCheck).every(Boolean)) {
      const failed = Object.entries(r.smartCheck).filter(([, v]) => !v).map(([k]) => k);
      issues.push(`SMART(${failed.join(",")})`);
    }
    if (!r.cpiCheck.ratioMatchesPlan) issues.push(`CPI(dev:${r.cpiCheck.deviation}%)`);
    if (!r.timeBudgetCheck.fits) issues.push("overBudget");
    if (!r.timeBudgetCheck.eventsOnWeekend) issues.push("eventNotWeekend");

    console.log(`   ${icon} ${r.tcId}: ${issues.length ? issues.join(", ") : "all pass"}`);
  }
  console.log("\n" + "=".repeat(60));
}
```

---

## 10. 테스트 러너

`src/runner.ts`

```typescript
import fs from "fs/promises";
import path from "path";
import type { TestCaseInput, QwenOutput } from "./types.js";
import { callQwen } from "./api.js";
import { validateFull } from "./validator.js";

const DATA_DIR = path.resolve(import.meta.dirname, "../data");
const RESULTS_DIR = path.resolve(import.meta.dirname, "../results");
const REPORTS_DIR = path.resolve(import.meta.dirname, "../reports");

export async function loadTestCase(tcId: string): Promise<TestCaseInput> {
  const files = await fs.readdir(path.join(DATA_DIR, "input"));
  const file = files.find(f => f.startsWith(tcId));
  if (!file) throw new Error(`TC not found: ${tcId}`);
  const data = await fs.readFile(path.join(DATA_DIR, "input", file), "utf-8");
  return JSON.parse(data);
}

export async function loadAllTestCases(): Promise<TestCaseInput[]> {
  const files = await fs.readdir(path.join(DATA_DIR, "input"));
  const jsonFiles = files.filter(f => f.endsWith(".json")).sort();
  return Promise.all(
    jsonFiles.map(async f => {
      const data = await fs.readFile(path.join(DATA_DIR, "input", f), "utf-8");
      return JSON.parse(data);
    })
  );
}

export async function runTestCase(input: TestCaseInput) {
  console.log(`\n🔄 Running ${input.id}: ${input.name}...`);

  const result = await callQwen(input);

  // 결과 저장
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = path.join(RESULTS_DIR, `${input.id}-${input.name.split(" ")[0].toLowerCase()}.json`);
  await fs.writeFile(resultFile, JSON.stringify({
    input: {
      id: input.id,
      name: input.name,
      userPrompt: (await import("./prompt.js")).buildUserPrompt(input),
    },
    output: result.parsed,
    raw: result.raw,
    error: result.error,
    usage: result.usage,
    latencyMs: result.latencyMs,
    timestamp: new Date().toISOString(),
  }, null, 2));

  // 검증
  let validation;
  if (result.parsed) {
    validation = validateFull(result.parsed, input);
  } else {
    validation = {
      tcId: input.id,
      parseSuccess: false,
      schemaValid: false,
      smartCheck: { specific: false, measurable: false, achievable: false, relevant: false, timeBound: false },
      cpiCheck: { ratioMatchesPlan: false, expectedRatio: { c: 0, p: 0, i: 0 }, actualRatio: { c: 0, p: 0, i: 0 }, deviation: 100 },
      timeBudgetCheck: { totalDailyMinutes: 0, weekdayBudget: input.profile.timeBudget.weekday, fits: false, eventsOnWeekend: false },
      toneCheck: { expectedTone: input.profile.tone, commentTone: "" },
      warningsCheck: { expectedWarnings: [], actualWarnings: [], missingWarnings: [] },
      overallPass: false,
    };
  }

  const status = validation.overallPass ? "✅ PASS" : result.error ? `❌ ERROR: ${result.error}` : "⚠️ ISSUES";
  console.log(`   ${status} (${result.latencyMs}ms, ${result.usage.totalTokens} tokens)`);

  return { input, output: result.parsed, validation, raw: result.raw, latencyMs: result.latencyMs, usage: result.usage };
}
```

---

## 11. CLI 엔트리포인트

`src/index.ts`

```typescript
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { initClient } from "./api.js";
import { loadTestCase, loadAllTestCases, runTestCase } from "./runner.js";
import { generateReport, printSummary } from "./analyzer.js";

async function main() {
  const args = process.argv.slice(2);

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("❌ DASHSCOPE_API_KEY not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  initClient();

  if (args[0] === "run" && args[1]) {
    // 단일 TC 실행: npx tsx src/index.ts run tc-1
    const input = await loadTestCase(args[1]);
    const result = await runTestCase(input);
    console.log("\n📄 Result saved to results/");
    return;
  }

  if (args[0] === "run-all") {
    // 전체 실행: npx tsx src/index.ts run-all
    const inputs = await loadAllTestCases();
    console.log(`\n🚀 Running ${inputs.length} test cases...\n`);

    const results = [];
    for (const input of inputs) {
      const result = await runTestCase(input);
      results.push(result);
      // API rate limit 대비 1초 대기
      await new Promise(r => setTimeout(r, 1000));
    }

    // 리포트 생성
    const report = generateReport(results);
    printSummary(report);

    // 리포트 저장
    const reportsDir = path.resolve(import.meta.dirname, "../reports");
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFile = path.join(
      reportsDir,
      `report-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.json`
    );
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📊 Report saved to ${reportFile}`);
    return;
  }

  if (args[0] === "prompt" && args[1]) {
    // 프롬프트 미리보기: npx tsx src/index.ts prompt tc-1
    const { buildUserPrompt } = await import("./prompt.js");
    const { SYSTEM_PROMPT } = await import("./prompt.js");
    const input = await loadTestCase(args[1]);
    console.log("=== SYSTEM PROMPT ===");
    console.log(SYSTEM_PROMPT);
    console.log("\n=== USER PROMPT ===");
    console.log(buildUserPrompt(input));
    return;
  }

  // Help
  console.log(`
📋 AddPlan Scenario AI Test

Commands:
  npx tsx src/index.ts run <tc-id>    Run single test case (e.g., tc-1)
  npx tsx src/index.ts run-all        Run all 8 test cases
  npx tsx src/index.ts prompt <tc-id> Preview prompts without API call

Examples:
  npx tsx src/index.ts run tc-1
  npx tsx src/index.ts run-all
  npx tsx src/index.ts prompt tc-3
  `);
}

main().catch(console.error);
```

---

## 12. 실행 방법

### 초기 세팅
```bash
cd /Users/flowkater/workspace/side/add-plan-scenraio-ai-test
npm install
cp .env.example .env
# .env 파일에 DASHSCOPE_API_KEY 입력
```

### 프롬프트 미리보기 (API 호출 없음)
```bash
npx tsx src/index.ts prompt tc-1
```

### 단일 TC 실행
```bash
npx tsx src/index.ts run tc-1
```

### 전체 실행 + 리포트
```bash
npx tsx src/index.ts run-all
```

### 결과 확인
```
results/tc-1-tyler.json     ← 개별 Qwen 응답 + 메타데이터
reports/report-2026-03-18-1500.json  ← 전체 분석 리포트
```

---

## 13. 결과 JSON 구조

### 개별 결과 (`results/tc-1-tyler.json`)
```json
{
  "input": {
    "id": "tc-1",
    "name": "Tyler (FR, beginner, urgent, MC)",
    "userPrompt": "Student profile:\n- Role: student (college)..."
  },
  "output": {
    "strategy": "CI-only",
    "strategyRationale": "...",
    "cpiRatio": { "c": 33, "p": 0, "i": 67 },
    "plans": [...],
    "totalDailyMinutes": 60,
    "totalEventMinutes": 0,
    "timeBudgetFit": "fits",
    "coachComment": "...",
    "warnings": [...]
  },
  "raw": "{\"strategy\":\"CI-only\"...}",
  "error": null,
  "usage": { "promptTokens": 1200, "completionTokens": 450, "totalTokens": 1650 },
  "latencyMs": 3200,
  "timestamp": "2026-03-18T14:50:00.000Z"
}
```

### 분석 리포트 (`reports/report-*.json`)
```json
{
  "runDate": "2026-03-18T14:55:00.000Z",
  "model": "qwen3.5-72b-instruct",
  "totalCases": 8,
  "passed": 6,
  "failed": 2,
  "results": [
    {
      "tcId": "tc-1",
      "parseSuccess": true,
      "schemaValid": true,
      "smartCheck": { "specific": true, "measurable": true, ... },
      "cpiCheck": { "ratioMatchesPlan": true, "deviation": 5 },
      "timeBudgetCheck": { "fits": true, "eventsOnWeekend": true },
      "overallPass": true
    }
  ],
  "summary": {
    "parseRate": "8/8",
    "schemaRate": "7/8",
    "smartRate": "6/8",
    "cpiRate": "5/8",
    "timeBudgetRate": "8/8"
  }
}
```

---

## 14. 비용 추정

| 항목 | 값 |
|---|---|
| System Prompt | ~1,200 tokens |
| User Prompt (평균) | ~300 tokens |
| 출력 (평균) | ~500 tokens |
| 호출당 총 토큰 | ~2,000 tokens |
| 8 TC 전체 | ~16,000 tokens |
| DashScope 가격 | input $0.0003/1K, output $0.0006/1K |
| **8 TC 전체 비용** | **~$0.007** (1원 미만) |

---

## 15. 검증 기준 요약

| 검증 항목 | 기준 | 자동/수동 |
|---|---|---|
| JSON 파싱 | 유효한 JSON인가? | 자동 |
| 스키마 | zod 스키마 통과? | 자동 |
| SMART-S | label에 구체적 범위(5자+)? | 자동 |
| SMART-M | dailyTarget에 숫자 포함? | 자동 |
| SMART-A | totalDailyMinutes ≤ timeBudget? | 자동 |
| SMART-R | cpiRatio sum > 0? | 자동 |
| SMART-T | "day" 또는 "/day" 언급? | 자동 |
| CPI 일치 | cpiRatio vs 실제 plan minutes 편차 ≤15%? | 자동 |
| timeBudget | daily plans ≤ weekday budget? | 자동 |
| Weekend event | 60min+ event가 weekend 배치? | 자동 |
| Tone | coachComment가 tone에 맞음? | **수동** (출력 확인) |
| Warnings | 필수 warning 트리거 존재? | 반자동 |
| 전략 적절성 | 시나리오에 맞는 전략? | **수동** |

---

## 16. TODO (프로젝트 세팅 후)

- [ ] 8개 TC input JSON 파일 생성 (`data/input/`)
- [ ] 8개 TC expected JSON 파일 생성 (`data/expected/`)
- [ ] `package.json`, `tsconfig.json` 생성
- [ ] `.env.example`, `.gitignore` 생성
- [ ] `src/` 전체 코드 파일 생성
- [ ] `npm install` + API 키 세팅
- [ ] 프롬프트 미리보기 (`prompt tc-1`) 확인
- [ ] 단일 TC 테스트 (`run tc-1`)
- [ ] 전체 실행 (`run-all`)
- [ ] 결과 분석 + 프롬프트 조정
