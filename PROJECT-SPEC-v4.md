# AI Coach 42 TC v4 — 구현 명세서

> **목적**: Todait AI Coach의 42개 테스트 케이스를 Qwen API로 실행하여 **42/42 전부 통과**할 때까지 프롬프트를 반복 개선한다.
> **범위**: 기존 v3 코드를 v4 스키마로 전면 업그레이드. CLI 실행. UI 없음.
> **언어**: TypeScript + Node.js (tsx 실행)
> **API**: DashScope (Alibaba Cloud) — `qwen3.5-72b-instruct`
> **성공 조건**: `run-all` 실행 시 42/42 PASS

---

## 0. 핵심 원칙 — 읽고 시작하라

**반드시 먼저 읽어야 할 파일들:**
1. `docs/AI-Coach-42-Test-Cases-v4.md` — TC v4 원본 (3,736줄). 이 파일이 **진실의 원천**
2. `src/types.ts` — v4 타입 정의 (이미 작성됨)
3. `src/prompt.ts` — v4 시스템 프롬프트 + 유저 프롬프트 빌더 (이미 작성됨)
4. `data/input/tc-01-*.json` ~ `tc-42-*.json` — 42개 입력 (이미 작성됨)
5. `data/expected/tc-01-*.json` ~ `tc-42-*.json` — 42개 기대값 (이미 작성됨)

**이미 있는 것**: types.ts, prompt.ts, 42개 input JSON, 42개 expected JSON, README, CLAUDE.md
**너가 만들어야 하는 것**: validator.ts, analyzer.ts, runner.ts, index.ts 를 v4로 재작성 + 무한 반복 루프

---

## 1. 프로젝트 구조

```
scenario-qwen-test/
├── .env                          # DASHSCOPE_API_KEY
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── CLAUDE.md
├── PROJECT-SPEC-v4.md            # ← 이 파일
│
├── docs/
│   └── AI-Coach-42-Test-Cases-v4.md  # TC 원본 (참조용)
│
├── src/
│   ├── types.ts                  # ✅ 이미 작성됨 (v4 스키마)
│   ├── prompt.ts                 # ✅ 이미 작성됨 (v4 프롬프트)
│   ├── api.ts                    # 🔨 DashScope API 호출 (업데이트)
│   ├── validator.ts              # 🔨 v4 검증기 (전면 재작성)
│   ├── analyzer.ts               # 🔨 v4 분석기 (전면 재작성)
│   ├── runner.ts                 # 🔨 v4 러너 (전면 재작성)
│   └── index.ts                  # 🔨 CLI + 무한 반복 모드
│
├── data/
│   ├── input/                    # ✅ 42개 TC 입력 JSON
│   └── expected/                 # ✅ 42개 TC 기대값 JSON
│
├── results/                      # (실행 시 자동 생성)
└── reports/                      # (실행 시 자동 생성)
```

---

## 2. 의존성

```json
{
  "name": "scenario-qwen-test",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "run-all": "tsx src/index.ts run-all",
    "run-one": "tsx src/index.ts run",
    "iterate": "tsx src/index.ts iterate",
    "prompt": "tsx src/index.ts prompt"
  },
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

---

## 3. API 호출 — `src/api.ts`

```typescript
import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import type { TestCaseInput } from "./types.js";

let client: OpenAI;

export function initClient() {
  client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
}

export async function callAICoach(input: TestCaseInput): Promise<{
  raw: string;
  parsed: any | null;
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
      max_tokens: 4000,   // v4는 출력이 더 길어짐
      response_format: { type: "json_object" },
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    let parsed: any = null;
    let error: string | null = null;
    try {
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

## 4. 검증기 — `src/validator.ts` (v4 전면 재작성)

### 검증 체크리스트 (우선순위 순서)

v4 검증은 **6단계**로 수행. 앞 단계 실패 시 뒷 단계는 skip 가능.

```
Level 0: JSON 파싱 성공?
Level 1: 스키마 검증 (zod) — 필수 필드 존재?
Level 2: Hard Fail Gates (HFG 1-4) — 하나라도 위반 시 즉시 FAIL
Level 3: 시간 정직성 — timeFit 일치? effortModel 범위 내?
Level 4: 전략 차별화 — 기대 전략 키워드 포함?
Level 5: 감정 프로토콜 — 올바른 감정 상태 감지?
```

### 핵심 검증 로직

#### Level 0-1: 파싱 + 스키마
```typescript
// zod 스키마 — v4 출력 형식
const AICoachOutputSchema = z.object({
  emotionProtocol: z.enum(["neutral", "panic", "shame", "frustration", "burnout"]).optional(),
  questionsToAsk: z.array(z.object({
    question: z.string(),
    decisionImpact: z.string(),
  })).optional(),
  strategy: z.string().min(1),
  strategyRationale: z.string().min(1),
  plans: z.array(z.object({
    type: z.string(),
    label: z.string().min(1),
    scope: z.string().optional(),
    weekdayTarget: z.number().optional(),
    weekendTarget: z.number().optional(),
    effortModel: z.object({
      type: z.string(),
      expected: z.number(),
      min: z.number(),
      max: z.number(),
      unit: z.string().optional(),
    }).optional(),
    estimatedDailyMinutes: z.number().optional(),
    priority: z.enum(["primary", "secondary", "optional"]),
    phase: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    missingInfo: z.array(z.string()).optional(),
  })).min(1),
  totalDailyMinutes: z.number().min(0),
  timeFit: z.enum(["fits", "tight", "deficit", "impossible"]),
  alternatives: z.array(z.any()).optional(),
  coachComment: z.string().min(1),
  warnings: z.array(z.string()),
  globalBudget: z.any().optional(),
});
```

#### Level 2: Hard Fail Gates 검증
```typescript
function checkHardFailGates(
  output: any,
  input: TestCaseInput,
  expected: TestCaseExpected
): { passed: boolean; failedGates: string[] } {
  const failures: string[] = [];

  // HFG-1: False Plan — min/unit이 비현실적으로 낮은가?
  if (expected.hardFailChecks.includes("HFG-1")) {
    // timeFit이 deficit/impossible이어야 하는데 fits/tight로 보고했는가?
    if (expected.expectedTimeFit === "deficit" || expected.expectedTimeFit === "impossible") {
      if (output.timeFit === "fits") {
        failures.push("HFG-1: False Plan — reported 'fits' when deficit/impossible expected");
      }
    }
    // effortModel.expected가 마스터 테이블 P25보다 낮은가?
    if (expected.effortModel && output.plans?.[0]?.effortModel) {
      const actual = output.plans[0].effortModel.expected;
      const minAllowed = expected.effortModel.min; // P25
      if (actual < minAllowed * 0.8) { // 20% 허용 오차
        failures.push(`HFG-1: False Plan — effortModel.expected ${actual} < P25 ${minAllowed}`);
      }
    }
  }

  // HFG-2: Redundant Question
  if (expected.hardFailChecks.includes("HFG-2")) {
    if (output.questionsToAsk) {
      // 이미 input에 있는 정보를 다시 묻는지 체크
      // (키워드 매칭 — 완벽하진 않지만 자동화 가능한 수준)
      const inputText = JSON.stringify(input).toLowerCase();
      for (const q of output.questionsToAsk) {
        const questionWords = q.question.toLowerCase().split(/\s+/);
        // 핵심 정보 키워드가 input에 이미 있는데 다시 물으면 의심
        // → 이건 수동 검토 플래그로만 사용
      }
    }
  }

  // HFG-3: Profile Stereotyping
  // 자동 검증 어려움 → 플래그만 설정
  
  // HFG-4: Hidden Assumptions
  if (expected.hardFailChecks.includes("HFG-4")) {
    if (!output.plans?.some((p: any) => p.assumptions && p.assumptions.length > 0)) {
      // 추정값이 있을 텐데 assumptions가 비어있으면 의심
      failures.push("HFG-4: No assumptions declared — likely hidden assumptions");
    }
  }

  return { passed: failures.length === 0, failedGates: failures };
}
```

#### Level 3: 시간 정직성
```typescript
function checkTimeFit(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; detail: string } {
  const actualFit = output.timeFit;
  const expectedFit = expected.expectedTimeFit;
  
  // 정확히 일치하면 PASS
  if (actualFit === expectedFit) return { passed: true, detail: "exact match" };
  
  // deficit → impossible은 더 엄격하므로 OK
  if (expectedFit === "deficit" && actualFit === "impossible") 
    return { passed: true, detail: "stricter than expected — OK" };
  
  // fits → tight은 소폭 차이이므로 OK
  if (expectedFit === "fits" && actualFit === "tight") 
    return { passed: true, detail: "slightly tighter — OK" };

  return { passed: false, detail: `expected ${expectedFit}, got ${actualFit}` };
}
```

#### Level 4: 전략 키워드 매칭
```typescript
function checkStrategy(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; matched: string[]; missing: string[] } {
  if (!expected.expectedStrategy || expected.expectedStrategy.length === 0) {
    return { passed: true, matched: [], missing: [] };
  }
  
  const outputText = JSON.stringify(output).toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];
  
  for (const keyword of expected.expectedStrategy) {
    // 키워드를 쪼개서 핵심 단어만 매칭 (유연하게)
    const words = keyword.toLowerCase().split(/[\s/]+/).filter(w => w.length > 2);
    const found = words.some(w => outputText.includes(w));
    if (found) matched.push(keyword);
    else missing.push(keyword);
  }
  
  // 50% 이상 매칭되면 PASS (전략 표현 방식이 다를 수 있으므로)
  const ratio = matched.length / expected.expectedStrategy.length;
  return { passed: ratio >= 0.5, matched, missing };
}
```

#### Level 5: 감정 프로토콜
```typescript
function checkEmotionProtocol(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; detail: string } {
  if (!output.emotionProtocol) {
    // neutral은 생략 가능
    if (expected.emotionProtocol === "neutral") 
      return { passed: true, detail: "neutral (omitted = OK)" };
    return { passed: false, detail: `missing emotionProtocol, expected ${expected.emotionProtocol}` };
  }
  
  return {
    passed: output.emotionProtocol === expected.emotionProtocol,
    detail: output.emotionProtocol === expected.emotionProtocol
      ? "match"
      : `expected ${expected.emotionProtocol}, got ${output.emotionProtocol}`,
  };
}
```

#### EffortModel 범위 검증
```typescript
function checkEffortModel(
  output: any,
  expected: TestCaseExpected
): { passed: boolean; detail: string } {
  if (!expected.effortModel) return { passed: true, detail: "no effortModel check needed" };
  
  // 첫 번째 primary plan의 effortModel 확인
  const primaryPlan = output.plans?.find((p: any) => p.priority === "primary");
  if (!primaryPlan?.effortModel) {
    return { passed: false, detail: "primary plan missing effortModel" };
  }
  
  const actual = primaryPlan.effortModel.expected;
  const expectedP50 = expected.effortModel.expected;
  const p25 = expected.effortModel.min;
  const p75 = expected.effortModel.max;
  
  // P25-P75 범위 내이면 PASS, 범위 밖이어도 30% 이내면 PASS
  const inRange = actual >= p25 && actual <= p75;
  const closeEnough = actual >= p25 * 0.7 && actual <= p75 * 1.3;
  
  return {
    passed: inRange || closeEnough,
    detail: inRange
      ? `${actual} in [${p25}-${p75}] ✓`
      : closeEnough
        ? `${actual} near [${p25}-${p75}] (within 30%)`
        : `${actual} outside [${p25}-${p75}] ✗`,
  };
}
```

### 종합 검증 함수
```typescript
export function validateV4(
  output: any,
  input: TestCaseInput,
  expected: TestCaseExpected
): ValidationResult {
  // Level 0: Parse — 이미 호출 측에서 체크
  
  // Level 1: Schema
  const schema = AICoachOutputSchema.safeParse(output);
  
  // Level 2: Hard Fail Gates
  const hfg = checkHardFailGates(output, input, expected);
  
  // Level 3: TimeFit + EffortModel
  const timeFit = checkTimeFit(output, expected);
  const effort = checkEffortModel(output, expected);
  
  // Level 4: Strategy
  const strategy = checkStrategy(output, expected);
  
  // Level 5: Emotion Protocol
  const emotion = checkEmotionProtocol(output, expected);
  
  // Overall
  const overallPass = schema.success && hfg.passed && timeFit.passed && effort.passed && strategy.passed && emotion.passed;
  
  return {
    tcId: input.id,
    parseSuccess: true,
    schemaValid: schema.success,
    schemaErrors: schema.success ? undefined : schema.error.errors.map(e => `${e.path.join(".")}: ${e.message}`),
    hardFailCheck: { rules: expected.hardFailChecks, passed: hfg.passed, failedRules: hfg.failedGates },
    timeFitCheck: { expected: expected.expectedTimeFit, actual: output.timeFit, matches: timeFit.passed },
    effortModelCheck: effort.passed ? { expected: expected.effortModel?.expected ?? 0, actual: 0, withinRange: true, deviation: 0 } : undefined,
    emotionProtocolCheck: { expected: expected.emotionProtocol, actual: output.emotionProtocol ?? "neutral", matches: emotion.passed },
    // ... 나머지 필드는 types.ts의 ValidationResult 참조
    overallPass,
  };
}
```

---

## 5. CLI 엔트리포인트 — `src/index.ts`

### 핵심: `iterate` 모드

```
npx tsx src/index.ts iterate [--max-rounds 10] [--target 42]
```

**무한 반복 루프:**

```
Round 1:
  1. run-all (42개 TC 실행)
  2. 결과 분석 → 실패 TC 목록 추출
  3. 실패 원인 분류:
     - parse_fail: JSON 파싱 실패
     - schema_fail: 스키마 불일치
     - hfg_fail: Hard Fail Gate 위반
     - timefit_fail: timeFit 불일치
     - effort_fail: effortModel 범위 밖
     - strategy_fail: 전략 키워드 미스
     - emotion_fail: 감정 프로토콜 불일치
  4. 실패 원인별 패턴 분석
  5. prompt.ts의 SYSTEM_PROMPT 자동 패치:
     - 가장 많이 실패한 원인에 해당하는 규칙 강화
     - 구체적 예시 추가
     - 반복 실패 TC는 few-shot example로 추가
  6. 리포트 저장: reports/round-{N}-{timestamp}.json

Round 2:
  실패한 TC만 재실행 (전부 다시 돌리지 않음)
  → 새로 통과한 TC 기록
  → 여전히 실패하면 Round 3

종료 조건:
  - 42/42 PASS → 🎉 성공! 최종 prompt.ts 저장
  - max-rounds 도달 → 현재 상태 리포트 + 프롬프트 diff 출력
  - 3라운드 연속 개선 없음 → 조기 종료 + 수동 개입 필요 알림
```

### iterate 모드 구현 핵심

```typescript
async function iterateMode(maxRounds: number, targetPass: number) {
  let round = 0;
  let failedTcIds: string[] = []; // 처음엔 전체 42개
  let noImprovementCount = 0;
  let bestScore = 0;
  
  // Round 0: 전체 실행
  const allInputs = await loadAllTestCases();
  const allExpected = await loadAllExpected();
  
  while (round < maxRounds) {
    round++;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🔄 ROUND ${round} / ${maxRounds}`);
    console.log(`${"═".repeat(60)}\n`);
    
    // 실행 대상 결정
    const targets = round === 1
      ? allInputs  // 첫 라운드는 전체
      : allInputs.filter(i => failedTcIds.includes(i.id)); // 이후는 실패분만
    
    console.log(`Running ${targets.length} TCs...`);
    
    // 실행
    const results = [];
    for (const input of targets) {
      const expected = allExpected.find(e => e.tcId === input.id)!;
      const result = await runAndValidate(input, expected);
      results.push(result);
      await sleep(1000); // rate limit
    }
    
    // 결과 집계
    const passed = results.filter(r => r.validation.overallPass).length;
    const failed = results.filter(r => !r.validation.overallPass);
    const totalPassed = allInputs.length - failedTcIds.length + passed; // 이전 통과분 + 이번 통과분
    
    console.log(`\n📊 Round ${round} Result: ${totalPassed}/${allInputs.length} PASS`);
    
    // 성공!
    if (totalPassed >= targetPass) {
      console.log(`\n🎉 SUCCESS! ${totalPassed}/${allInputs.length} passed!`);
      await saveReport(round, results, "SUCCESS");
      return;
    }
    
    // 개선 여부 체크
    if (totalPassed <= bestScore) {
      noImprovementCount++;
      if (noImprovementCount >= 3) {
        console.log(`\n⚠️ No improvement for 3 rounds. Stopping.`);
        await saveReport(round, results, "STALLED");
        printFailureAnalysis(failed);
        return;
      }
    } else {
      noImprovementCount = 0;
      bestScore = totalPassed;
    }
    
    // 실패 분석 + 프롬프트 패치 제안
    failedTcIds = failed.map(f => f.input.id);
    console.log(`\n❌ Failed TCs: ${failedTcIds.join(", ")}`);
    printFailureAnalysis(failed);
    
    // 프롬프트 패치 제안 출력
    suggestPromptPatches(failed);
    
    // 리포트 저장
    await saveReport(round, results, "IN_PROGRESS");
  }
  
  console.log(`\n⏰ Max rounds (${maxRounds}) reached.`);
}
```

### CLI 커맨드 전체

```typescript
async function main() {
  const args = process.argv.slice(2);
  
  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("❌ DASHSCOPE_API_KEY not set.");
    process.exit(1);
  }
  
  initClient();
  
  switch (args[0]) {
    case "run":
      // 단일 TC: npx tsx src/index.ts run tc-01
      break;
      
    case "run-all":
      // 전체 1회: npx tsx src/index.ts run-all
      break;
      
    case "iterate":
      // 무한 반복: npx tsx src/index.ts iterate [--max-rounds 10] [--target 42]
      const maxRounds = parseInt(args.find(a => a.startsWith("--max-rounds="))?.split("=")[1] ?? "10");
      const target = parseInt(args.find(a => a.startsWith("--target="))?.split("=")[1] ?? "42");
      await iterateMode(maxRounds, target);
      break;
      
    case "run-version":
      // 버전별: npx tsx src/index.ts run-version v1
      // v1 TC만 실행, v1.5 TC만 실행 등
      break;
      
    case "prompt":
      // 프롬프트 미리보기: npx tsx src/index.ts prompt tc-01
      break;
      
    case "analyze":
      // 마지막 리포트 분석: npx tsx src/index.ts analyze
      break;
      
    default:
      printHelp();
  }
}
```

---

## 6. 검증 기준 요약 (v4)

| Level | 검증 항목 | 기준 | PASS 조건 | 자동 |
|-------|----------|------|-----------|------|
| 0 | JSON 파싱 | 유효한 JSON? | parse 성공 | ✅ |
| 1 | 스키마 | zod 스키마 통과? | 필수 필드 존재 | ✅ |
| 2 | HFG-1 | 거짓 계획? | timeFit 정직 + effortModel ≥ P25 | ✅ |
| 2 | HFG-2 | 반복 질문? | 이미 제공된 정보 재질문 없음 | ⚠️ 반자동 |
| 2 | HFG-3 | 고정관념? | 인구통계 기반 가정 없음 | ⚠️ 반자동 |
| 2 | HFG-4 | 숨겨진 가정? | assumptions[] 비어있지 않음 | ✅ |
| 3 | timeFit | 시간 정직성? | expected와 일치 (±1단계) | ✅ |
| 3 | effortModel | min/unit 범위? | P25-P75 범위 내 (±30%) | ✅ |
| 4 | 전략 키워드 | 기대 전략 포함? | 50% 이상 키워드 매칭 | ✅ |
| 5 | 감정 프로토콜 | 올바른 감정? | emotionProtocol 일치 | ✅ |
| 5 | 톤 | 유저 상황 맞춤? | coachComment 톤 적절 | ⚠️ 참고 |

**Overall PASS = Level 0~5 전부 통과**

---

## 7. 프롬프트 반복 개선 전략

### 실패 패턴 → 프롬프트 패치 맵핑

| 실패 패턴 | 프롬프트 패치 방향 |
|-----------|-------------------|
| `parse_fail` 다수 | JSON 예시 추가, response_format 강화 |
| `schema_fail` — emotionProtocol 누락 | 시스템 프롬프트에 "emotionProtocol은 필수 필드" 명시 |
| `schema_fail` — effortModel 누락 | "모든 plan에 effortModel 포함 필수" 강조 |
| `hfg_fail` — HFG-1 (거짓 계획) | DEFICIT 관련 규칙 더 강하게 + 구체적 예시 |
| `hfg_fail` — HFG-4 (숨겨진 가정) | "assumptions는 반드시 1개 이상" 규칙 추가 |
| `timefit_fail` — deficit인데 fits | "budget 계산을 먼저 하고 timeFit 결정" 순서 강제 |
| `effort_fail` — min/unit 너무 낮음 | 마스터 테이블 값을 시스템 프롬프트에 직접 포함 |
| `strategy_fail` — 차별화 부족 | TC별 "반드시 포함해야 할 전략" 힌트 추가 |
| `emotion_fail` — 감정 무시 | 감정 키워드 매칭 규칙 강화 |

### Few-shot 전략

3라운드 이상 실패하는 TC는 **시스템 프롬프트에 few-shot example로 추가**:

```
실패 TC의 input → 올바른 output 예시 → "이렇게 하라" 직접 삽입
```

단, 토큰 예산 관리 필요 (시스템 프롬프트가 너무 길면 성능 저하).
- 최대 3개 few-shot example까지만
- 가장 자주 실패하는 패턴 우선

---

## 8. 리포트 형식

```json
{
  "round": 3,
  "timestamp": "2026-03-19T22:30:00.000Z",
  "model": "qwen3.5-72b-instruct",
  "status": "IN_PROGRESS",
  "totalCases": 42,
  "passed": 38,
  "failed": 4,
  "passRate": "90.5%",
  "failedTCs": [
    {
      "id": "tc-10",
      "failureLevel": 3,
      "failureType": "timefit_fail",
      "detail": "expected deficit, got fits",
      "suggestion": "SYSTEM_PROMPT에 budget 계산 순서 강제"
    }
  ],
  "promptVersion": "v4.3",
  "promptDiff": "Added explicit budget calculation step before timeFit",
  "roundHistory": [
    { "round": 1, "passed": 30 },
    { "round": 2, "passed": 35 },
    { "round": 3, "passed": 38 }
  ],
  "costSoFar": {
    "totalTokens": 150000,
    "estimatedCost": "$0.09"
  }
}
```

---

## 9. 비용 추정 (v4)

| 항목 | 값 |
|---|---|
| System Prompt | ~4,000 tokens (v4는 마스터 테이블 포함) |
| User Prompt (평균) | ~400 tokens |
| 출력 (평균) | ~800 tokens (effortModel 등 추가 필드) |
| 호출당 총 토큰 | ~5,200 tokens |
| 42 TC 1라운드 | ~218,000 tokens |
| DashScope 가격 | input $0.0003/1K, output $0.0006/1K |
| **1라운드 비용** | **~$0.12** |
| **10라운드 비용** | **~$1.20** |

---

## 10. 실행 순서 — Claude Code가 따라야 할 워크플로우

```
STEP 1: 기존 파일 확인
  - src/types.ts 읽기
  - src/prompt.ts 읽기
  - data/input/*.json 개수 확인 (42개)
  - data/expected/*.json 개수 확인 (42개)

STEP 2: 코드 작성
  - src/api.ts 업데이트 (v4)
  - src/validator.ts 전면 재작성 (v4 검증 6단계)
  - src/analyzer.ts 전면 재작성 (v4 분석 + 패턴 감지)
  - src/runner.ts 전면 재작성 (expected 로딩 + v4 검증 연동)
  - src/index.ts 전면 재작성 (iterate 모드 추가)

STEP 3: 빌드 + 단일 TC 테스트
  - npm install
  - npx tsx src/index.ts prompt tc-01  (프롬프트 확인)
  - npx tsx src/index.ts run tc-01     (단일 실행)
  - 결과 확인 → 기본 동작 검증

STEP 4: 전체 실행 (1라운드)
  - npx tsx src/index.ts run-all
  - 리포트 확인

STEP 5: 반복 개선
  - npx tsx src/index.ts iterate --max-rounds=10 --target=42
  - 또는 수동으로:
    1. run-all → 리포트 확인 → 실패 TC 분석
    2. prompt.ts 수정 (실패 패턴에 맞게)
    3. 실패 TC만 재실행으로 확인
    4. 다시 run-all
    5. 42/42 될 때까지 반복

STEP 6: 완료
  - 최종 prompt.ts 확정
  - 최종 리포트 저장
  - git commit + push
```

### ⚠️ 중요 — 프롬프트 수정 시 규칙

1. **마스터 테이블 값은 절대 변경하지 말 것** — TC v4 문서가 진실의 원천
2. **TC input/expected JSON은 수정하지 말 것** — 프롬프트만 수정
3. **few-shot 추가 시 토큰 예산 확인** — 시스템 프롬프트 8,000 토큰 이하 유지
4. **3라운드 연속 개선 없으면 멈추고 보고** — 무한 루프 방지
5. **각 라운드마다 리포트 저장** — 이전 결과 추적 가능하게

---

## 11. 성공 정의

```
42/42 PASS = 모든 TC가 Level 0-5 검증 통과

최소 수용 기준 (ship gate):
  - 38/42 이상 (90%+)
  - 0개 HFG 위반
  - 0개 parse/schema 실패
  - timeFit 정확도 90%+
  - emotionProtocol 정확도 90%+
```

---

## 12. 기존 파일 중 삭제/변경 대상

| 파일 | 액션 |
|------|------|
| `AddPlan Scenario AI Test — PROJECT-SPEC (2026-03-18).md` | **삭제** (v3 구 명세서) |
| `src/types.ts` | 유지 (이미 v4) |
| `src/prompt.ts` | 유지 (이미 v4) — iterate 중 수정 대상 |
| `src/api.ts` | **재작성** |
| `src/validator.ts` | **전면 재작성** |
| `src/analyzer.ts` | **전면 재작성** |
| `src/runner.ts` | **전면 재작성** |
| `src/index.ts` | **전면 재작성** |
| `data/input/tc-*.json` | 유지 (42개 이미 존재) |
| `data/expected/tc-*.json` | 유지 (42개 이미 존재) |
| `docs/AI-Coach-42-Test-Cases-v4.md` | 유지 (참조용) |
| `docs/superpowers/` | 삭제 가능 (v3 잔여물) |

---

*작성: 2026-03-19 | MUSE*
*원본: AI Coach — 42 Test Cases v4 (2026-03-19)*
