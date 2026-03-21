# AI Coach v5 — 클린 프롬프트 구현 가이드

> **목적**: 하드코딩된 답을 전부 제거하고, AI가 도메인 지식과 원칙만으로 판단하게 한다.
> **검증**: 기존 42 TC (44 케이스)로 통과율 측정. Engine은 수학만, AI는 판단만.
> **모델**: qwen3.5-flash, `enable_thinking: true`

---

## 1. 현재 문제

`src/prompt.legacy.ts`에 답이 직접 들어있다:

| 섹션 | 줄 수 | 문제 |
|------|------|------|
| EFFORT MODEL | 158줄 | TC별 정답 주입 (`⚠ CRITICAL`, `❌ NEVER`, `✅ COPY THIS`) |
| PLAN GENERATION RULES | 321줄 | TC별 계산 결과 하드코딩 (`MANDATORY IMPOSSIBLE`, 예시 숫자) |
| buildUserPrompt | 747줄 | `LOCKED CALCULATION` 47개, if/else 102개 분기 |

**총 ~1200줄이 "답 주입"이고, 원칙은 ~170줄뿐이다.**

---

## 2. 유지할 것 (원칙 ~170줄)

### SYSTEM_PROMPT에서 남길 섹션:

**A. HARD FAIL GATES (20줄) — 그대로 유지**
```
HFG-1: 거짓 계획 금지 (min/unit 낮춰서 fits 만들기 = FAIL)
HFG-2: 불필요한 질문 금지
HFG-3: 프로필 고정관념 금지
HFG-4: 숨겨진 가정 금지 (assumptions[] 필수)
HFG-5: 빈 plans 금지
```

**B. EMOTION PROTOCOL (20줄) — 그대로 유지**
```
neutral/panic/shame/frustration/burnout
감지 신호 + 대응 프로토콜
```

**C. TONE (9줄) — 그대로 유지**

**D. ACADEMIC REFERENCES (8줄) — 그대로 유지**

**E. OUTPUT FORMAT (67줄) — 그대로 유지** (JSON 스키마)

### SYSTEM_PROMPT에서 제거할 섹션:

**F. EFFORT MODEL (158줄) — 전면 교체**
- ❌ 삭제: TC별 정답 (`⚠ CRITICAL: 250p × 3.0 = 750min...`, `❌ NEVER use 2.8`)
- ❌ 삭제: 특정 교재명 → 특정 숫자 매핑 (`McMurry RETAKE: MUST use 4.0`)
- ✅ 대체: 도메인별 난이도 범위 가이드 (아래 상세)

**G. PLAN GENERATION RULES (321줄) — 전면 교체**
- ❌ 삭제: `MANDATORY IMPOSSIBLE`, `FORCED`, TC별 예외 규칙
- ❌ 삭제: 특정 시나리오 계산 예시 (`PMP PMBOK 7TH EDITION + RITA MULCAHY:`)
- ✅ 대체: 전략 선택 원칙 (아래 상세)

**H. buildUserPrompt (747줄) — 전면 교체**
- ❌ 삭제: `LOCKED CALCULATION` 47개 블록
- ❌ 삭제: if/else 102개 분기
- ✅ 대체: Engine 계산 결과 주입 + 유저 컨텍스트 전달

---

## 3. 새로운 SYSTEM_PROMPT 구조

```
═══ 역할 정의 (~5줄) ═══
"You are an expert study coach for Todait.
 You receive a user's study situation AND pre-calculated math from the Engine.
 Your job: diagnose, strategize, ask smart questions, and coach honestly."

═══ HARD FAIL GATES (~20줄) ═══
[기존 그대로 유지]

═══ EMOTION PROTOCOL (~20줄) ═══
[기존 그대로 유지]

═══ 5가지 판단 프레임워크 (~30줄, NEW) ═══

1. DIAGNOSIS — 유저의 진짜 문제를 파악하라
   - 집중 시간이 짧으면 → 구조화된 세션 설계 (포모도로 등)
   - 재수강 + 특정 약점 → 약점 우선 배분
   - 밀린 상황 → 원인 진단 + guilt-free 재계산
   - "개념은 아는데 시험에서 못 해" → 시뮬레이션/실전 연습 전략

2. STRATEGY SELECTION — 상황에 맞는 전략을 선택하라
   - 시간 충분(fits) → 정독 + 복습 + 자기 테스트
   - 시간 빠듯(tight) → 우선순위 정하고 핵심 집중
   - 시간 부족(deficit) → 옵션 A/B/C 제시, 솔직하게
   - 시간 불가능(impossible, D-1~3) → TRIAGE (뭘 버릴지 결정)
   - 에세이/논술 시험 → 출제 의도 역추적, 전체 읽지 마
   - 논문 다수 → 3-tier 분류 (Must/Should/Skim)
   - 두꺼운 참고서 + 핵심서 → 핵심서 정독 + 참고서 선택적

3. ADAPTIVE QUESTIONS — 전략을 바꾸는 질문만 (max 3)
   - 분량 모르면 → 물어봐 (Plan 존재 여부 결정)
   - 배속 모르면 → 물어봐 (시간 30% 차이)
   - 시험 유형 모르면 → 물어봐 (전체 경로 결정)
   - 약점 모르면 → 물어봐 (시간 배분 결정)
   - 이미 알고 있으면 → 묻지 마

4. HONEST ASSESSMENT — 거짓 계획 금지
   - Engine이 deficit/impossible이라고 하면 → 그대로 전달
   - 대안 A/B/C 제시 (시간 늘리기 / 범위 줄이기 / 전략 바꾸기)
   - 절대 min/unit 낮춰서 fits로 만들지 마

5. EMOTION-AWARE COACHING — 감정에 맞는 톤
   - panic → 먼저 안심시키고, 그 다음 triage
   - shame → "떨어진 건 정상이야" → 지금부터 재계산
   - frustration → 문제를 인정하고 → 구조적 해결책
   - burnout → 회복 먼저 → 최소 분량 → 작은 성취
   - neutral → 감정 언급 없이 전략부터

═══ 도메인 지식 (~50줄, NEW — 범위만, 정답 아님) ═══

Reading speed ranges (min/page, P50):
- 소설/에세이: 1.5-2.5
- 입문 교과서 (경제학 등): 2.5-4.0
- 중급 교과서 (유기화학, 생물학 등): 4.0-7.0
- 고급/전문 (해부학, 판례, 법학): 8-20
- 리뷰북/시험 대비서: 2.0-3.5
- 긴급 훑기 (triage): 0.8-1.5

Watch multipliers (× 영상 길이):
- 일반 강의: 1.5-2.0×
- 코딩 튜토리얼 (따라하기): 2.0-3.0×
- 배속 미확인 시: 1.5× 가정하고 질문으로 확인

Practice (min/unit):
- 일반 문제: 8-18 min/problem
- 어려운 문제 (고급 수학, 유기화학 메커니즘): 15-60 min/problem
- 에세이 마일스톤: 50-120 min/milestone
- SRS 단어: 0.8-1.5 min/word (Day 14-21 pile-up 경고 필수)
- 논문 (3-pass): 90-240 min/paper

Language exam score gain:
- TOEFL: ~100hr per 10 points (90점 이상은 비선형 증가)
- JLPT: N3→N2 = 400-600hr total

학습 과학 원칙 (인용 가능):
- Cal Newport: 하루 유효 딥워크 2-4시간
- Gloria Mark UCI: 중단 후 재집중 23-25분
- Ebbinghaus: 망각 곡선, 간격 반복
- Keshav 3-pass: 논문 읽기 3단계 (5min/30min/60min+)
- focusSpan ≤ 20min → 유효 시간 = 예산 × 0.65 (포모도로 효율)

═══ ENGINE 결과 사용 규칙 (~10줄) ═══

Engine이 제공하는 값:
- timeFit: fits/tight/deficit/impossible — 이 값을 그대로 사용. 변경 금지.
- effortModel: { expected, min, max, unit } — 이 값을 그대로 사용. 변경 금지.
- totalDailyMinutes — 이 값을 그대로 사용. 변경 금지.
- plans[] — Engine이 생성한 Plan 구조를 기반으로 전략/코멘트 작성.
- warnings[] — Engine 경고를 코칭에 반영.

당신의 역할: Engine 숫자를 받아서 진단 + 전략 + 코칭 + 질문을 추가하는 것.
숫자를 바꾸는 것이 아님.

═══ TONE (~9줄) ═══
[기존 유지]

═══ OUTPUT FORMAT (~67줄) ═══
[기존 유지]

═══ ACADEMIC REFERENCES (~8줄) ═══
[기존 유지]
```

**예상 프롬프트 길이: ~220줄, ~3000 tokens** (현재 1375줄의 1/6)

---

## 4. 새로운 buildUserPrompt

**현재**: 747줄, LOCKED CALCULATION 47개, if/else 102개
**목표**: ~40줄, Engine 결과 전달만

```typescript
export function buildUserPrompt(input: TestCaseInput): string {
  const lines: string[] = [];

  // 1. 유저 메시지
  lines.push(`=== USER MESSAGE ===`);
  lines.push(input.userMessage);

  // 2. 프로필
  lines.push(`\n=== PROFILE ===`);
  lines.push(`Role: ${input.profile.role}, Year: ${input.profile.year ?? "N/A"}`);
  lines.push(`Level: ${input.profile.level}, Tone: ${input.profile.tone ?? "neutral"}`);
  if (input.profile.focusSpan) lines.push(`Focus Span: ${input.profile.focusSpan}min`);
  if (input.profile.isRetake) lines.push(`RETAKER: true`);
  lines.push(`Budget: ${input.profile.timeBudget.weekday}min weekday, ${input.profile.timeBudget.weekend}min weekend`);

  // 3. 시험/마감
  if (input.exam) {
    lines.push(`\n=== EXAM ===`);
    lines.push(`Subject: ${input.exam.subject}`);
    lines.push(`Days left: ${input.exam.daysLeft}`);
    if (input.exam.format) lines.push(`Format: ${input.exam.format}`);
  }

  // 4. 자료
  lines.push(`\n=== RESOURCES ===`);
  if (input.resources.length === 0) {
    lines.push(`No resources provided.`);
  } else {
    for (const r of input.resources) {
      lines.push(`- ${r.type}: ${r.description} (${r.quantity})`);
    }
  }

  // 5. Engine 계산 결과 (pre-calculated)
  lines.push(`\n=== ENGINE RESULTS (pre-calculated, do NOT change) ===`);
  // skeleton을 여기서 주입 — pipeline에서 전달받음
  // 이 부분은 pipeline-v5에서 skeleton을 buildUserPrompt에 전달하는 구조로 변경

  // 6. 감정 힌트 (input에 있으면)
  if (input.emotionProtocol && input.emotionProtocol !== "neutral") {
    lines.push(`\nEmotion signal: ${input.emotionProtocol}`);
  }

  lines.push(`\nBased on the above, provide your coaching response as JSON.`);
  return lines.join("\n");
}
```

---

## 5. 파이프라인 변경

```typescript
// src/pipeline-v5.ts

async function runV5(input: TestCaseInput): Promise<FullOutput> {
  // Step 1: Engine이 수학 계산 (기존 engine/ 그대로 사용)
  const skeleton = buildSkeleton(input);

  // Step 2: AI Coach가 판단
  //   - Engine 결과(skeleton)를 유저 프롬프트에 포함
  //   - AI는 skeleton.timeFit, skeleton.effortModel 등을 받아서
  //     진단/전략/감정/질문/코칭을 생성
  const coaching = await callAICoachV5(input, skeleton);

  // Step 3: Merge (Engine 숫자는 고정, AI 판단만 추가)
  return {
    ...skeleton,                    // plans, timeFit, totalDailyMinutes, effortModel
    emotionProtocol: coaching.emotionProtocol,
    coachComment: coaching.coachComment,
    strategy: coaching.strategy,
    strategyRationale: coaching.strategyRationale,
    questionsToAsk: coaching.questionsToAsk,
    warnings: [...skeleton.warnings, ...(coaching.additionalWarnings ?? [])],
    alternatives: coaching.alternatives,
  };
}
```

---

## 6. API 설정

```typescript
// src/api.ts 변경사항:
// 1. enable_thinking: true (이미 변경됨)
// 2. SYSTEM_PROMPT → 새 클린 프롬프트 사용
// 3. buildUserPrompt → skeleton 포함 버전 사용
// 4. temperature: 0.3 유지
// 5. max_tokens: 4000 유지
```

---

## 7. 실행 순서

```
STEP 1: src/prompt-v5.ts 생성
   - 새 SYSTEM_PROMPT (~220줄, 원칙만)
   - 새 buildUserPrompt (~40줄, Engine 결과 포함)

STEP 2: src/pipeline-v5.ts 생성
   - engine.buildSkeleton() → callAICoachV5() → merge

STEP 3: src/api.ts 수정
   - callAICoachV5() 함수 추가 (새 프롬프트 사용, enable_thinking: true)
   - 기존 callAICoach()는 유지 (레거시 호환)

STEP 4: src/index.ts에 run-v5 / run-all-v5 명령 추가
   - run-v5 tc-XX: 단일 TC v5 파이프라인
   - run-all-v5: 전체 44 TC v5 파이프라인

STEP 5: run-all-v5 실행 → 결과 리포트
   - Engine Track: 44/44 (100% 보장, 기존 engine)
   - Coach Track: emotion/strategy/diagnosis 통과율 측정
   - 실패 TC 분석

STEP 6: 실패 패턴 기반 프롬프트 수정 (최대 3라운드)
   - 한 번에 1가지만 수정
   - 수정 후 run-all-v5 재실행
   - 3라운드 개선 없으면 중단 + 리포트

기존 코드 유지:
   - src/prompt.legacy.ts — 참조용
   - src/engine/ — 그대로 (수학 도구)
   - src/validator.ts — 기존 검증 로직 재사용
   - tests/engine.test.ts — Engine 44/44 유지 확인
   - data/input/, data/expected/ — 수정 금지
```

---

## 8. 검증 기준

기존 `src/validator.ts`의 `validateV4()`를 그대로 사용:

```
overallPass = parseSuccess
  && schemaValid
  && hfgPassed (HFG-1, HFG-2, HFG-4)
  && timeFitMatched (Engine이 보장)
  && effortModelInRange (Engine이 보장)
  && strategyKeywords 50%+ (AI가 판단)
  && emotionMatched (AI가 판단)
```

Engine이 timeFit/effortModel을 보장하므로, **AI가 실패할 수 있는 항목**:
- emotionProtocol (44개 중 22개가 neutral 아닌 감정)
- strategy 키워드 매칭 (35개 TC에 expectedStrategy 있음)

**목표**: 
- 1회 run-all-v5 → 38+/44 overallPass (86%+)
- 3회 run-all-v5 → 평균 40+/44 (90%+)

---

## 9. ⚠️ 절대 하지 말 것

1. **프롬프트에 TC별 답 주입 금지** — "Mankiw = 3.0", "LOCKED CALCULATION" 등
2. **프롬프트에 특정 교재명 → 특정 숫자 매핑 금지** — "McMurry retake MUST use 4.0" 등
3. **buildUserPrompt에서 TC ID 기반 분기 금지** — `if (input.id === "tc-04")` 등
4. **Engine 숫자를 AI가 변경하는 것 금지** — timeFit, effortModel은 Engine 값 고정
5. **data/input/, data/expected/ 수정 금지**
6. **src/prompt.legacy.ts 삭제 금지** — 참조용 유지

---

## 10. Claude Code 실행 프롬프트

```
이 저장소의 GUIDE-v5-clean-prompt.md를 읽고 STEP 1부터 순서대로 구현해.

핵심: src/prompt.legacy.ts의 1375줄 프롬프트에서 하드코딩된 답(LOCKED CALCULATION, 
TC별 분기, ⚠ CRITICAL 정답 주입)을 전부 제거하고, 원칙과 도메인 지식만 남긴 
~220줄 클린 프롬프트를 src/prompt-v5.ts에 작성해.

Engine(src/engine/)은 그대로 사용하되, 파이프라인을 
engine→coach(v5 프롬프트) 순서로 연결해.

enable_thinking: true로 Qwen flash의 thinking 모드 활성화.

STEP 5에서 npx tsx src/index.ts run-all-v5 실행하고 결과 리포트 작성.
38+/44 통과 목표. 실패 TC 분석 포함.
```

---

*작성: 2026-03-21 | MUSE*
*기존 자산: Engine 44/44 (수학 정확), 42 TC v4 (검증 기준), validator.ts (검증 로직)*
*변경: 프롬프트 1375줄 → ~220줄 (원칙만), thinking 모드 ON*
