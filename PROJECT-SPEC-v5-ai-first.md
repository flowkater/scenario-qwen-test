# AI Coach v5 — AI-First 아키텍처 구현 명세서

> **이전 방향의 문제**: v4에서 Engine이 모든 판단을 하고 AI는 문장만 생성 → 42개 TC의 원래 의도("진짜 학습 코치")를 배반.
> **v5 방향**: AI가 진단+전략+질문+감정+현실직면을 수행하고, Engine은 수학만 보조.
> **핵심 전환**: Engine-first → **AI-first + Engine-assisted**

---

## 0. 원래 의도 (Tony Cho, 2026-03-19)

> "v1이니 이런거 구애받지말고 AI를 우리 메인으로 가져간다고 할때,
> 정말 유저의 문제를 해결하고 제대로된 계획을 제공해준다면,
> 우리는 정확히 어떤 기준으로 무엇을 제공해야할까?"

42개 TC는 이 질문의 답이다. **"진짜 학습 코치가 이 상황에서 해야 할 일"의 골드 스탠다드.**

---

## 1. AI Coach가 해야 하는 5가지 판단

42개 TC를 분석하면, AI가 해야 할 판단은 5가지로 수렴한다:

### 1) 진단 (Diagnosis)
유저의 **진짜 문제**를 파악한다.

| TC | 유저가 말한 것 | AI가 진단해야 할 것 |
|---|---|---|
| tc-04 | "orgo 시험 10일" | focusSpan=15 → 포모도로 15/5 구조 필요 |
| tc-07 | "재수강, 메커니즘에서 막혀" | 약점=메커니즘 → 40-50% 시간 배분 |
| tc-34 | "3번째 도전, 개념은 아는데" | 문제≠이해 → 시험 시뮬레이션 전략 |
| tc-37 | "5일 밀렸어" | guilt-free 재계산 + 왜 밀렸는지 진단 |
| tc-27 | "8강 밀려있어" | 하루 2개는 불가능 → 1개/day + 문제 병행 |

### 2) 전략 선택 (Strategy)
같은 "교재 읽기"라도 **상황에 따라 완전히 다른 전략**을 선택한다.

| TC | 상황 | 전략 |
|---|---|---|
| tc-01 | 첫 시험, 여유 있음 | 정독 + self-test |
| tc-05 | D-3, panic | **TRIAGE** — 문제 > skim > 강의 2-3개만 |
| tc-06 | Essay exam | **역추적** — 에세이 프롬프트 → 관련 챕터만 |
| tc-21 | PhD 12편 논문 | **3-tier** — Must(5) / Should(5) / Skim(2) |
| tc-15 | PMP 두 권 | PMBOK 756p → **200p selective**, Rita 정독 |
| tc-10 | D-1, 300p | **Index scan + 핵심 용어 + 최약 챕터** = 45min |

### 3) 감정 대응 (Emotion Protocol)
```
panic     → validate → triage → sleep guard → schedule blocks
shame     → normalize → recalculate from NOW → new starting point  
frustration → acknowledge → diagnose cause → pivot strategy
burnout   → recovery first → scale down → small wins
neutral   → strategy-first, no unnecessary empathy
```

### 4) 적응형 질문 (Adaptive Questions)
**전략을 바꾸는 질문만** 한다. max 3개.

| TC | 질문 | 이게 바꾸는 것 |
|---|---|---|
| tc-04 | "문제 몇 개야?" | Plan 2 존재 여부 + 시간 배분 |
| tc-07 | "어떤 메커니즘이 약해?" | drill 순서 + 시간 배분 |
| tc-09 | "어떤 종류 시험이야?" | 전체 경로 결정 |
| tc-29 | "몇 배속으로 들어?" | 시간 30% 차이 |

### 5) 현실 직면 (Honest Assessment)
거짓 계획 금지. deficit이면 솔직하게 + **대안 제시**.

| TC | 현실 | AI가 해야 할 것 |
|---|---|---|
| tc-36 | TOEFL 80→100, 60hr | "205시간 필요, 60시간으론 불가능" + 대안 3가지 |
| tc-18 | 정처기 비전공 21일 | "360min/day 필요 vs 90min 예산 = impossible" + triage |
| tc-03 | 300p, 60min, 14일 | "900min > 840min = deficit" + 옵션 A/B/C |

---

## 2. 비결정적 AI 검증 — 어떻게 테스트하는가

### 핵심 문제
AI 출력은 매번 다르다. 같은 입력에 "15p/day reading" 또는 "daily 15 pages"라고 할 수 있다.
**정확한 문자열 매칭은 불가능. 의미(semantic) 기반 검증이 필요.**

### 검증 2-Track 유지하되 기준 변경

```
Track 1: 결정론적 검증 (Engine) — 100% 필수, 매번 동일
  ├── timeFit 일치
  ├── effortModel P25-P75 범위 내
  ├── totalDailyMinutes 합리적
  └── HFG (거짓 계획, 빈 plans 등)

Track 2: 의미 기반 검증 (AI Coach) — 80%+ 목표, 통계적
  ├── 감정 프로토콜 일치 (enum이라 exact match 가능)
  ├── 전략 의도 검증 (새 방식 — 아래 상세)
  ├── 질문 품질 검증 (새 방식 — 아래 상세)
  └── 현실 직면 검증 (deficit/impossible 시 대안 존재)
```

### 새로운 Expected JSON 구조

기존 `expectedStrategy: ["15p/day reading", ...]` (문자열 매칭)을 **의도 기반**으로 교체:

```jsonc
{
  "tcId": "tc-04",
  
  // Track 1: 결정론적 (Engine이 보장, 변경 없음)
  "expectedTimeFit": "deficit",
  "effortModel": { "expected": 5.5, "min": 4.8, "max": 7.0, "unit": "page" },
  "hardFailChecks": ["HFG-1", "HFG-2", "HFG-3"],

  // Track 2: AI 판단 검증 (의미 기반)
  "emotion": {
    "expected": "frustration",
    "signals": ["focusSpan=15", "orgo difficulty"],
    "mustNotBe": ["neutral", "panic"]  // 이걸로 오감지하면 FAIL
  },

  "diagnosis": {
    // AI가 반드시 인식해야 할 것
    "mustIdentify": [
      "short focus span requires structured sessions",
      "orgo mechanisms are difficulty driver"
    ],
    // 이 중 하나라도 출력에 있으면 PASS (semantic match)
    "acceptableKeywords": ["pomodoro", "15min", "focus", "short session", "break", "interval"]
  },

  "strategy": {
    // AI가 선택해야 할 전략 카테고리 (exact match)
    "expectedType": "structured-session",  // triage | deep-read | reverse-engineer | 3-tier | structured-session | simulation | time-box
    // 이 전략을 증명하는 키워드 (하나라도 있으면 OK)
    "evidenceKeywords": ["pomodoro", "15/5", "block", "session", "interval", "break"]
  },

  "questions": {
    "required": ["practiceProblemsCount"],
    "maxCount": 1,
    // 이 질문이 바꾸는 것 (decisionImpact가 이걸 언급해야 함)
    "mustChangeWhat": "plan 2 existence and time allocation"
  },

  "honesty": {
    // deficit/impossible일 때만 적용
    "mustAcknowledge": "deficit",          // AI가 이걸 인정해야 함
    "mustProvideAlternatives": true,       // 대안 A/B/C 제시해야 함
    "mustNotFalsePlan": true               // min/unit 낮춰서 fits로 만들면 FAIL
  },

  "tone": {
    "expected": "constraint-accepting",
    "mustNotSay": ["try harder", "focus longer", "you should"],
    "shouldSay": ["맞춰서", "리듬", "구조"]  // 하나라도 있으면 보너스
  }
}
```

### 의미 기반 매칭 구현 (`src/validator-v5.ts`)

```typescript
// 문자열 매칭이 아니라 "의도 존재 확인"
function checkDiagnosis(output: any, expected: DiagnosisCheck): boolean {
  const outputText = JSON.stringify(output).toLowerCase();
  
  // acceptableKeywords 중 하나라도 있으면 PASS
  const hasKeyword = expected.acceptableKeywords.some(
    kw => outputText.includes(kw.toLowerCase())
  );
  
  // mustIdentify는 LLM-as-Judge로 검증 (Phase 2)
  // Phase 1에서는 keyword만으로 판정
  return hasKeyword;
}

function checkStrategy(output: any, expected: StrategyCheck): boolean {
  const outputText = JSON.stringify(output).toLowerCase();
  
  // evidenceKeywords 중 하나라도 있으면 PASS
  return expected.evidenceKeywords.some(
    kw => outputText.includes(kw.toLowerCase())
  );
}

function checkEmotion(output: any, expected: EmotionCheck): boolean {
  const actual = output.emotionProtocol ?? "neutral";
  
  // mustNotBe에 해당하면 즉시 FAIL
  if (expected.mustNotBe?.includes(actual)) return false;
  
  // exact match
  return actual === expected.expected;
}

function checkHonesty(output: any, expected: HonestyCheck): boolean {
  if (!expected) return true;  // deficit 아닌 TC는 skip
  
  const timeFit = output.timeFit ?? "fits";
  
  // deficit인데 fits라고 했으면 FAIL (HFG-1)
  if (expected.mustAcknowledge === "deficit" && timeFit === "fits") return false;
  
  // 대안 필수인데 없으면 FAIL
  if (expected.mustProvideAlternatives) {
    const hasAlts = output.alternatives?.length > 0 
      || JSON.stringify(output).toLowerCase().includes("option")
      || JSON.stringify(output).toLowerCase().includes("alternative")
      || JSON.stringify(output).toLowerCase().includes("대안");
    if (!hasAlts) return false;
  }
  
  return true;
}
```

### 비결정성 처리 — 통계적 검증

```typescript
// 단일 실행이 아니라 N회 실행 → 통과율로 판정
async function runStatisticalValidation(tcId: string, runs: number = 5) {
  const results = [];
  
  for (let i = 0; i < runs; i++) {
    const result = await runPipeline(input);
    const validation = validateV5(result, input, expected);
    results.push(validation);
  }
  
  return {
    tcId,
    runs,
    enginePassRate: results.filter(r => r.enginePass).length / runs,  // 100% 필수
    emotionPassRate: results.filter(r => r.emotionPass).length / runs,
    diagnosisPassRate: results.filter(r => r.diagnosisPass).length / runs,
    strategyPassRate: results.filter(r => r.strategyPass).length / runs,
    questionsPassRate: results.filter(r => r.questionsPass).length / runs,
    honestyPassRate: results.filter(r => r.honestyPass).length / runs,
    overallPassRate: results.filter(r => r.overallPass).length / runs,
  };
}
```

**통과 기준:**
```
Engine Track: 5/5 (100%) — 결정론적이므로 무조건
Emotion: 4/5 (80%+) — enum이라 비교적 안정
Diagnosis: 3/5 (60%+) — keyword 매칭이라 관대
Strategy: 3/5 (60%+) — keyword 매칭
Questions: 3/5 (60%+) — required question 존재 확인
Honesty: 5/5 (100%) — deficit인데 fits면 항상 FAIL

Overall: 42개 TC × 5회 = 210회 실행
  → Engine 210/210 (100%)
  → 각 AI 판단 항목 80%+ (168/210)
  → Ship gate: 전체 TC 중 38+/42가 overallPass 80%+
```

---

## 3. 프롬프트 최적화 — 어떻게 하는가

### 원칙: "답을 주지 말고, 판단 기준을 줘"

| ❌ 현재 (v4) | ✅ v5 |
|---|---|
| `"Mankiw = 3.0 min/page"` | `"introductory econ textbooks typically take 3-4 min/page for beginners"` |
| `"timeFit=deficit FORCED"` | `"if daily need > budget, honestly say deficit"` |
| `"LOCKED CALCULATION: 600p × 9.0 = 5400min"` | `"call engine.calculate(pages, rate) for exact math"` |
| `"COPY THIS: effortModel: {...}"` | `"use engine result for effortModel, add your strategic context"` |

### 프롬프트 구조

```
시스템 프롬프트 (~800 tokens):
├── 역할 정의: "You are an expert study coach"
├── 5가지 판단 프레임워크
├── 감정 프로토콜 5종
├── 현실 직면 원칙 (HFG)
└── Engine 호출 규칙

도메인 지식 (~1500 tokens):
├── 교과목별 난이도 가이드 (범위만, 정확한 숫자는 engine)
├── 전략 유형 7가지 설명
├── 학술 참조 (Keshav 3-pass, Mark 23min, Ebbinghaus 등)
└── 감정별 대응 프로토콜

유저 컨텍스트 (동적):
├── profile (role, year, level, focusSpan, tone)
├── resources (textbook, problems, lectures)
├── exam/deadline
├── userMessage (자연어)
└── Engine 계산 결과 (rate, totalMin, dailyNeed, timeFit)
```

### 프롬프트 최적화 루프

```
1. 5회 run-all 실행 → 통과율 수집
2. 실패 TC 분석:
   - emotion 실패 → 감정 신호 목록 보강
   - diagnosis 실패 → 진단 가이드 예시 추가
   - strategy 실패 → 전략 유형 설명 보강
   - honesty 실패 → HFG 규칙 강화
3. 프롬프트 수정 (변경 최소화 — 한 번에 1가지만)
4. 5회 재실행 → 개선 확인
5. 3라운드 개선 없으면 중단 + 리포트
```

**절대 안 하는 것:**
- TC별 답 하드코딩 (LOCKED CALCULATION)
- 정확한 숫자 주입 (engine이 할 일)
- 출력 JSON 직접 제시 (COPY THIS)

---

## 4. 파이프라인 변경

### 현재 (v4 — Engine-first)
```
input → buildSkeleton() → generateCoaching(skeleton) → merge → validate
         Engine 전부        AI 장식만
```

### v5 (AI-first + Engine-assisted)
```
input → AI Coach (Round 1: 진단+전략+질문)
           ↓
        Engine (Coach 전략 기반 계산)
           ↓
        AI Coach (Round 2: 결과 해석 + 코칭 전달)
           ↓
        validate
```

### 구현: 2-Turn Pipeline

```typescript
// src/pipeline-v5.ts

async function runPipelineV5(input: TestCaseInput): Promise<FullOutput> {
  
  // === Turn 1: AI가 진단 + 전략 결정 ===
  const turn1 = await coachTurn1(input);
  // turn1 출력:
  // {
  //   emotionProtocol: "frustration",
  //   diagnosis: "short focus span requires pomodoro structure",
  //   strategyType: "structured-session",
  //   engineInstructions: {
  //     resources: [{ type: "textbook", pages: 200, rateHint: "orgo-first" }],
  //     daysLeft: 10,
  //     budget: { weekday: 120, weekend: 120 },
  //     focusSpanAdjustment: 0.65
  //   },
  //   questionsToAsk: [{ question: "...", decisionImpact: "..." }]
  // }

  // === Engine: AI 지시대로 계산 ===
  const skeleton = engine.calculateFromInstructions(turn1.engineInstructions);
  // skeleton: { plans, timeFit, totalDailyMinutes, effortModel, warnings }

  // === Turn 2: AI가 Engine 결과를 해석하여 최종 코칭 ===
  const turn2 = await coachTurn2(input, turn1, skeleton);
  // turn2 출력:
  // {
  //   coachComment: "15분이 네 리듬이라면 거기에 맞춰 짜자...",
  //   strategy: "Pomodoro 15/5 structure with mechanism-first priority",
  //   strategyRationale: "200p × 5.5min = 1100min, effective 78min/day...",
  //   alternatives: [...],  // deficit 시
  //   warnings: [...]
  // }

  // === Merge: Engine 숫자 + AI 판단 ===
  return merge(skeleton, turn1, turn2);
}
```

### 비용 계산

```
Turn 1: ~500 input + ~300 output = ~800 tokens
Turn 2: ~800 input + ~400 output = ~1200 tokens
Total: ~2000 tokens/TC × $0.10/1M = $0.0002/TC

42 TC × 5 runs = 210 calls × $0.0002 = ~$0.04
전체 최적화 루프 (10 라운드 × 210) = ~$0.40
```

---

## 5. 프로젝트 구조 변경

```
scenario-qwen-test/
├── src/
│   ├── engine/                    # 유지 — 수학 도구
│   │   ├── rates.ts               # 마스터 테이블 (유지)
│   │   ├── matcher.ts             # rate 매칭 (유지)
│   │   ├── calculator.ts          # 산술 (유지)
│   │   └── ...
│   │
│   ├── coach/                     # 🔨 대폭 변경 — AI 핵심
│   │   ├── system-prompt.ts       # 시스템 프롬프트 (~800 tokens)
│   │   ├── domain-knowledge.ts    # 도메인 지식 (~1500 tokens)
│   │   ├── turn1.ts               # 진단 + 전략 + 질문 (Round 1)
│   │   ├── turn2.ts               # 결과 해석 + 코칭 (Round 2)
│   │   └── generate.ts            # Qwen API 호출
│   │
│   ├── pipeline-v5.ts             # 🔨 NEW — 2-Turn 파이프라인
│   ├── validator-v5.ts            # 🔨 NEW — 의미 기반 검증
│   ├── types.ts                   # 타입 확장
│   └── index.ts                   # CLI 업데이트
│
├── data/
│   ├── input/                     # 유지
│   └── expected-v5/               # 🔨 NEW — 의미 기반 expected
│
└── tests/
    ├── engine.test.ts             # 유지 — Engine 44/44
    └── coach.test.ts              # 🔨 NEW — 5회 통계 검증
```

---

## 6. Expected JSON 마이그레이션

기존 `data/expected/` → `data/expected-v5/`로 변환.

변환 규칙:
```
expectedStrategy: ["15p/day reading", ...] 
  → strategy.expectedType + strategy.evidenceKeywords

emotionProtocol: "frustration"
  → emotion.expected + emotion.signals + emotion.mustNotBe

expectedQuestions.required: ["practiceProblemsCount"]
  → questions.required (유지) + questions.mustChangeWhat

expectedTimeFit: "deficit" 
  → 유지 (Engine Track)

effortModel: { ... }
  → 유지 (Engine Track)

hardFailChecks: [...]
  → 유지 (Engine Track)

toneExpectation: "constraint-accepting — ..."
  → tone.expected + tone.mustNotSay + tone.shouldSay
```

---

## 7. 실행 순서

```
═══ Phase A: Expected v5 변환 + Validator v5 ═══

STEP 1: data/expected/ → data/expected-v5/ 변환 (42개)
STEP 2: src/validator-v5.ts 구현 (의미 기반)
STEP 3: src/types.ts 확장 (ExpectedV5 타입)
STEP 4: Engine test 유지 확인: npx tsx tests/engine.test.ts → 44/44

═══ Phase B: AI Coach 프롬프트 작성 ═══

STEP 5: src/coach/system-prompt.ts — 역할 + 5가지 판단 프레임워크
STEP 6: src/coach/domain-knowledge.ts — 도메인 지식 (범위, 전략 유형)
STEP 7: src/coach/turn1.ts — 진단 + 전략 + 질문
STEP 8: src/coach/turn2.ts — Engine 결과 해석 + 코칭

═══ Phase C: 파이프라인 통합 + 검증 ═══

STEP 9: src/pipeline-v5.ts — 2-Turn 파이프라인
STEP 10: 5회 run-all → 통과율 수집
STEP 11: 실패 분석 → 프롬프트 수정 (최대 5라운드)
STEP 12: 최종 리포트

═══ 완료 조건 ═══
- Engine: 44/44 (100%, 결정론적)
- Emotion: 80%+ (5회 평균)
- Diagnosis + Strategy: 60%+ (keyword 매칭)
- Honesty: 100% (deficit 인정 필수)
- Ship gate: 38+/42 TC가 overallPass 80%+
```

---

## 8. ⚠️ 제약사항

1. **프롬프트에 TC별 답 하드코딩 금지** — "LOCKED CALCULATION" 방식 절대 안 함
2. **Engine 숫자를 프롬프트에 직접 넣지 않음** — Engine을 호출해서 받아옴
3. **data/input/ 수정 금지**
4. **data/expected/ 원본 유지** — expected-v5/는 별도 폴더
5. **단일 실행 100% PASS 목표 아님** — 5회 통계적 80%+ 목표
6. **프롬프트 수정은 한 번에 1가지만** — A/B 테스트 가능하게
7. **3라운드 개선 없으면 중단** — 무한 루프 방지

---

## 9. 성공 정의

| Track | 기준 | 검증 |
|-------|------|------|
| Engine | 44/44 (100%) | `npx tsx tests/engine.test.ts` |
| Emotion | 80%+ (5회 평균) | `npx tsx src/index.ts run-all-v5 --runs=5` |
| Diagnosis | 60%+ | keyword 매칭 |
| Strategy | 60%+ | keyword 매칭 |
| Honesty | 100% | deficit → not fits |
| **Ship** | **38+/42 TC overall 80%+** | 통계 리포트 |

---

*작성: 2026-03-21 | MUSE*
*원본: Tony Cho "AI를 핵심으로, 완전히 새롭게" (2026-03-19)*
*기반: 42 TC v4 + Engine v4 (수학 보조용 유지)*
