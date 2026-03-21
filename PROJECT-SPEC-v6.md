# PROJECT-SPEC v6 — AI Study Coach

> **한줄**: AI가 선택지 기반 인터뷰로 유저 상황을 파악하고, SMART+CPI 기준의 실행 가능한 학습 계획을 만든다.

---

## 1. 제품 원칙

### Todait는 분량 기반 플래너
```
✅ "오늘 14페이지" / "문제 4개" / "강의 2개"
❌ "09:00-09:30 읽기" / "포모도로 15분 4블록"
```

### AI = 질문 전문가 (콘텐츠 전문가 ❌)
```
✅ "어려운 부분 있어?" → 유저가 말함 → plan에 반영
❌ "Ch.12가 메커니즘이니까 거기부터 해" → 과목 지식 환각 위험
```

### 선택지 기반 인터뷰 (자유 채팅 ❌)
```
매 질문: 선택지 3개 이내 + ✏️ 직접 입력 + 🤷 잘 모르겠어
→ Claude Code의 AskUserQuestion 패턴
→ 유저는 탭만. 타이핑 최소.
```

### Profile은 이미 있다
온보딩(Phase 1)에서 받은 데이터. AddPlan에서 다시 안 물어본다.
```
{ role, year, level, focusSpan, tone, timeBudget }
```
AI는 이 데이터를 받고 시작. focusSpan=15이면 묻지 않고 dailyTarget에 자동 반영.

---

## 2. 유저 플로우

### Step 1: 경로 선택 (UI, AI 없음)
```
📝 시험 준비 | 📚 책 읽기 | 📋 과제
▶️ 강의      | ✏️ 연습    | 🤷 잘 모르겠어
```

### Step 2: 기본 정보 (UI, AI 없음)
```
과목명: [________________]
마감/시험일: [📅 날짜 선택]
```

### Step 3: 자료 + 분량 파악 (🤖 AI 호출 #1)
```
코치: "어떤 자료로 공부해?"
  📖 교재 | 📝 문제집 | 🎥 강의 | 📄 노트 | ➕ 여러 개

코치: "분량은?"
  ✏️ [교재명, 200페이지]

코치: "문제집은 몇 문제?"
  1️⃣ 50이하 | 2️⃣ 50-100 | 3️⃣ 100+ | 🤷

  [🤷인 경우]
  코치: "한 챕터에 문제 몇 개?"
    1️⃣ 5이하 | 2️⃣ 5-10 | 3️⃣ 10+ | 🤷
  코치: "시험 범위 몇 챕터?"
    1️⃣ 3-4 | 2️⃣ 5-6 | 3️⃣ 7+ | 🤷
  → AI 추정 (e.g., 7개 × 6챕터 = ~42문제)
  
  [🤷🤷 재시도도 모를 경우]
  → "일단 교재부터 시작하고, 문제집 분량 알게 되면 알려줘. 바로 추가해줄게."
  → Plan 1만 생성, Plan 2는 대기 상태
```

### Step 4: 약점/상황 진단 (🤖 AI 호출 #2)
```
코치: "이 과목에서 특별히 어려운 부분 있어?"
  1️⃣ 있어 | 2️⃣ 전체적으로 어려워 | 3️⃣ 대체로 괜찮아 | 🤷

  [1️⃣ 있어]
  코치: "대략 전체의 몇 %?"
    1️⃣ 20-30% | 2️⃣ 40-60% | 3️⃣ 70%+ | 🤷
```

### Step 5: 계획 제안 (🤖 AI 호출 #3 — 진단+전략+현실+CPI+감정 통합)
```
코치: "정리해볼게. [상황 요약 + 솔직한 판단]

      [CPI 제안: Exam 경로일 때]
      읽기만 하면 시험에서 막혀.
      문제를 읽은 범위에서 같이 풀면
      진짜 아는 건지 확인이 돼."

📋 추천 계획:
  📖 교재 — 매일 Xp, Y일
  ✏️ 문제 — 매일 X문제, Y일 병행 (읽은 범위에서)
  ⚠️ 커버리지: 전체의 Z%

  1️⃣ 이대로 시작
  2️⃣ 다른 옵션 보여줘
  3️⃣ 직접 조정할래
```

### Step 6: 대안 (유저가 "다른 옵션" 선택 시)
```
코치: "다른 방법도 있어:"

  옵션 A: [추천. 구체적 분량 + timeFit]
  옵션 B: [다른 전략. 구체적 분량 + timeFit]
  옵션 C: [또 다른 전략. 구체적 분량 + timeFit]

  1️⃣ A | 2️⃣ B | 3️⃣ C | ✏️ 직접 조정
```

### Step 7: 확인 → Plan 생성 (UI)
```
코치: "[격려 + 핵심 전략 한 줄]"
  [시작하기 ✅]
→ Todait Plan 생성
```

---

## 3. 평가 기준 — 3축

### 축 1: SMART (계획 구조 품질)

| 기준 | 설명 | 검증 |
|------|------|------|
| **S**pecific | 과목/자료/분량이 구체적으로 특정 | plan에 label + totalQuantity 있음 |
| **M**easurable | dailyTarget이 숫자 | "14p/day", "4문제/day" |
| **A**chievable | profile(focusSpan/level) + timeFit 반영 | deficit이면 대안 제시, beginner면 시간 경고 |
| **R**elevant | 약점/우선순위 반영 | 어려운 부분 → priority primary |
| **T**ime-bound | 마감 기반 일정 | 시험일까지 역산된 일별 분량 |

### 축 2: CPI (학습 효과 — 인출 유도)

| 기준 | 설명 | 적용 시점 |
|------|------|----------|
| **C**overage | 전체 대비 커버리지 % 명시 | 항상 (150/200 = 75%) |
| **P**ractice | 인출 연습 **제안** | 시험(E) 경로에서 제안. 문제집 있으면 "읽은 범위에서 풀기", 없으면 "핵심 개념 떠올려보기" 제안 |
| **I**nsight | 이해도 확인 구조 **제안** | 시험(E) 경로에서 제안. "틀린 문제 다음날 다시", "어려운 부분 먼저" 등 |

> CPI는 **강제가 아니라 제안**. 모든 카테고리에서 다 넣을 필요 없음.
> 시험(E) 경로에서 주로 적용. 읽기(R), 강의(W) 등은 상황에 따라.

### 축 3: 코치 4원칙 (코칭 과정 품질)

| 원칙 | 설명 | Hard Fail |
|------|------|-----------|
| **진단** | profile + 유저 답변 → 상황 정확히 파악 | focusSpan 무시하고 full budget 계산 |
| **전략** | 상황에 맞는 전략 선택 | deficit인데 균등 분배만 |
| **현실 직면** | timeFit 솔직 + 대안 | deficit인데 "충분히 할 수 있어" (HFG-1) |
| **감정 대응** | emotion 맞는 톤 + mustNotSay 위반 없음 | shame인데 "왜 안 했어" |

---

## 4. 핵심 규칙

### 선택지 규칙
```
1. 매 질문: 최대 3개 선택지 + ✏️ 직접입력 + 🤷
2. 각 선택지는 plan에 다른 영향을 줘야 함 (장식 선택지 ❌)
3. 🤷 → 한 단계 쉬운 질문으로 재시도
4. 🤷🤷 → Smart Default + "나중에 알려주면 조정"
5. 분량을 모른다고 넘어가지 않음 — 추정 질문으로 근사값 확보
```

### Profile 규칙
```
1. focusSpan, level, role, year는 이미 있음 — 다시 안 물어봄
2. focusSpan → dailyTarget 숫자에 자동 반영 (chunk 개념 없음)
3. level → 시간 경고 수준 조정 (beginner는 "시간 더 걸릴 수 있어")
4. tone → 코치 메시지 톤 조정
```

### 분기 규칙
```
1. 같은 유저가 다른 선택지 → 다른 plan 구조 (핵심 검증)
2. "어려운 부분 있어" vs "전체 어려워" vs "🤷" → 3개의 다른 plan
3. 대안(옵션 A/B/C)은 구조가 달라야 함 (숫자만 바꾸기 ❌)
```

### Hard Fail Gates (자동 FAIL)
```
HFG-1: deficit인데 "할 수 있어" → 거짓 계획 금지
HFG-2: mustNotSay 위반 → 감정 프로토콜 위반
HFG-3: 분량 모르는데 넘어감 → 추정도 안 하고 plan 생성
HFG-4: 시간 기반 plan 생성 → Todait는 분량 기반
HFG-5: profile 데이터 무시 → focusSpan/level 미반영
```

---

## 5. TC 구조

### 형식
```jsonc
{
  "id": "tc-04",
  "category": "exam-university",
  "name": "Marcus — Orgo II",
  "path": "E",
  
  "profile": {
    "role": "student", "year": "sophomore",
    "level": "capable", "focusSpan": 15,
    "timeBudget": { "weekday": 120, "weekend": 120 }
  },

  "paths": {
    "A": {
      "label": "약점 특정 (Golden Path)",
      "conversation": [
        {
          "turn": 1,
          "user": "Organic chemistry 2 exam in 10 days. McMurry textbook, 200 pages.",
          "expectedAI": {
            "action": "ask",
            "choices": [
              { "text": "50개 이하", "planImpact": "..." },
              { "text": "50-100개", "planImpact": "..." },
              { "text": "100개 이상", "planImpact": "..." },
              { "text": "🤷 잘 모르겠어", "planImpact": "추정 질문으로 전환" }
            ],
            "question": "문제집 분량"
          }
        },
        {
          "turn": 2,
          "user": "About 80 problems. The mechanism part is hard, maybe 20-30% of the material.",
          "expectedAI": {
            "action": "generate_plan",
            "mustInclude": {
              "smart": {
                "specific": "자료별 분량 분리",
                "measurable": "dailyTarget 숫자",
                "achievable": "focusSpan=15 반영, deficit 경고",
                "relevant": "어려운 부분 우선",
                "timeBound": "10일 역산"
              },
              "cpi": {
                "coverage": "전체 대비 % 명시",
                "practice": "문제를 읽은 범위에서 풀기 제안",
                "insight": "틀린 문제 복습 제안"
              },
              "coach": {
                "diagnosis": "focusSpan=15 → budget 축소 반영",
                "strategy": "weakness-first + 핵심 선별",
                "honesty": "deficit → 솔직 + 대안 2개+",
                "emotion": "frustration → 자책 없이 현실적"
              }
            }
          }
        }
      ]
    },
    "B": {
      "label": "전체 어려움 (Variant)",
      "conversation": [
        {
          "turn": 1,
          "user": "Organic chemistry 2 exam in 10 days. McMurry textbook, 200 pages.",
          "expectedAI": { "action": "ask", "question": "문제집 분량" }
        },
        {
          "turn": 2,
          "user": "About 80 problems. The whole subject is hard.",
          "expectedAI": {
            "action": "generate_plan",
            "mustDifferFrom": "path_A",
            "mustInclude": {
              "smart": { "achievable": "전체 어려우면 pace 더 느려짐" },
              "coach": {
                "strategy": "균등 분배 (약점 특정 불가)",
                "honesty": "더 심한 deficit 가능"
              }
            }
          }
        }
      ]
    },
    "C": {
      "label": "🤷 체인 (모르겠어)",
      "conversation": [
        {
          "turn": 1,
          "user": "Organic chemistry 2 exam in 10 days. McMurry textbook, 200 pages.",
          "expectedAI": { "action": "ask", "question": "문제집 분량" }
        },
        {
          "turn": 2,
          "user": "I have a problem set but I have no idea how many. And I don't know what's hard yet.",
          "expectedAI": {
            "action": "ask",
            "question": "챕터당 문제수 + 범위 추정",
            "mustNotDo": ["분량 모른 채 plan 생성", "넘어가기"]
          }
        },
        {
          "turn": 3,
          "user": "Maybe 5-10 per chapter, 5-6 chapters.",
          "expectedAI": {
            "action": "generate_plan",
            "mustDifferFrom": "path_A",
            "mustInclude": {
              "smart": { "relevant": "약점 모르니 균등 + 리밸런스 제안" },
              "coach": {
                "strategy": "Smart Default + 3일 후 재조정 안내"
              }
            }
          }
        }
      ]
    }
  },

  "hardFailGates": ["HFG-1", "HFG-2", "HFG-3", "HFG-5"],
  "emotionProtocol": "frustration"
}
```

### TC 배치 구성 (44 TC × 3 paths = 132 paths)

| Batch | TC | Category | 수량 |
|-------|-----|----------|------|
| 1 | tc-01~10 | exam-university | 10 × 3 = 30 |
| 2 | tc-11~18 | exam-highschool + cert | 8 × 3 = 24 |
| 3 | tc-19~26 | read + assignment | 8 × 3 = 24 |
| 4 | tc-27~32 | watch + practice | 6 × 3 = 18 |
| 5 | tc-33~42 | cross + replan + multi | 12 × 3 = 36 |

---

## 6. 검증 방법 — LLM-as-Judge

### 왜 키워드 매칭이 안 되는가
```
❌ "strategy" 필드에 "weakness-first" 포함? → 단어 있어도 plan이 실제로 약점 우선 아닐 수 있음
❌ dailyTarget == 14? → 숫자 맞아도 전략이 틀릴 수 있음
```

### LLM-as-Judge 방식
Qwen이 생성한 응답을 **Claude가 3축 기준으로 평가**

```
Judge 입력:
  1. TC 시나리오 (profile + conversation)
  2. Qwen 실제 응답
  3. 평가 기준 (SMART + CPI + Coach)

Judge 출력:
  {
    "smart": {
      "specific": { "score": 2, "reason": "자료별 분량 분리됨" },
      "measurable": { "score": 2, "reason": "14p/day, 4문제/day" },
      "achievable": { "score": 1, "reason": "focusSpan 반영했지만 budget 계산 부정확" },
      "relevant": { "score": 2, "reason": "어려운 부분 우선" },
      "timeBound": { "score": 2, "reason": "10일 역산" }
    },
    "cpi": {
      "coverage": { "score": 2, "reason": "75% 명시" },
      "practice": { "score": 2, "reason": "읽은 범위에서 문제 풀기 제안" },
      "insight": { "score": 1, "reason": "틀린 문제 복습 언급 없음" }
    },
    "coach": {
      "diagnosis": { "score": 2, "reason": "focusSpan + 약점 파악" },
      "strategy": { "score": 2, "reason": "weakness-first + 핵심 선별" },
      "honesty": { "score": 2, "reason": "deficit 솔직 + 대안 2개" },
      "emotion": { "score": 2, "reason": "frustration 톤 적절" }
    },
    "hardFails": [],
    "totalScore": 21,
    "maxScore": 24,
    "pass": true
  }
```

### 스코어링
```
각 항목: 0 (미달) / 1 (부분) / 2 (충족)
SMART: 5항목 × 2점 = 10점
CPI: 3항목 × 2점 = 6점 (Exam 경로. 다른 경로는 해당 항목만)
Coach: 4항목 × 2점 = 8점
총점: 24점 (Exam 기준)

Pass 기준:
  총점 18+ (75%+)
  Hard Fail 0개
  Coach 각 항목 1점 이상

Ship Gate:
  전체 TC 평균 80%+
  Hard Fail 0
  Path A ≠ Path B ≠ Path C (plan 구조 차이 확인)
```

### Judge 프롬프트 (Claude Code용)
```
너는 AI Study Coach 품질 평가관이다.

Qwen이 생성한 학습 코칭 응답을 3축 기준으로 평가해.

[SMART 기준]
S: 과목/자료/분량이 구체적으로 특정됐는가
M: dailyTarget이 숫자로 나왔는가
A: profile(focusSpan/level) + timeFit이 현실적으로 반영됐는가
R: 약점/우선순위가 plan 구조에 반영됐는가
T: 마감 기반으로 일정이 역산됐는가

[CPI 기준] (시험 경로만 필수, 나머지 경로는 보너스)
C: 전체 대비 커버리지 %가 명시됐는가
P: 인출 연습(문제풀기, 셀프테스트)이 제안됐는가
I: 이해도 확인 구조(틀린 문제 복습 등)가 제안됐는가

[Coach 기준]
진단: profile + 유저 답변이 plan에 실제로 반영됐는가
전략: timeFit에 맞는 전략인가 (deficit→대안, fits→최적화)
현실: timeFit을 솔직하게 전달했는가 (deficit인데 괜찮다고 하면 0점)
감정: emotion에 맞는 톤인가, mustNotSay 위반 없는가

[Hard Fail]
다음 중 하나라도 있으면 전체 FAIL:
- HFG-1: deficit인데 "충분히 할 수 있어"
- HFG-2: mustNotSay 위반
- HFG-3: 분량 모르는데 추정 없이 plan 생성
- HFG-4: 시간 기반 plan (포모도로 등)
- HFG-5: profile 데이터(focusSpan/level) 완전 무시

각 항목을 0/1/2로 평가하고, 이유를 한 줄로 써.
```

### 분기 검증 (Path Differentiation)
```
같은 TC의 Path A/B/C 결과를 비교:
  - plan 수가 다른가
  - dailyTarget이 다른가
  - 우선순위가 다른가
  - 전략이 다른가
  
  최소 2개 이상 차이 → PASS
  1개 이하 차이 → "분기 미반영" FAIL
```

---

## 7. 파이프라인 아키텍처

### 전체 흐름
```
TC 로드 → Path 선택 (A/B/C)
  → Turn 1: user message → Qwen 호출 → 응답 검증
  → Turn 2+: user message + context → Qwen 호출 → 응답 검증
  → 최종 plan 추출 → Judge(Claude) 평가
  → 스코어 + Pass/Fail 리포트
```

### Qwen 출력 형식 (매 턴)
```json
{
  "message": "코치 메시지 (유저에게 보이는 텍스트)",
  "choices": [
    { "id": "1", "text": "선택지 텍스트" },
    { "id": "2", "text": "..." },
    { "id": "3", "text": "..." },
    { "id": "free", "text": "직접 입력" },
    { "id": "idk", "text": "🤷 잘 모르겠어" }
  ],
  "action": "ask",
  "reasoning": "이 질문을 하는 이유"
}
```

또는 plan 생성 시:
```json
{
  "message": "코치 메시지 (상황 요약 + 솔직한 판단 + CPI 제안)",
  "plans": [
    {
      "label": "자료명",
      "type": "read|practice|watch|...",
      "dailyTarget": { "value": 14, "unit": "page" },
      "totalQuantity": 200,
      "duration": 10,
      "priority": "primary|secondary"
    }
  ],
  "timeFit": "fits|tight|deficit|impossible",
  "coverage": "150/200 (75%)",
  "alternatives": [
    {
      "label": "옵션명",
      "change": "구체적 변경 내용",
      "newTimeFit": "tight"
    }
  ],
  "choices": [
    { "id": "1", "text": "이대로 시작" },
    { "id": "2", "text": "다른 옵션 보여줘" },
    { "id": "3", "text": "직접 조정할래" }
  ],
  "action": "generate_plan"
}
```

### Engine 연동 (Option B: Pre-calculate)
```
파이프라인이 TC 데이터로 가능한 계산을 미리 수행:
  - 전체 커버: 200p ÷ 10일 = 20p/day, timeFit=deficit (budget 78min)
  - 핵심만: 120p ÷ 10일 = 12p/day, timeFit=tight
  - 문제만: 80개 ÷ 10일 = 8개/day

이 결과를 Qwen system prompt에 주입:
  "Engine 계산 결과: [위 데이터]. 이 숫자를 기반으로 전략을 세워."
```

---

## 8. 실행 순서

```
Phase 1: 문서 (이 문서 + GUIDE)
  ✅ PROJECT-SPEC-v6.md — 전체 설계 명세
  □ GUIDE-v6-ai-coach.md — Claude Code 구현 가이드 (업데이트)

Phase 2: TC 생성 (서브에이전트)
  □ 44 TC × 3 paths = 132 conversation paths
  □ 서브에이전트 5개 → 생성
  □ 서브에이전트 5개 → 1차 리뷰 + 개선
  □ 서브에이전트 5개 → 2차 리뷰 + 최종 확정

Phase 3: 구현 (Claude Code)
  □ src/prompt-v6.ts — Qwen 시스템 프롬프트
  □ src/pipeline-v6.ts — 멀티턴 파이프라인 + Engine pre-calc
  □ src/judge.ts — Claude LLM-as-Judge
  □ src/validator-v6.ts — HFG + 분기 검증
  □ src/index.ts — run-v6, run-all-v6 CLI

Phase 4: 실행 + 튜닝 (Claude Code)
  □ run-all-v6 → 132 paths 실행
  □ Judge 평가 → 스코어 리포트
  □ 프롬프트 튜닝 (최대 3라운드)

Ship Gate:
  전체 평균 80%+ (19.2/24+)
  Hard Fail 0
  Path 분기 85%+ (A≠B≠C)
```

---

*작성: 2026-03-21 17:30 | MUSE*
