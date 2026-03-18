# AddPlan Scenario AI Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI test harness that calls the DashScope Qwen API with 8 study-plan scenarios and automatically validates SMART+CPI compliance of the responses.

**Architecture:** Single-pass CLI (no server, no UI). TypeScript source runs via `tsx`. Each test case is a JSON file in `data/input/`, passed to the API, and the response is validated by `validator.ts` against SMART/CPI/TimeBudget rules. Results are saved to `results/` and aggregated into a report in `reports/`.

**Tech Stack:** TypeScript 5, Node.js, tsx (no build step), openai SDK (OpenAI-compatible DashScope), zod for schema validation, dotenv for env management.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies + scripts |
| `tsconfig.json` | ESM + NodeNext module resolution (required for `import.meta.dirname`) |
| `.env.example` | API key template |
| `.gitignore` | Ignore node_modules, .env, results/, reports/ |
| `src/types.ts` | All TypeScript interfaces (TestCaseInput, QwenOutput, ValidationResult, TestReport) |
| `src/prompt.ts` | SYSTEM_PROMPT constant + buildUserPrompt() function |
| `src/api.ts` | DashScope OpenAI-compat client + callQwen() |
| `src/validator.ts` | zod schema + validateSchema/SMART/CPI/TimeBudget/Full functions |
| `src/analyzer.ts` | generateReport() + printSummary() |
| `src/runner.ts` | loadTestCase, loadAllTestCases, runTestCase |
| `src/index.ts` | CLI entry (run / run-all / prompt commands) |
| `data/input/tc-1-tyler.json` | TC-1: Urgent MC, no practice resources, first exam |
| `data/input/tc-2-emma.json` | TC-2: Working professional, normal essay |
| `data/input/tc-3-cpa-retake.json` | TC-3: Marathon problem-solving, retake |
| `data/input/tc-4-pmp-working.json` | TC-4: Normal mixed, tight weekday budget |
| `data/input/tc-5-jlpt-self.json` | TC-5: Marathon MC, self-learner |
| `data/input/tc-6-sat-hs.json` | TC-6: Normal mixed, full-exam simulation event |
| `data/input/tc-7-all-unknown.json` | TC-7: Unknown exam type, all estimated, marathon (D-30) |
| `data/input/tc-8-over-budget.json` | TC-8: Over-budget trigger scenario |
| `data/expected/tc-*.json` | Expected warnings + key validation anchors per TC |

---

## Agent Parallelization Map

The following task groups can be dispatched in parallel:

- **Group A** (no dependencies): Task 1 (scaffolding) + Task 2 (types)
- **Group B** (depends on types): Task 3 (prompt) + Task 4 (api) + Task 5 (validator) + Task 6 (analyzer) — all depend only on types.ts
- **Group C** (depends on nothing, pure data): Task 9 (TC input data) + Task 10 (expected data) — fully parallel, 8 files each
- **Group D** (depends on all src): Task 7 (runner) + Task 8 (index) — minor interdependency, can be written in parallel then integrated
- **Group E** (depends on all): Task 11 (install + verify)

**Recommended agent dispatch:**
```
ROUND 1 (parallel): Agent-Scaffolding (Task 1) + Agent-Types (Task 2) + Agent-TCData (Tasks 9+10)
ROUND 2 (parallel): Agent-Prompt (Task 3) + Agent-API (Task 4) + Agent-Validator (Task 5) + Agent-Analyzer (Task 6)
ROUND 3 (parallel): Agent-Runner (Task 7) + Agent-Index (Task 8)
ROUND 4 (sequential): Agent-Verify (Task 11)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "add-plan-scenario-ai-test",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "run-all": "tsx src/index.ts run-all",
    "prompt": "tsx src/index.ts prompt"
  },
  "dependencies": {
    "openai": "^4.77.0",
    "zod": "^3.24.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.10.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

> **Why NodeNext?** `import.meta.dirname` (used in runner.ts) requires Node16+ module resolution. NodeNext handles `.js` extension imports in ESM correctly.

- [ ] **Step 3: Create .env.example**

```
DASHSCOPE_API_KEY=sk-your-key-here
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.env
results/
reports/
dist/
*.log
```

- [ ] **Step 5: Create data directories**

```bash
mkdir -p data/input data/expected results reports
```

- [ ] **Step 6: Create README.md**

```markdown
# AddPlan Scenario AI Test

Tests Todait AddPlan Phase 3-E SMART+CPI study plan generation via Qwen API.

## Setup
```bash
npm install
cp .env.example .env
# Edit .env — add DASHSCOPE_API_KEY
```

## Commands
```bash
npx tsx src/index.ts prompt tc-1      # Preview prompt (no API call)
npx tsx src/index.ts run tc-1         # Run single test case
npx tsx src/index.ts run-all          # Run all 8 test cases + report
```

## Model
DashScope `qwen3.5-72b-instruct` via OpenAI-compatible API.
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore README.md
git commit -m "chore: project scaffolding — package.json, tsconfig, env template"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts** with all interfaces exactly as specified:

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
  parseSuccess: boolean;
  schemaValid: boolean;
  schemaErrors?: string[];
  smartCheck: {
    specific: boolean;
    measurable: boolean;
    achievable: boolean;
    relevant: boolean;
    timeBound: boolean;
  };
  cpiCheck: {
    ratioMatchesPlan: boolean;
    expectedRatio: { c: number; p: number; i: number };
    actualRatio: { c: number; p: number; i: number };
    deviation: number;
  };
  timeBudgetCheck: {
    totalDailyMinutes: number;
    weekdayBudget: number;
    fits: boolean;
    eventsOnWeekend: boolean;
  };
  toneCheck: {
    expectedTone: string;
    commentTone: string;
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
    parseRate: string;
    schemaRate: string;
    smartRate: string;
    cpiRate: string;
    timeBudgetRate: string;
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/flowkater/workspace/side/add-plan-scenraio-ai-test
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only "cannot find module" for not-yet-created files)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add core TypeScript type definitions"
```

---

## Task 3: System Prompt + User Prompt Builder

**Files:**
- Create: `src/prompt.ts`

> **Context:** The system prompt encodes the CPI ratio table, SMART rules, and output format. This is the core of the study plan logic — the AI is entirely guided by this prompt.

- [ ] **Step 1: Create src/prompt.ts**

```typescript
import type { TestCaseInput } from "./types.js";

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

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/prompt.ts
git commit -m "feat: add system prompt and user prompt builder"
```

---

## Task 4: DashScope API Client

**Files:**
- Create: `src/api.ts`

> **Context:** DashScope provides an OpenAI-compatible API. We use the `openai` npm package with a custom `baseURL`. The `response_format: { type: "json_object" }` parameter forces JSON-only output, reducing parse errors.

- [ ] **Step 1: Create src/api.ts**

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
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    let parsed: QwenOutput | null = null;
    let error: string | null = null;
    try {
      // Remove markdown fences if present (defensive)
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: add DashScope API client with OpenAI-compat wrapper"
```

---

## Task 5: Output Validator

**Files:**
- Create: `src/validator.ts`

> **Context:** The validator has two layers: (1) zod schema validation (structural), (2) business logic checks (SMART, CPI ratio match, time budget). The CPI ratio check compares the *declared* `cpiRatio` against the *actual* minute distribution across plan types — the model must be self-consistent.

- [ ] **Step 1: Create src/validator.ts**

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
  _input: TestCaseInput
): ValidationResult["cpiCheck"] {
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
    ratioMatchesPlan: deviation <= 15,
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

export function loadExpectedWarnings(expectedOutput: { warnings?: string[] } | null): string[] {
  return expectedOutput?.warnings ?? [];
}

export function validateFull(
  output: QwenOutput,
  input: TestCaseInput,
  expectedWarnings: string[] = []
): ValidationResult {
  const schema = validateSchema(output);
  const smart = validateSmart(output);
  const cpi = validateCpi(output, input);
  const time = validateTimeBudget(output, input);

  const missingWarnings = expectedWarnings.filter(
    w => !output.warnings.some(aw => aw.toLowerCase().includes(w.toLowerCase()))
  );

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
      expectedWarnings,
      actualWarnings: output.warnings,
      missingWarnings,
    },
    overallPass: schema.valid &&
      Object.values(smart).every(Boolean) &&
      cpi.ratioMatchesPlan &&
      time.fits &&
      time.eventsOnWeekend,
  };
}
```

> **Note:** The spec's `validateFull` doesn't load `expectedWarnings` — this implementation adds `expectedWarnings` as an optional parameter and wires up `missingWarnings` comparison. This completes the spec's TODO comment.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/validator.ts
git commit -m "feat: add zod schema validator and SMART/CPI/time-budget checks"
```

---

## Task 6: Result Analyzer

**Files:**
- Create: `src/analyzer.ts`

- [ ] **Step 1: Create src/analyzer.ts**

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
    if (r.warningsCheck.missingWarnings.length > 0) {
      issues.push(`missingWarnings(${r.warningsCheck.missingWarnings.length})`);
    }

    console.log(`   ${icon} ${r.tcId}: ${issues.length ? issues.join(", ") : "all pass"}`);
  }
  console.log("\n" + "=".repeat(60));
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/analyzer.ts
git commit -m "feat: add report generator and console summary printer"
```

---

## Task 7: Test Runner

**Files:**
- Create: `src/runner.ts`

> **Note:** The runner wires in `expectedWarnings` from `data/expected/` files. This upgrades the spec's original code which left `expectedWarnings: []` as a TODO.

- [ ] **Step 1: Create src/runner.ts**

```typescript
import fs from "fs/promises";
import path from "path";
import type { TestCaseInput, QwenOutput } from "./types.js";
import { callQwen } from "./api.js";
import { validateFull, loadExpectedWarnings } from "./validator.js";
import { buildUserPrompt } from "./prompt.js";

const DATA_DIR = path.resolve(import.meta.dirname, "../data");
const RESULTS_DIR = path.resolve(import.meta.dirname, "../results");

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

async function loadExpectedOutput(tcId: string): Promise<{ warnings?: string[] } | null> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "expected"));
    const file = files.find(f => f.startsWith(tcId));
    if (!file) return null;
    const data = await fs.readFile(path.join(DATA_DIR, "expected", file), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function runTestCase(input: TestCaseInput) {
  console.log(`\n🔄 Running ${input.id}: ${input.name}...`);

  const result = await callQwen(input);

  // Save result
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = path.join(RESULTS_DIR, `${input.id}-${input.name.split(" ")[0].toLowerCase()}.json`);
  await fs.writeFile(resultFile, JSON.stringify({
    input: {
      id: input.id,
      name: input.name,
      userPrompt: buildUserPrompt(input),
    },
    output: result.parsed,
    raw: result.raw,
    error: result.error,
    usage: result.usage,
    latencyMs: result.latencyMs,
    timestamp: new Date().toISOString(),
  }, null, 2));

  // Load expected output for warnings comparison
  const expectedOutput = await loadExpectedOutput(input.id);
  const expectedWarnings = loadExpectedWarnings(expectedOutput);

  // Validate
  let validation;
  if (result.parsed) {
    validation = validateFull(result.parsed, input, expectedWarnings);
  } else {
    validation = {
      tcId: input.id,
      parseSuccess: false,
      schemaValid: false,
      smartCheck: { specific: false, measurable: false, achievable: false, relevant: false, timeBound: false },
      cpiCheck: { ratioMatchesPlan: false, expectedRatio: { c: 0, p: 0, i: 0 }, actualRatio: { c: 0, p: 0, i: 0 }, deviation: 100 },
      timeBudgetCheck: { totalDailyMinutes: 0, weekdayBudget: input.profile.timeBudget.weekday, fits: false, eventsOnWeekend: false },
      toneCheck: { expectedTone: input.profile.tone, commentTone: "" },
      warningsCheck: { expectedWarnings, actualWarnings: [], missingWarnings: expectedWarnings },
      overallPass: false,
    };
  }

  const status = validation.overallPass ? "✅ PASS" : result.error ? `❌ ERROR: ${result.error}` : "⚠️ ISSUES";
  console.log(`   ${status} (${result.latencyMs}ms, ${result.usage.totalTokens} tokens)`);

  return { input, output: result.parsed, validation, raw: result.raw, latencyMs: result.latencyMs, usage: result.usage };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/runner.ts
git commit -m "feat: add test runner with expected-warnings wiring"
```

---

## Task 8: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

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
    // Single TC: npx tsx src/index.ts run tc-1
    const input = await loadTestCase(args[1]);
    await runTestCase(input);
    console.log("\n📄 Result saved to results/");
    return;
  }

  if (args[0] === "run-all") {
    // All TCs: npx tsx src/index.ts run-all
    const inputs = await loadAllTestCases();
    console.log(`\n🚀 Running ${inputs.length} test cases...\n`);

    const results = [];
    for (const input of inputs) {
      const result = await runTestCase(input);
      results.push(result);
      await new Promise(r => setTimeout(r, 1000));  // rate limit buffer
    }

    const report = generateReport(results);
    printSummary(report);

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
    // Prompt preview: npx tsx src/index.ts prompt tc-1
    const { buildUserPrompt, SYSTEM_PROMPT } = await import("./prompt.js");
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

- [ ] **Step 2: Full TypeScript check (all src files)**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with run/run-all/prompt commands"
```

---

## Task 9: Test Case Input Data (8 files)

**Files:**
- Create: `data/input/tc-1-tyler.json` through `data/input/tc-8-over-budget.json`

> **Agent note:** All 8 files are fully independent. Dispatch them in parallel. Each TC is designed to trigger specific validation paths.

### TC-1: Tyler — Urgent MC, no practice, first exam

**Key properties:** `urgent`, `multipleChoice`, no `practice` resource → P=0 redistribution, `firstTime: true`

- [ ] **Create `data/input/tc-1-tyler.json`**

```json
{
  "id": "tc-1",
  "name": "Tyler (FR, beginner, urgent, MC)",
  "description": "College freshman taking French final. 5 days left. No practice resources — only textbook + study guide. First exam ever.",
  "profile": {
    "role": "student",
    "studentLevel": "college",
    "collegeType": "undergrad",
    "year": "freshman",
    "readSpeed": "slow",
    "level": "beginner",
    "tone": "encouraging",
    "focusSpan": 25,
    "timeBudget": { "weekday": 90, "weekend": 120 },
    "firstTime": true
  },
  "exam": {
    "subject": "French Language (FR101)",
    "examDate": "D-5",
    "daysLeft": 5,
    "examType": "multipleChoice",
    "ddayBucket": "urgent"
  },
  "resources": [
    { "type": "textbook", "description": "French textbook Ch.1-8", "quantity": "300p" },
    { "type": "studyGuide", "description": "Vocab and grammar summary sheet", "quantity": "30p" }
  ],
  "examScope": {
    "description": "Ch.1-6 vocabulary and basic grammar",
    "isEstimated": false
  },
  "currentState": {
    "description": "Read through Ch.1-5, skimmed Ch.6",
    "progressPercent": 70,
    "isEstimated": false
  }
}
```

### TC-2: Emma — Working professional, normal, essay

**Key properties:** `normal`, `essay`, no `practice` resource → P=0 redistribution, tight weekday budget (60min)

- [ ] **Create `data/input/tc-2-emma.json`**

```json
{
  "id": "tc-2",
  "name": "Emma (working, capable, normal, essay)",
  "description": "Working professional pursuing business writing certification. 18 days left. Limited weekday time.",
  "profile": {
    "role": "working",
    "readSpeed": "medium",
    "level": "capable",
    "tone": "guiding",
    "focusSpan": 45,
    "timeBudget": { "weekday": 60, "weekend": 180 }
  },
  "exam": {
    "subject": "Business Writing Certification",
    "examDate": "D-18",
    "daysLeft": 18,
    "examType": "essay",
    "ddayBucket": "normal"
  },
  "resources": [
    { "type": "textbook", "description": "Business Writing Handbook", "quantity": "200p" },
    { "type": "studyGuide", "description": "Key concepts and templates summary", "quantity": "50p" }
  ],
  "examScope": {
    "description": "5 modules: writing clarity, structure, tone, editing, professional formats",
    "isEstimated": false
  },
  "currentState": {
    "description": "Completed modules 1-2, halfway through module 3",
    "progressPercent": 50,
    "isEstimated": false
  }
}
```

### TC-3: CPA Retake — Marathon, problem-solving, retake

**Key properties:** `marathon`, `problemSolving`, `isRetake: true`, `retakeIssue` set, has `practice` resources

- [ ] **Create `data/input/tc-3-cpa-retake.json`**

```json
{
  "id": "tc-3",
  "name": "CPA Retake (examPrep, confident, marathon, PS)",
  "description": "Exam prep student retaking CPA FAR. Failed due to insufficient practice. 45 days left with heavy resources.",
  "profile": {
    "role": "examPrep",
    "readSpeed": "fast",
    "level": "confident",
    "tone": "optimizing",
    "focusSpan": 60,
    "timeBudget": { "weekday": 120, "weekend": 240 },
    "isRetake": true,
    "examPrepDuration": "sixPlus"
  },
  "exam": {
    "subject": "CPA Exam — FAR Section",
    "examDate": "D-45",
    "daysLeft": 45,
    "examType": "problemSolving",
    "ddayBucket": "marathon"
  },
  "resources": [
    { "type": "textbook", "description": "Becker CPA Review FAR", "quantity": "500p" },
    { "type": "practice", "description": "Becker MCQs and Task-Based Simulations", "quantity": "200 problems" },
    { "type": "studyGuide", "description": "FAR quick review notes", "quantity": "80p" }
  ],
  "examScope": {
    "description": "5 FAR content areas: Governmental, Not-for-profit, Conceptual Framework, Financial Statements, Transactions",
    "isEstimated": false
  },
  "currentState": {
    "description": "Covered all material once, weak on practice and simulations",
    "progressPercent": 80,
    "isEstimated": false,
    "retakeIssue": "Not enough practice — scored low on Task-Based Simulations"
  }
}
```

### TC-4: PMP Working — Normal, mixed, tight weekday

**Key properties:** `normal`, `mixed`, weekday only 45min, has both `studyGuide` and `practice`

- [ ] **Create `data/input/tc-4-pmp-working.json`**

```json
{
  "id": "tc-4",
  "name": "PMP Working (working, capable, normal, mixed)",
  "description": "Working professional with very limited weekday time preparing for PMP. 22 days left.",
  "profile": {
    "role": "working",
    "readSpeed": "medium",
    "level": "capable",
    "tone": "neutral",
    "focusSpan": 30,
    "timeBudget": { "weekday": 45, "weekend": 120 }
  },
  "exam": {
    "subject": "PMP Certification",
    "examDate": "D-22",
    "daysLeft": 22,
    "examType": "mixed",
    "ddayBucket": "normal"
  },
  "resources": [
    { "type": "studyGuide", "description": "PMBOK Guide 7th edition domain summaries", "quantity": "5 domains" },
    { "type": "practice", "description": "PMP practice question bank", "quantity": "200 questions" }
  ],
  "examScope": {
    "description": "8 performance domains: Stakeholders, Team, Dev Approach, Planning, Project Work, Delivery, Measurement, Uncertainty",
    "isEstimated": false
  },
  "currentState": {
    "description": "Reviewed 3 of 8 domains, practice questions not started",
    "progressPercent": 60,
    "isEstimated": false
  }
}
```

### TC-5: JLPT Self — Marathon, MC, self-learner

**Key properties:** `marathon`, `multipleChoice`, `self` role, `selfLearnerGoal: specific`, uses app resource

- [ ] **Create `data/input/tc-5-jlpt-self.json`**

```json
{
  "id": "tc-5",
  "name": "JLPT N3 Self (self, capable, marathon, MC)",
  "description": "Self-learner aiming to pass JLPT N3. 60 days out. Uses textbook + Anki app.",
  "profile": {
    "role": "self",
    "readSpeed": "medium",
    "level": "capable",
    "tone": "encouraging",
    "focusSpan": 45,
    "timeBudget": { "weekday": 60, "weekend": 180 },
    "selfLearnerGoal": "specific"
  },
  "exam": {
    "subject": "JLPT N3",
    "examDate": "D-60",
    "daysLeft": 60,
    "examType": "multipleChoice",
    "ddayBucket": "marathon"
  },
  "resources": [
    { "type": "textbook", "description": "Nihongo Sou Matome N3 Grammar and Vocabulary", "quantity": "300p" },
    { "type": "app", "description": "Anki flashcards and JLPT Sensei practice quizzes", "quantity": "500 flashcards" }
  ],
  "examScope": {
    "description": "Vocabulary (~3700 words), Grammar (N3 patterns), Reading comprehension, Listening",
    "isEstimated": false
  },
  "currentState": {
    "description": "About 40% through vocabulary section, started grammar basics",
    "progressPercent": 40,
    "isEstimated": true
  }
}
```

### TC-6: SAT HS — Normal, mixed, full exam simulation event

**Key properties:** `normal`, `mixed`, `highschool`, has full practice tests → expect weekend `event` plan for full simulation

- [ ] **Create `data/input/tc-6-sat-hs.json`**

```json
{
  "id": "tc-6",
  "name": "SAT HS (student, hs, beginner, normal, mixed)",
  "description": "High school junior taking SAT for first time. 21 days left. Has full practice tests that must be scheduled on weekends.",
  "profile": {
    "role": "student",
    "studentLevel": "highschool",
    "readSpeed": "medium",
    "level": "beginner",
    "tone": "encouraging",
    "focusSpan": 35,
    "timeBudget": { "weekday": 90, "weekend": 240 },
    "firstTime": true
  },
  "exam": {
    "subject": "SAT (Math + Reading/Writing)",
    "examDate": "D-21",
    "daysLeft": 21,
    "examType": "mixed",
    "ddayBucket": "normal"
  },
  "resources": [
    { "type": "studyGuide", "description": "College Board Official SAT Study Guide", "quantity": "400p" },
    { "type": "practice", "description": "College Board full practice tests", "quantity": "5 tests" }
  ],
  "examScope": {
    "description": "Reading/Writing modules 1-2 and Math modules 1-2, full digital SAT format",
    "isEstimated": false
  },
  "currentState": {
    "description": "Completed one diagnostic test, reviewed basic math and reading concepts",
    "progressPercent": 20,
    "isEstimated": false
  }
}
```

### TC-7: All Unknown — Unknown type, all estimated

**Key properties:** `examType: unknown` → use Mixed ratios, all `isEstimated: true`, minimal resources

- [ ] **Create `data/input/tc-7-all-unknown.json`**

```json
{
  "id": "tc-7",
  "name": "All Unknown (self, beginner, exploring)",
  "description": "Self-learner with minimal info. Exam type unknown, all details estimated. CompTIA A+ exploration.",
  "profile": {
    "role": "self",
    "readSpeed": "medium",
    "level": "beginner",
    "tone": "neutral",
    "focusSpan": 30,
    "timeBudget": { "weekday": 60, "weekend": 120 },
    "selfLearnerGoal": "exploring"
  },
  "exam": {
    "subject": "CompTIA A+ Certification",
    "examDate": "D-30",
    "daysLeft": 30,
    "examType": "unknown",
    "ddayBucket": "marathon"
  },
  "resources": [
    {
      "type": "other",
      "description": "Various online tutorials and YouTube videos",
      "quantity": "~10 hours",
      "isEstimated": true
    }
  ],
  "examScope": {
    "description": "Core 1 and Core 2 objectives: hardware, networking, OS, security, troubleshooting",
    "isEstimated": true
  },
  "currentState": {
    "description": "Watched some intro videos, unclear on current progress",
    "progressPercent": 15,
    "isEstimated": true
  }
}
```

### TC-8: Over Budget — Trigger timeBudgetFit "over" warning

**Key properties:** `normal`, `problemSolving`, weekday budget only 45min, huge scope → AI will likely generate "over" or "tight", triggering the budget warning

- [ ] **Create `data/input/tc-8-over-budget.json`**

```json
{
  "id": "tc-8",
  "name": "Over Budget (student, beginner, tight, normal)",
  "description": "College student with very limited time (45min/day) trying to cover massive Calculus II scope in 10 days. Designed to trigger over-budget warning.",
  "profile": {
    "role": "student",
    "studentLevel": "college",
    "collegeType": "undergrad",
    "readSpeed": "slow",
    "level": "beginner",
    "tone": "encouraging",
    "focusSpan": 25,
    "timeBudget": { "weekday": 45, "weekend": 90 }
  },
  "exam": {
    "subject": "Calculus II Final Exam",
    "examDate": "D-10",
    "daysLeft": 10,
    "examType": "problemSolving",
    "ddayBucket": "normal"
  },
  "resources": [
    { "type": "textbook", "description": "Stewart Calculus Ch.7-12", "quantity": "400p" },
    { "type": "practice", "description": "Problem sets and past final exams", "quantity": "300 problems" }
  ],
  "examScope": {
    "description": "Integration techniques, infinite series and sequences, polar coordinates",
    "isEstimated": false
  },
  "currentState": {
    "description": "Barely started — only covered basic integration review",
    "progressPercent": 10,
    "isEstimated": false
  }
}
```

- [ ] **Commit all TC input data**

```bash
git add data/input/
git commit -m "feat: add 8 test case input JSON files"
```

---

## Task 10: Expected Output Data (8 files)

**Files:**
- Create: `data/expected/tc-1-tyler.json` through `data/expected/tc-8-over-budget.json`

> **Purpose:** These files define the `expectedWarnings` for each TC, used by `validator.ts` to check whether the model triggers the right warning conditions. They also serve as manual review anchors.

> **Agent note:** All 8 files are independent — dispatch in parallel.

- [ ] **Create `data/expected/tc-1-tyler.json`** (urgent MC, no practice)

```json
{
  "tcId": "tc-1",
  "notes": "No practice resources → should have P=0 in cpiRatio. Urgent MC: expected CI plan. No practice warning expected.",
  "warnings": ["No practice"],
  "expectedCpiApprox": { "c": 20, "p": 0, "i": 80 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-2-emma.json`** (normal essay, no practice)

```json
{
  "tcId": "tc-2",
  "notes": "No practice resources → P=0. Normal essay: CI-heavy. Weekday budget 60min must hold.",
  "warnings": ["No practice"],
  "expectedCpiApprox": { "c": 50, "p": 0, "i": 50 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-3-cpa-retake.json`** (marathon PS, retake)

```json
{
  "tcId": "tc-3",
  "notes": "Marathon problem-solving retake. High P expected. Optimizing tone in coachComment.",
  "warnings": [],
  "expectedCpiApprox": { "c": 20, "p": 50, "i": 30 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-4-pmp-working.json`** (normal mixed, tight weekday)

```json
{
  "tcId": "tc-4",
  "notes": "Normal mixed. Weekday budget 45min — should fit or be tight. No textbook (study guide only) → C time reduced.",
  "warnings": [],
  "expectedCpiApprox": { "c": 25, "p": 45, "i": 30 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-5-jlpt-self.json`** (marathon MC, self-learner)

```json
{
  "tcId": "tc-5",
  "notes": "Marathon MC. App = practice resource. C30 P40 I30 expected. Encouraging tone.",
  "warnings": [],
  "expectedCpiApprox": { "c": 30, "p": 40, "i": 30 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-6-sat-hs.json`** (normal mixed, full exam event)

```json
{
  "tcId": "tc-6",
  "notes": "Normal mixed. Full SAT practice tests (3hr each) must be weekend events. Validator checks eventsOnWeekend.",
  "warnings": [],
  "expectedCpiApprox": { "c": 25, "p": 45, "i": 30 },
  "expectedTimeBudgetFit": "fits",
  "expectedWeekendEvent": true
}
```

- [ ] **Create `data/expected/tc-7-all-unknown.json`** (unknown type, estimated)

```json
{
  "tcId": "tc-7",
  "notes": "Unknown exam type → Mixed ratios used. All estimates → model should show some flexibility. Neutral tone.",
  "warnings": [],
  "expectedCpiApprox": { "c": 25, "p": 45, "i": 30 },
  "expectedTimeBudgetFit": "fits"
}
```

- [ ] **Create `data/expected/tc-8-over-budget.json`** (over budget trigger)

```json
{
  "tcId": "tc-8",
  "notes": "Designed to trigger over/tight budget. 45min weekday with massive scope. Over-budget warning expected.",
  "warnings": ["exceeds daily budget", "reduce scope"],
  "expectedCpiApprox": { "c": 15, "p": 60, "i": 25 },
  "expectedTimeBudgetFit": "over"
}
```

- [ ] **Commit expected data**

```bash
git add data/expected/
git commit -m "feat: add expected output anchors with warning criteria for all 8 TCs"
```

---

## Task 11: Install Dependencies + End-to-End Verification

> **This task runs after all source files and data are in place.**

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/flowkater/workspace/side/add-plan-scenraio-ai-test
npm install
```

Expected: `node_modules/` created, no peer dependency errors.

- [ ] **Step 2: Full TypeScript compile check**

```bash
npx tsc --noEmit 2>&1
```

Expected: **zero errors**. If errors appear, fix them before proceeding.

- [ ] **Step 3: Verify prompt preview for TC-1 (no API call)**

```bash
npx tsx src/index.ts prompt tc-1
```

Expected output contains:
- `=== SYSTEM PROMPT ===` section with full prompt
- `=== USER PROMPT ===` section starting with `Student profile:`
- `Role: student (college), freshman`
- `Exam date: D-5 (5 days left)`
- `Note: First exam ever for this student.`

- [ ] **Step 4: Verify prompt preview for TC-8 (over-budget scenario)**

```bash
npx tsx src/index.ts prompt tc-8
```

Expected: Shows 45min weekday budget and 400p textbook + 300 problems.

- [ ] **Step 5: Set up .env with API key**

```bash
cp .env.example .env
# Manually edit .env to add DASHSCOPE_API_KEY=sk-xxxxx
```

- [ ] **Step 6: Run single TC test (TC-1)**

```bash
npx tsx src/index.ts run tc-1
```

Expected:
- `🔄 Running tc-1: Tyler...`
- `✅ PASS` or `⚠️ ISSUES` (not `❌ ERROR`)
- Result file created at `results/tc-1-tyler.json`

- [ ] **Step 7: Inspect TC-1 result**

```bash
cat results/tc-1-tyler.json | head -60
```

Verify:
- `output.cpiRatio.p` is 0 (no practice resources)
- `output.timeBudgetFit` is "fits" or "tight" (not "over")
- `output.plans` has at least 2 plans

- [ ] **Step 8: Run TC-8 (over-budget check)**

```bash
npx tsx src/index.ts run tc-8
```

Expected: Result shows `timeBudgetFit: "over"` or `"tight"`, and `warnings` includes budget-related message.

- [ ] **Step 9: Run all TCs**

```bash
npx tsx src/index.ts run-all
```

Expected:
- 8 TCs processed sequentially
- Report printed to console
- `reports/report-*.json` created

- [ ] **Step 10: Final commit**

```bash
git add results/ reports/ 2>/dev/null; git status
git add -N results/ reports/ 2>/dev/null  # track but don't stage (gitignored)
git commit -m "chore: verified end-to-end — all 8 TCs passing prompt preview and API validation"
```

---

## Validation Criteria Summary

| Check | What We're Testing | TC Targets |
|-------|-------------------|------------|
| JSON Parse | Model outputs valid JSON | All 8 |
| zod Schema | All required fields present | All 8 |
| SMART-S | `label.length > 5`, `scope.length > 3` | All 8 |
| SMART-M | `dailyTarget` contains a digit | All 8 |
| SMART-A | `timeBudgetFit !== "over"` | TC-1..7 |
| SMART-R | `cpiRatio sum > 0` | All 8 |
| SMART-T | `dailyTarget` contains "day" or "/day" | All 8 |
| CPI Match | Declared ratio vs actual minutes ≤15% deviation | All 8 |
| TimeBudget | `totalDailyMinutes ≤ weekdayBudget` | TC-1..7 |
| Weekend Event | 60min+ events use weekend scheduling | TC-6 |
| Expected Warnings | Budget/practice warnings present | TC-1,2,8 |

---

## Known Gaps / Post-Run Improvements

1. **`expectedWarnings` fuzzy match** — Current implementation does `includes(toLowerCase)`. If model wording diverges significantly, adjust the keyword strings in `data/expected/tc-*.json`.
2. **CPI deviation tolerance** — 15% may be too tight for models that round differently. Adjust `deviation <= 15` in `validator.ts` if needed.
3. **Rate limiting** — 1s delay between TCs is conservative. Adjust in `index.ts` if DashScope allows higher throughput.
4. **Model ID** — Spec uses `qwen3.5-72b-instruct`. Verify availability in DashScope international endpoint; fallback to `qwen3.5-flash` if needed.
