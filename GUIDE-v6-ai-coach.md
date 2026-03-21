# AI Coach v6 — AI가 진짜 계획을 만드는 구현 가이드

> **v5와의 차이**: v5는 Engine이 plan을 만들고 AI가 코멘트만 추가.
> **v6**: AI가 5개 원칙으로 판단하고 실제 plan 구조를 생성. Engine은 수학 도구.
> **핵심 전환**: AI가 텍스트 장식 → AI가 plan 구조를 만드는 주체

---

## 0. Todait 제품 원칙

**Todait는 분량 기반 플래너다. 시간 기반이 아니다.**

```
✅ Todait plan: "오늘 11페이지 읽기" / "문제 5개 풀기" / "강의 2개 보기"
❌ 아닌 것: "09:00-09:30 읽기" / "포모도로 15분 블록 4개"
```

AI가 focusSpan=15를 진단하면:
- ❌ "15분 블록 × 4개 = 60분"
- ✅ "한 번에 3p씩 끊어서 읽어" → `chunkSize: 3` (분량 단위)

Plan 출력 필드:
- `dailyTarget`: 숫자 (pages, problems, lectures)
- `unit`: "page" | "problem" | "lecture" | "word" | "paper" | "milestone"
- `chunkSize`: 한 번에 할 분량 (focusSpan 기반, optional)

---

## 1. 멀티턴 워크플로우 TC 형식

### 왜 바꾸는가

기존 TC: `input(모든 정보) → output(plan)` — 단일턴.
실제 AddPlan: `경로 진입 → 인터뷰 2-5문 → plan 생성 → 확인` — 멀티턴.

AI 코치는 **대화를 통해 정보를 수집하고 판단**해야 한다.

### 새로운 TC 형식

```jsonc
{
  "id": "tc-04",
  "category": "exam-university",
  "name": "Marcus — Orgo II (산만, 15min focus)",
  "path": "E",  // E/R/A/W/P/O 경로
  "emotionProtocol": "frustration",

  // 유저 프로필 (세션에 이미 있는 정보)
  "profile": {
    "role": "student",
    "year": "sophomore",
    "level": "capable",
    "focusSpan": 15,
    "timeBudget": { "weekday": 120, "weekend": 120 }
  },

  // 멀티턴 대화
  "conversation": [
    {
      "turn": 1,
      "user": "Organic chemistry 2 exam in 10 days. I have the McMurry textbook, about 200 pages.",
      "expectedAI": {
        "action": "ask",
        "mustAsk": "practiceProblemsCount",
        "reason": "수량 모르면 Plan 2 생성 불가",
        "mustDiagnose": ["focusSpan=15 → 분량 chunk 필요"],
        "mustNotDo": ["plan 바로 생성 (정보 부족)"]
      }
    },
    {
      "turn": 2,
      "user": "I have practice problems but I'm not sure how many. Maybe around 80?",
      "expectedAI": {
        "action": "generate_plan",
        "plans": [
          {
            "label": "McMurry Orgo II 교재",
            "type": "read",
            "dailyTarget": { "value": 20, "unit": "page" },
            "chunkSize": 3,
            "totalQuantity": 200,
            "effortModel": { "expected": 5.5, "min": 4.8, "max": 7.0, "unit": "page" },
            "priority": "primary"
          },
          {
            "label": "Practice Problems",
            "type": "practice",
            "dailyTarget": { "value": 8, "unit": "problem" },
            "totalQuantity": 80,
            "effortModel": { "expected": 12, "min": 8, "max": 18, "unit": "problem" },
            "priority": "secondary"
          }
        ],
        "timeFit": "deficit",
        "diagnosis": "focusSpan=15 → effective budget ~78min (×0.65), 분량 chunk 3p 단위",
        "strategy": "reading 70% + practice 30% (문제 80개는 중간 분량 → reading 비중 유지)",
        "honestAssessment": "200p + 80문제를 10일 × 78min으로 커버 불가. deficit.",
        "alternatives": [
          {
            "label": "핵심 챕터만",
            "change": "200p → 120p (시험 빈출 챕터)",
            "newTimeFit": "tight"
          },
          {
            "label": "문제 우선",
            "change": "reading 50p skim + 80문제 전부",
            "newTimeFit": "tight"
          }
        ],
        "emotion": {
          "detected": "frustration",
          "tone": "constraint-accepting",
          "mustNotSay": ["try to focus longer", "just study more"]
        }
      }
    }
  ],

  // 검증 기준 (5개 원칙)
  "validation": {
    "diagnosis": {
      "mustIdentify": ["short focusSpan → chunk-based study", "orgo mechanism difficulty"],
      "mustReflectInPlan": "chunkSize or dailyTarget adjusted for focusSpan"
    },
    "strategy": {
      "expectedType": "deficit-options",
      "mustProvideAlternatives": true,
      "alternativesMinCount": 2
    },
    "questions": {
      "turn1MustAsk": ["practiceProblemsCount"],
      "maxQuestionsPerTurn": 2
    },
    "honesty": {
      "expectedTimeFit": "deficit",
      "mustNotFalsePlan": true
    },
    "emotion": {
      "expected": "frustration",
      "mustNotSay": ["try harder", "focus longer"],
      "toneExpected": "constraint-accepting"
    }
  }
}
```

### 단일턴 vs 멀티턴 결정 기준

| 상황 | 턴 수 | 이유 |
|------|------|------|
| 정보 완전 (tc-03) | 1턴 | 모든 정보 있음 → 바로 plan |
| 정보 부분 누락 (tc-04) | 2턴 | 수량 모름 → 질문 → plan |
| 정보 대부분 누락 (tc-09) | 3턴 | 과목, 자료, 마감 전부 모름 |
| 감정 위기 (tc-05 D-3 panic) | 1턴 | 감정 대응 + triage 즉시 필요 |
| Replan (tc-37) | 2턴 | "왜 밀렸어?" → 답변 → 재계획 |

---

## 2. 5개 원칙 → AI 출력 매핑

### 원칙 1: 진단 (Diagnosis) → plan 구조에 반영

| 진단 | plan에 반영되는 것 |
|------|-------------------|
| focusSpan ≤ 20 | `chunkSize` 축소 (3p, 2문제 등) |
| isRetake + 약점 | 약점 자료 `priority: "primary"`, 나머지 `secondary` |
| "개념은 아는데" | `type: "simulate"` plan 추가 (시험 시뮬레이션) |
| behind on lectures | `dailyTarget` 현실적 (1개/day, 2개 아님) |

### 원칙 2: 전략 (Strategy) → plan 구성 결정

| timeFit | AI가 만드는 plan 구성 |
|---------|---------------------|
| fits | 자료 전체 커버, review plan 추가 가능 |
| tight | 핵심 자료 위주, low-priority cut 표시 |
| deficit | `alternatives[]` 필수 (2개+), 각각 실제 분량/timeFit |
| impossible | `triage` plan: must/should/cut 분류, cut에 이유 명시 |

### 원칙 3: 질문 (Questions) → plan 생성 게이팅

```
정보 부족 → AI가 질문 (turn N)
          → 유저 답변 (turn N+1)  
          → 답변 반영하여 plan 생성 (turn N+1의 expectedAI)

정보 완전 → 질문 없이 바로 plan 생성 (turn 1)
```

질문은 **plan을 바꾸는 것만**:
- ✅ "문제 몇 개야?" → Plan 2 존재 결정
- ✅ "배속 몇 배?" → 시간 30% 차이
- ❌ "어떤 과목이 좋아?" → plan 안 바뀜

### 원칙 4: 현실 직면 (Honesty) → alternatives에 실제 분량

```jsonc
// v1: 프롬프트 도메인 지식 기반 (대략적)
"alternatives": [
  {
    "label": "범위 축소",
    "change": "200p → 120p",         // AI가 판단
    "newDailyTarget": 12,             // Engine 계산 (120÷10)
    "newTimeFit": "tight"             // Engine 판정
  }
]

// v1.5+: RAG 기반 (정확한 데이터)
// → 시험 출제 빈도, 합격 커트라인 등 외부 데이터로 정밀한 대안
```

### 원칙 5: 감정 (Emotion) → plan 자체 변경

| 감정 | plan 구조 변화 |
|------|---------------|
| neutral | 표준 plan |
| panic (D-3) | triage plan: must/should/cut |
| shame (재수) | "지금부터 재계산" plan, 과거 언급 없음 |
| frustration | 약점 기반 재구성, 작은 단위 chunk |
| burnout | recovery plan: Day 1-3 최소 분량 → 점진적 복귀 |

---

## 3. 파이프라인 변경

### v5 (현재)
```
Engine(plan 생성) → AI(코멘트 추가) → merge
```

### v6 (목표)
```
Turn 1: AI(input 분석 → 질문 or plan 생성)
  ├── 정보 부족 → 질문 반환 (plan 없음)
  └── 정보 충분 → Engine(수학) 호출 → plan 구조 생성

Turn 2+ (질문한 경우):
  └── 유저 답변 + 기존 컨텍스트 → Engine(수학) → plan 구조 생성
```

### AI가 Engine을 호출하는 방식

```
AI → "McMurry 200p, orgo intermediate, 10 days, 78min effective budget"
Engine → { dailyTarget: 11, effortModel: {5.5, page}, timeFit: "deficit" }
AI → plan 구조에 Engine 결과 반영 + 전략/대안/감정 추가
```

**핵심**: AI가 Engine에 "뭘 계산해"라고 지시. Engine이 AI에게 "이렇게 해"라고 지시하는 게 아님.

### 구현 옵션

**Option A: Tool Calling** (Qwen flash 지원)
```
AI가 calculate() 함수를 tool로 호출
→ Engine이 결과 반환
→ AI가 결과를 plan에 포함
```

**Option B: Pre-calculate + Inject** (현재 v5 방식 확장)
```
모든 가능한 계산을 Engine이 미리 수행
→ AI에게 계산 결과 테이블 제공
→ AI가 전략에 맞는 결과 선택
```

**Option C: 2-Turn Pipeline** (가장 단순)
```
Turn 1: AI가 전략 결정 + Engine 지시서 출력
Turn 2: Engine 계산 → AI가 최종 plan 조합
```

**추천: Option B** (v1) → **Option A** (v1.5)
- v1은 pre-calculate가 가장 안정적 (tool calling 실패 리스크 없음)
- v1.5에서 Qwen tool calling 도입

---

## 4. 검증 방법

### 멀티턴 검증

```typescript
async function validateMultiTurn(tc: TestCaseV6) {
  let context = { profile: tc.profile };
  
  for (const turn of tc.conversation) {
    // 유저 메시지 추가
    context.messages.push({ role: "user", content: turn.user });
    
    // AI 응답
    const aiResponse = await callAICoach(context);
    
    // 턴별 검증
    if (turn.expectedAI.action === "ask") {
      // 질문 검증: mustAsk 키워드가 질문에 포함되는가
      validateQuestion(aiResponse, turn.expectedAI);
    } else if (turn.expectedAI.action === "generate_plan") {
      // plan 검증: 5개 원칙 모두 체크
      validatePlan(aiResponse, turn.expectedAI, tc.validation);
    }
    
    // 다음 턴을 위해 AI 응답 추가
    context.messages.push({ role: "assistant", content: aiResponse });
  }
}
```

### 5개 원칙 검증 체크리스트

```
□ 진단: mustIdentify 항목이 diagnosis/plan에 반영됐는가
□ 전략: timeFit에 맞는 plan 구성인가 (deficit → alternatives 있는가)
□ 질문: turn 1에서 정보 부족 시 mustAsk를 물었는가
□ 현실: deficit인데 fits로 속이지 않았는가 (HFG-1)
□ 감정: emotion에 맞는 톤 + plan 구조인가
```

### 비결정성 처리

- 턴별 키워드 매칭 (질문 내용, plan 필드)
- 5회 실행 → 80%+ 통과율
- Engine 숫자는 결정론적 (100%)

---

## 5. TC 변환 규칙

### 기존 TC → 새 TC 변환 시:

1. `userMessage` → `conversation[0].user`로 이동
2. 정보 완전한 TC → 1턴 conversation
3. 정보 부족한 TC (expectedQuestions.required 있음) → 2턴+
   - Turn 1: 원래 userMessage (정보 부족)
   - Turn 2: 부족한 정보 답변 + plan 생성
4. `expectedStrategy` → `validation.strategy` + `conversation[N].expectedAI.strategy`
5. `expectedTimeFit` → `validation.honesty.expectedTimeFit` + plan의 `timeFit`
6. `effortModel` → plan 내부 `effortModel`
7. `emotionProtocol` → `validation.emotion.expected` + plan의 `emotion`
8. `toneExpectation` → `validation.emotion.toneExpected` + `mustNotSay`
9. `expectedQuestions.required` → `conversation[0].expectedAI.mustAsk`
10. `alternatives` → `conversation[last].expectedAI.alternatives`

### 경로(path) 매핑

| category | path |
|----------|------|
| exam-university, exam-highschool, exam-cert, cross-profile | E |
| read | R |
| assignment | A |
| watch | W |
| practice | P |
| multi-subject | E (복수) |
| replan | 원래 경로 + replan 플래그 |

---

## 6. 실행 순서

```
STEP 1: data/legacy-v4/ 백업 ✅ (완료)

STEP 2: TC 변환 (서브에이전트)
  - Batch 1: exam-university (tc-01~10) 
  - Batch 2: exam-highschool + exam-cert (tc-11~18)
  - Batch 3: read + assignment (tc-19~26)
  - Batch 4: watch + practice (tc-27~32)
  - Batch 5: cross-profile + replan + multi (tc-33~42)

STEP 3: src/prompt-v6.ts — AI-first 시스템 프롬프트
  - 5개 원칙 + Todait 분량 기반 원칙
  - 멀티턴 대화 지원
  - Engine 호출 규칙 (Option B: pre-calculate)

STEP 4: src/pipeline-v6.ts — 멀티턴 파이프라인
  - conversation 순회
  - 턴별 AI 호출 + 검증

STEP 5: src/validator-v6.ts — 5개 원칙 검증
  - 턴별 action 검증 (ask vs generate_plan)
  - plan 구조 검증 (dailyTarget, unit, chunkSize)
  - 5개 원칙 체크리스트

STEP 6: run-all-v6 실행 → 결과 리포트
  - 목표: 38+/42 TC 통과 (5회 평균 80%+)

STEP 7: 프롬프트 튜닝 (최대 3라운드)
```

---

## 7. ⚠️ 제약사항

1. **Todait는 분량 기반** — 시간 블록/포모도로 세션을 plan에 넣지 않음
2. **v1은 RAG 없음** — 대안 숫자는 프롬프트 도메인 지식 범위 내
3. **Engine은 수학 도구** — AI가 "뭘 계산해" 지시, Engine이 결과 반환
4. **기존 data/input/, data/expected/ 원본 유지** — legacy-v4/ 백업
5. **멀티턴 TC는 data/v6/ 폴더에 생성** — 기존 단일턴과 분리
6. **enable_thinking: true 유지**

---

*작성: 2026-03-21 15:33 | MUSE*
*기존 자산: Engine 44/44 (수학), v5 프롬프트 (원칙 기반), validator (확장 필요)*
*핵심 전환: AI = 코멘트 작성자 → AI = plan 구조 생성자*
