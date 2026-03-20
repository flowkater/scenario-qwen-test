# Plan Engine 3-Layer 분리 — 구현 명세서

> **목적**: prompt.ts 1,375줄의 하드코딩 프롬프트를 **3개 레이어**(Engine + Coach + Validator)로 분리하여 42/42 TC를 **100% 안정적으로** 통과시킨다.
> **핵심 원칙**: 계산은 코드로, 판단은 AI로, 검증은 코드로.
> **언어**: TypeScript + Node.js (tsx 실행)
> **성공 조건**: `run-all` 100회 실행 시 100회 모두 42/42 PASS (산술 부분)

---

## 0. 반드시 먼저 읽어야 할 파일

1. **현재 프롬프트 (분리 원본)**: `src/prompt.ts` — 1,375줄. 여기서 계산 로직을 추출
2. **TC v4 원본**: `docs/AI-Coach-42-Test-Cases-v4.md` — 마스터 테이블과 TC 상세
3. **타입 정의**: `src/types.ts` — v4 스키마
4. **42개 입력**: `data/input/tc-*.json`
5. **42개 기대값**: `data/expected/tc-*.json`
6. **현재 검증기**: `src/validator.ts` — 6단계 검증 (참고용, 리팩토링 대상)
7. **최종 리포트**: `final_report.md` — 간헐 실패 패턴 분석

---

## 1. 목표 아키텍처

```
유저 입력 (TCInput)
      ↓
┌─────────────────────────────────┐
│  Layer 1: Plan Engine (코드)     │  ← 100% 결정론적. AI 호출 없음.
│  - Rate Table lookup             │
│  - 산술 계산 (총시간, 하루분량)    │
│  - timeFit 판정                  │
│  - PlanGroup 번들링              │
│  - warnings 생성                 │
│  출력: PlanSkeleton              │
└─────────────────────────────────┘
      ↓
┌─────────────────────────────────┐
│  Layer 2: AI Coach (Qwen API)    │  ← 확률적. 톤/감정/전략만 담당.
│  - 감정 프로토콜 감지             │
│  - 코치 코멘트 생성              │
│  - 전략 서사 작성                │
│  - 추가 질문 제안 (0-3개)        │
│  출력: CoachOutput               │
└─────────────────────────────────┘
      ↓
┌─────────────────────────────────┐
│  Layer 3: Merge + Validate       │
│  - PlanSkeleton + CoachOutput 합성│
│  - 6단계 검증 (기존 유지)         │
│  출력: FullOutput + ValidationResult│
└─────────────────────────────────┘
```

---

## 2. 프로젝트 구조

```
scenario-qwen-test/
├── src/
│   ├── engine/                    # 🔨 NEW — Layer 1
│   │   ├── rates.ts               # 마스터 테이블 (v4 문서에서 추출)
│   │   ├── matcher.ts             # 입력 → rate key 매칭
│   │   ├── calculator.ts          # 산술 계산 + timeFit 판정
│   │   ├── skeleton.ts            # PlanSkeleton 생성 (통합)
│   │   ├── index.ts               # engine public API
│   │   └── handlers/              # 경로별 핸들러
│   │       ├── exam.ts            # Exam 경로 (PlanGroup 번들)
│   │       ├── read.ts            # Read 경로
│   │       ├── watch.ts           # Watch 경로
│   │       ├── practice.ts        # Practice 경로
│   │       ├── assignment.ts      # Assignment 경로
│   │       ├── replan.ts          # Replan 경로 (잔여 재계산)
│   │       └── multi.ts           # Multi-subject (글로벌 배분)
│   │
│   ├── coach/                     # 🔨 NEW — Layer 2
│   │   ├── prompt.ts              # 슬림 코칭 프롬프트 (~200줄)
│   │   └── generate.ts            # Qwen API 호출 + 파싱
│   │
│   ├── pipeline.ts                # 🔨 NEW — Layer 1+2+3 통합
│   ├── server.ts                  # 🔨 NEW — HTTP API (demo 연결용)
│   │
│   ├── types.ts                   # 기존 유지 + PlanSkeleton, CoachOutput 추가
│   ├── prompt.ts                  # ⚠️ 구 프롬프트 — 참조용으로 유지, 사용 안 함
│   ├── api.ts                     # 기존 유지 (Qwen API 호출)
│   ├── validator.ts               # 기존 유지 (리팩토링 가능)
│   ├── analyzer.ts                # 기존 유지
│   ├── runner.ts                  # 🔨 리팩토링 — pipeline.ts 사용하도록
│   └── index.ts                   # 🔨 리팩토링 — engine-only 모드 추가
│
├── demo/                          # 기존 데모 웹 (Phase C에서 연결)
├── data/                          # 기존 42 TC 데이터
├── docs/                          # TC v4 원본 문서
└── tests/                         # 🔨 NEW — engine 단위 테스트
    └── engine.test.ts             # 42개 TC engine-only 검증
```

---

## 3. Phase A: Engine 추출 (AI 없이 42/42 산술 정확도 달성)

### 3-1. 타입 추가 (`src/types.ts`)

기존 타입에 아래를 추가:

```typescript
// ===== Plan Engine 출력 =====

export interface RateEntry {
  key: string;              // "econ-intro", "orgo-first", etc.
  p50: number;              // 중앙값
  p25: number;              // 빠른 학습자
  p75: number;              // 느린 학습자
  unit: string;             // "page", "problem", "lecture", etc.
  gating?: string;          // 조건부 적용 조건 (예: "2+ prior attempts")
  citation?: string;        // 학술 출처
}

export interface PlanSkeleton {
  plans: StudyPlan[];        // 완전한 Plan 객체 (effortModel 포함)
  timeFit: TimeFit;          // 코드가 확정한 값
  totalDailyMinutes: number;
  warnings: string[];
  assumptions: string[];
  missingInfo: string[];
  globalBudget?: {           // multi-subject 전용
    totalDailyMin: number;
    allocation: { subject: string; percentage: number }[];
    conflictWarning?: string;
  };
  alternatives?: {           // deficit/impossible 시 대안
    label: string;
    description: string;
    timeFit: TimeFit;
  }[];
  // AI가 채울 필드 (engine에서는 undefined)
  emotionProtocol?: EmotionProtocol;
  coachComment?: string;
  strategy?: string;
  strategyRationale?: string;
  questionsToAsk?: any[];
}

export interface CoachOutput {
  emotionProtocol: EmotionProtocol;
  coachComment: string;
  strategy: string;
  strategyRationale: string;
  questionsToAsk: {
    question: string;
    decisionImpact: string;
  }[];
}
```

### 3-2. Rate Table (`src/engine/rates.ts`)

**prompt.ts의 마스터 테이블 섹션을 데이터 구조로 변환.**
prompt.ts에서 `--- Reading (min/page) ---`, `--- Watch ---`, `--- Practice ---` 섹션을 찾아서 추출.

```typescript
export const RATE_TABLE: Record<string, Record<string, RateEntry>> = {
  reading: {
    "novel-korean": { key: "novel-korean", p50: 2.0, p25: 1.5, p75: 2.5, unit: "page", citation: "한국안과학회지 2016" },
    "selfhelp-casual": { key: "selfhelp-casual", p50: 2.5, p25: 2.0, p75: 3.5, unit: "page" },
    "econ-intro": { key: "econ-intro", p50: 3.0, p25: 2.3, p75: 3.8, unit: "page", citation: "Wake Forest CAT" },
    "general-textbook": { key: "general-textbook", p50: 4.0, p25: 3.0, p75: 5.5, unit: "page" },
    "genetics-bio": { key: "genetics-bio", p50: 5.5, p25: 4.5, p75: 6.5, unit: "page", citation: "WordsRated 5.5, CAT 6.0" },
    "ap-chemistry": { key: "ap-chemistry", p50: 5.0, p25: 4.0, p75: 6.5, unit: "page" },
    "review-book": { key: "review-book", p50: 2.5, p25: 2.0, p75: 3.5, unit: "page" },
    "polisci-monograph": { key: "polisci-monograph", p50: 6.5, p25: 5.0, p75: 9.0, unit: "page", citation: "CAT Engage; Some = 6.7" },
    "orgo-first": { key: "orgo-first", p50: 5.5, p25: 4.8, p75: 7.0, unit: "page" },
    "orgo-mechanisms-first": { key: "orgo-mechanisms-first", p50: 6.0, p25: 5.0, p75: 7.5, unit: "page" },
    "orgo-retake": { key: "orgo-retake", p50: 4.0, p25: 3.2, p75: 5.0, unit: "page" },
    "orgo-3rd": { key: "orgo-3rd", p50: 2.5, p25: 2.0, p75: 3.5, unit: "page", gating: "2+ prior attempts + concept understanding" },
    "anatomy-atlas": { key: "anatomy-atlas", p50: 10, p25: 8, p75: 15, unit: "page", citation: "AUC M1 13-17" },
    "law-cases-irac": { key: "law-cases-irac", p50: 13, p25: 10, p75: 20, unit: "page" },
    "constitutional-law-korean": { key: "constitutional-law-korean", p50: 13, p25: 10, p75: 20, unit: "page" },
    "cpa-review-familiar": { key: "cpa-review-familiar", p50: 3.5, p25: 2.5, p75: 5.0, unit: "page" },
    "cpa-full-retake": { key: "cpa-full-retake", p50: 5.0, p25: 4.0, p75: 6.5, unit: "page" },
    "cpa-cost-weak": { key: "cpa-cost-weak", p50: 9, p25: 7, p75: 12, unit: "page" },
    "pmp-rita": { key: "pmp-rita", p50: 3.0, p25: 2.3, p75: 4.0, unit: "page" },
    "pmp-pmbok": { key: "pmp-pmbok", p50: 6.0, p25: 4.5, p75: 8.0, unit: "page" },
    "suneung-textbook": { key: "suneung-textbook", p50: 2.0, p25: 1.5, p75: 2.5, unit: "page" },
    "jungbo-noncs": { key: "jungbo-noncs", p50: 9, p25: 7, p75: 12, unit: "page", citation: "Korean forum ~9.8" },
    "barbri-outlines": { key: "barbri-outlines", p50: 3.5, p25: 2.8, p75: 5.0, unit: "page" },
    "realtor-law-korean": { key: "realtor-law-korean", p50: 5.0, p25: 4.0, p75: 6.5, unit: "page" },
    "emergency-skim": { key: "emergency-skim", p50: 1.0, p25: 0.8, p75: 1.2, unit: "page" },
  },

  watch: {
    "physics-lecture-50min": { key: "physics-lecture-50min", p50: 100, p25: 75, p75: 150, unit: "lecture" },
    "udemy-coding-8min": { key: "udemy-coding-8min", p50: 16, p25: 12, p75: 24, unit: "lecture" },
    "udemy-coding-beginner": { key: "udemy-coding-beginner", p50: 24, p25: 16, p75: 32, unit: "lecture" },
    "korean-lecture-1x-40min": { key: "korean-lecture-1x-40min", p50: 56, p25: 48, p75: 70, unit: "lecture" },
    "korean-lecture-1.5x-40min": { key: "korean-lecture-1.5x-40min", p50: 42, p25: 35, p75: 55, unit: "lecture" },
    "korean-lecture-unknown-40min": { key: "korean-lecture-unknown-40min", p50: 42, p25: 35, p75: 55, unit: "lecture" },
    "barbri-lecture": { key: "barbri-lecture", p50: 1.4, p25: 1.2, p75: 1.75, unit: "multiplier" },
    "general-passive": { key: "general-passive", p50: 1.5, p25: 1.2, p75: 2.0, unit: "multiplier" },
  },

  practice: {
    "paper-3pass": { key: "paper-3pass", p50: 150, p25: 90, p75: 240, unit: "paper" },
    "paper-pass12": { key: "paper-pass12", p50: 70, p25: 50, p75: 100, unit: "paper" },
    "genetics-problem-first": { key: "genetics-problem-first", p50: 11, p25: 8, p75: 15, unit: "problem" },
    "genetics-problem-review": { key: "genetics-problem-review", p50: 7, p25: 5, p75: 10, unit: "problem" },
    "calc-routine": { key: "calc-routine", p50: 6, p25: 3, p75: 10, unit: "problem" },
    "calc-hard": { key: "calc-hard", p50: 15, p25: 5, p75: 60, unit: "problem" },
    "calc-mixed": { key: "calc-mixed", p50: 12, p25: 8, p75: 18, unit: "problem" },
    "general-math": { key: "general-math", p50: 12, p25: 8, p75: 18, unit: "problem" },
    "srs-word": { key: "srs-word", p50: 1, p25: 0.8, p75: 1.5, unit: "word" },
    "essay-outline": { key: "essay-outline", p50: 65, p25: 50, p75: 90, unit: "milestone" },
    "essay-draft": { key: "essay-draft", p50: 90, p25: 70, p75: 120, unit: "milestone" },
    "essay-revision": { key: "essay-revision", p50: 55, p25: 40, p75: 75, unit: "milestone" },
    "cert-exam-set": { key: "cert-exam-set", p50: 105, p25: 80, p75: 135, unit: "set" },
    "suneung-passage-set": { key: "suneung-passage-set", p50: 8.5, p25: 7.0, p75: 11.0, unit: "set" },
    "coding-project": { key: "coding-project", p50: -1, p25: -1, p75: -1, unit: "milestone" },  // unpredictable
  },

  langExam: {
    "toefl-per-10pts-low": { key: "toefl-per-10pts-low", p50: 70, p25: 60, p75: 80, unit: "hours" },
    "toefl-per-10pts-high": { key: "toefl-per-10pts-high", p50: 135, p25: 120, p75: 150, unit: "hours" },
    "jlpt-n3-to-n2": { key: "jlpt-n3-to-n2", p50: 500, p25: 400, p75: 600, unit: "hours" },
  },
};
```

### 3-3. Rate Matcher (`src/engine/matcher.ts`)

**유저 입력의 키워드를 분석해서 적절한 rate key를 반환.**

```typescript
export function matchReadingRate(
  resource: Resource,
  profile: StudentProfile,
  exam?: ExamDetails,
  input?: TestCaseInput
): RateEntry {
  const desc = (resource.description + " " + (exam?.subject ?? "")).toLowerCase();
  const isRetake = profile.isRetake === true;

  // 키워드 우선순위 매칭 (위에서부터 먼저 매칭)
  const rules: [() => boolean, string][] = [
    // Emergency
    [() => input?.emotionProtocol === "panic" && (exam?.daysLeft ?? 99) <= 1, "emergency-skim"],
    
    // Organic Chemistry (순서 중요: 3rd → retake → first)
    [() => desc.includes("mcmurry") || desc.includes("organic") || desc.includes("orgo"),
      () => {
        if (isThirdAttempt(input)) return "orgo-3rd";
        if (isRetake || desc.includes("retake") || desc.includes("재수강")) return "orgo-retake";
        if (desc.includes("ch.10") || desc.includes("mechanism")) return "orgo-mechanisms-first";
        return "orgo-first";
      }
    ],
    
    // Economics
    [() => desc.includes("mankiw") || desc.includes("econ"), "econ-intro"],
    
    // Science
    [() => desc.includes("genetics") || desc.includes("bio"), "genetics-bio"],
    [() => desc.includes("zumdahl") || desc.includes("ap chem"), "ap-chemistry"],
    [() => desc.includes("netter") || desc.includes("anatomy") || desc.includes("atlas"), "anatomy-atlas"],
    
    // Law
    [() => desc.includes("헌법") || desc.includes("constitutional"), "constitutional-law-korean"],
    [() => desc.includes("irac") || desc.includes("law case") || desc.includes("판례"), "law-cases-irac"],
    [() => desc.includes("barbri") && desc.includes("outline"), "barbri-outlines"],
    
    // Korean certs
    [() => desc.includes("수제비") || desc.includes("정보처리"), "jungbo-noncs"],
    [() => desc.includes("공인중개사") || desc.includes("realtor"), "realtor-law-korean"],
    
    // CPA
    [() => desc.includes("원가") || desc.includes("cost accounting"), "cpa-cost-weak"],
    [() => (desc.includes("cpa") || desc.includes("재무")) && isRetake, "cpa-full-retake"],
    [() => desc.includes("cpa") || desc.includes("재무"), "cpa-review-familiar"],
    
    // PMP
    [() => desc.includes("pmbok"), "pmp-pmbok"],
    [() => desc.includes("rita"), "pmp-rita"],
    
    // 수능
    [() => desc.includes("수능특강"), "suneung-textbook"],
    
    // Discussion/argument
    [() => desc.includes("polisci") || desc.includes("political") || desc.includes("argument"), "polisci-monograph"],
    
    // Review book
    [() => resource.type === "studyGuide" || desc.includes("review"), "review-book"],
    
    // Novel
    [() => desc.includes("harry potter") || desc.includes("소설") || desc.includes("novel"), "novel-korean"],
    
    // Self-help
    [() => desc.includes("atomic habits") || desc.includes("자기계발"), "selfhelp-casual"],
  ];

  for (const [condition, result] of rules) {
    if (condition()) {
      const key = typeof result === "function" ? result() : result;
      return RATE_TABLE.reading[key] ?? RATE_TABLE.reading["general-textbook"];
    }
  }
  
  return RATE_TABLE.reading["general-textbook"];  // fallback
}
```

위는 **pseudocode 예시**. 실제 구현 시 prompt.ts의 모든 rate 매칭 로직을 빠짐없이 이동해야 함.
**검증 방법**: 42개 TC 각각에 대해 `matchReadingRate`가 기대한 rate key를 반환하는지 단위 테스트.

### 3-4. Calculator (`src/engine/calculator.ts`)

**prompt.ts의 `LOCKED CALCULATION` 블록 49개를 일반화한 계산 로직.**

```typescript
export interface CalcInput {
  totalQuantity: number;     // 총 분량 (페이지, 문제, 강의 등)
  rate: RateEntry;           // matchRate 결과
  daysLeft: number;          // 남은 일수
  weekdayBudget: number;     // 주중 예산 (분)
  weekendBudget: number;     // 주말 예산 (분)
  focusSpan?: number;        // 집중 시간 (분)
  effectiveDaysOverride?: number;  // 주중만 공부하는 경우
}

export interface CalcResult {
  totalMinutes: number;      // 총 필요 시간
  effectiveBudget: number;   // focusSpan 보정 후 유효 예산
  effectiveDays: number;     // 유효 학습일 수
  dailyNeedMinutes: number;  // 하루 필요 시간
  weekdayTarget: number;     // 하루 목표 분량
  timeFit: TimeFit;          // fits | tight | deficit | impossible
}

export function calculate(input: CalcInput): CalcResult {
  const { totalQuantity, rate, daysLeft, weekdayBudget, weekendBudget, focusSpan } = input;

  // 1. 총 필요 시간
  const totalMinutes = totalQuantity * rate.p50;

  // 2. 유효 일수 (주말 예산이 0이면 주중만)
  const effectiveDays = input.effectiveDaysOverride
    ?? (weekendBudget === 0 ? Math.ceil(daysLeft * 5 / 7) : daysLeft);

  // 3. 유효 예산 (focusSpan 보정)
  // focusSpan ≤ 20분 → 포모도로 효율 65%
  const effectiveBudget = (focusSpan && focusSpan <= 20)
    ? Math.round(weekdayBudget * 0.65)
    : weekdayBudget;

  // 4. 하루 필요 시간
  const dailyNeedMinutes = effectiveDays > 0
    ? Math.round(totalMinutes / effectiveDays)
    : totalMinutes;  // 0일이면 전체

  // 5. 하루 목표 분량
  const weekdayTarget = effectiveBudget > 0
    ? Math.round(effectiveBudget / rate.p50)
    : 0;

  // 6. timeFit 판정 — 핵심 산술
  const timeFit = determineTimeFit(dailyNeedMinutes, effectiveBudget, weekdayBudget, weekendBudget);

  return { totalMinutes, effectiveBudget, effectiveDays, dailyNeedMinutes, weekdayTarget, timeFit };
}

export function determineTimeFit(
  dailyNeed: number,
  effectiveBudget: number,
  weekdayBudget: number,
  weekendBudget: number,
): TimeFit {
  // 주말 예산이 더 크면 주간 평균 고려 (PMP 패턴)
  if (weekendBudget > weekdayBudget) {
    const weeklyCapacity = weekdayBudget * 5 + weekendBudget * 2;
    const weeklyNeed = dailyNeed * 7;
    if (weeklyNeed <= weeklyCapacity * 1.05) {
      // 주말로 커버 가능 → fits 또는 tight
      return weeklyNeed <= weeklyCapacity * 0.9 ? "fits" : "tight";
    }
  }

  // 기본 판정
  if (dailyNeed > effectiveBudget * 2.0) return "impossible";
  if (dailyNeed > effectiveBudget * 1.2) return "deficit";
  if (dailyNeed > effectiveBudget * 0.9) return "tight";
  return "fits";
}
```

### 3-5. Skeleton Builder (`src/engine/skeleton.ts`)

```typescript
export function buildSkeleton(input: TestCaseInput): PlanSkeleton {
  // 카테고리에 따라 적절한 핸들러 선택
  switch (input.category) {
    case "exam-university":
    case "exam-highschool":
    case "exam-cert":
      return examHandler(input);
    case "read":
      return readHandler(input);
    case "watch":
      return watchHandler(input);
    case "practice":
      return practiceHandler(input);
    case "assignment":
      return assignmentHandler(input);
    case "replan":
      return replanHandler(input);
    case "multi-subject":
      return multiSubjectHandler(input);
    case "cross-profile":
      // cross-profile은 실제로는 exam이므로
      return examHandler(input);
    default:
      return examHandler(input);  // fallback
  }
}
```

### 3-6. 핸들러 예시: Exam (`src/engine/handlers/exam.ts`)

```typescript
export function examHandler(input: TestCaseInput): PlanSkeleton {
  const plans: StudyPlan[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const missingInfo: string[] = [];

  const budget = input.profile.timeBudget;
  const daysLeft = input.exam?.daysLeft ?? 14;

  // 자원별 Plan 생성 (번들)
  for (const resource of input.resources) {
    const quantity = parseQuantity(resource.quantity);  // "250p" → 250, "90 problems" → 90
    
    if (!quantity) {
      missingInfo.push(`${resource.type} quantity unknown — estimated`);
      // 추정값 사용
    }

    // Rate 매칭
    const rate = (resource.type === "textbook" || resource.type === "studyGuide")
      ? matchReadingRate(resource, input.profile, input.exam, input)
      : (resource.type === "problems" || resource.type === "pastExam")
        ? matchPracticeRate(resource, input.profile, input.exam)
        : (resource.type === "lectures" || resource.type === "video")
          ? matchWatchRate(resource, input.profile)
          : RATE_TABLE.reading["general-textbook"];

    // 계산
    const calc = calculate({
      totalQuantity: quantity ?? 100,  // fallback
      rate,
      daysLeft,
      weekdayBudget: budget.weekday,
      weekendBudget: budget.weekend,
      focusSpan: input.profile.focusSpan,
    });

    // Plan 객체 생성
    plans.push({
      type: mapResourceToType(resource.type),
      label: `${input.exam?.subject} — ${resource.description}`,
      scope: resource.description,
      weekdayTarget: calc.weekdayTarget,
      effortModel: {
        type: "range",
        expected: rate.p50,
        min: rate.p25,
        max: rate.p75,
        unit: rate.unit,
        citation: rate.citation,
      },
      estimatedDailyMinutes: calc.dailyNeedMinutes,
      priority: plans.length === 0 ? "primary" : "secondary",
      phase: mapPhase(resource.type),
      assumptions: assumptions.length > 0 ? [...assumptions] : [`P50 reading speed assumed`],
      missingInfo,
    });
  }

  // timeFit: 전체 plans의 dailyNeed 합산으로 최종 판정
  const totalDailyMinutes = plans.reduce((sum, p) => sum + (p.estimatedDailyMinutes ?? 0), 0);
  const effectiveBudget = input.profile.focusSpan && input.profile.focusSpan <= 20
    ? Math.round(budget.weekday * 0.65)
    : budget.weekday;
  const timeFit = determineTimeFit(totalDailyMinutes, effectiveBudget, budget.weekday, budget.weekend);

  // Warnings
  if (timeFit === "deficit" || timeFit === "impossible") {
    warnings.push(`Daily need ${totalDailyMinutes}min exceeds budget ${budget.weekday}min`);
  }
  if (daysLeft <= 3) {
    warnings.push("Extremely tight — focus on highest-impact activity only");
  }

  // deficit/impossible → alternatives 생성
  const alternatives = (timeFit === "deficit" || timeFit === "impossible")
    ? generateAlternatives(input, plans, totalDailyMinutes)
    : undefined;

  return {
    plans,
    timeFit,
    totalDailyMinutes,
    warnings,
    assumptions,
    missingInfo,
    alternatives,
  };
}
```

### 3-7. 특수 케이스 핸들러

**prompt.ts에서 하드코딩된 특수 케이스들을 각 핸들러 내 분기로 이동:**

| prompt.ts 하드코딩 | → engine 위치 |
|-------------------|--------------|
| `LOCKED CALC (1-DAY EMERGENCY)` | `exam.ts` — daysLeft ≤ 1 분기 |
| `LOCKED CALC (McMurry 3RD)` | `matcher.ts` — isThirdAttempt() |
| `LOCKED CALC (정처기 비전공)` | `matcher.ts` — "수제비" 키워드 |
| `LOCKED CALC (TOEFL score gain)` | `handlers/langExam.ts` — 새 핸들러 |
| `LOCKED CALC (PMP PMBOK selective)` | `exam.ts` — PMBOK 756p → 200p 보정 |
| `LOCKED CALC (수능 국어)` | `exam.ts` — 수능 passage rate 분리 |
| `focusSpan=15 → W_eff=budget*0.65` | `calculator.ts` — 이미 포함 |
| `SRS pile-up Day 14-21` | `handlers/practice.ts` — SRS 계산 |
| `PhD 3-tier paper` | `handlers/read.ts` — paper count ≥ 12 분기 |
| `Essay milestone` | `handlers/assignment.ts` — milestone 계산 |
| `coding unpredictable` | `handlers/practice.ts` — Hofstadter 경고 |
| `Multi-subject global` | `handlers/multi.ts` — 글로벌 배분 |
| `Replan remainder` | `handlers/replan.ts` — 잔여 재계산 |

---

## 4. Phase A 검증: Engine-only 테스트

```typescript
// tests/engine.test.ts
// 42개 TC에 대해 engine만 실행하고 expected와 비교

import { buildSkeleton } from "../src/engine/skeleton.js";
import fs from "fs";
import path from "path";

async function testEngineOnly() {
  const inputDir = path.resolve("data/input");
  const expectedDir = path.resolve("data/expected");
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith(".json")).sort();

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const file of files) {
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf-8"));
    const expectedFile = path.join(expectedDir, file);
    if (!fs.existsSync(expectedFile)) continue;
    const expected = JSON.parse(fs.readFileSync(expectedFile, "utf-8"));

    const skeleton = buildSkeleton(input);

    // 검증 1: timeFit 일치
    const timeFitOk = checkTimeFit(skeleton.timeFit, expected.expectedTimeFit);

    // 검증 2: effortModel.expected가 P25-P75 범위 내 (±30%)
    const effortOk = checkEffort(skeleton, expected);

    // 검증 3: plans가 비어있지 않음
    const plansOk = skeleton.plans.length > 0;

    // 검증 4: totalDailyMinutes가 합리적
    const totalOk = skeleton.totalDailyMinutes >= 0;

    const ok = timeFitOk && effortOk && plansOk && totalOk;
    if (ok) {
      passed++;
      console.log(`✅ ${input.id}: timeFit=${skeleton.timeFit}, effort=${skeleton.plans[0]?.effortModel?.expected}`);
    } else {
      failed++;
      const issues = [];
      if (!timeFitOk) issues.push(`timeFit: got ${skeleton.timeFit}, expected ${expected.expectedTimeFit}`);
      if (!effortOk) issues.push(`effort out of range`);
      if (!plansOk) issues.push(`empty plans`);
      failures.push(`❌ ${input.id}: ${issues.join(", ")}`);
      console.log(failures[failures.length - 1]);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Engine-only: ${passed}/${passed + failed} PASS`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach(f => console.log(`  ${f}`));
  }
}

function checkTimeFit(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  // 허용: deficit↔impossible, fits↔tight
  if (expected === "deficit" && actual === "impossible") return true;
  if (expected === "fits" && actual === "tight") return true;
  if (expected === "tight" && actual === "fits") return true;
  return false;
}

testEngineOnly();
```

**실행:**
```bash
npx tsx tests/engine.test.ts
```

**Phase A 완료 조건: 42/42 engine-only PASS (AI 호출 없이)**

---

## 5. Phase B: Coach 분리

### 5-1. 슬림 프롬프트 (`src/coach/prompt.ts`)

```typescript
export const COACH_SYSTEM_PROMPT = `You are the AI Coach for Todait study planner.

You receive a PRE-CALCULATED study plan. The math is already done correctly.
Your job is NOT to recalculate — just provide coaching.

Your tasks:
1. DETECT the user's emotional state (neutral/panic/shame/frustration/burnout)
2. WRITE a coaching comment matching their situation and tone
3. EXPLAIN the strategy (why this plan makes sense for THIS person)
4. SUGGEST 0-3 questions that would materially change the plan

RULES:
- NEVER change timeFit, effortModel, or totalDailyMinutes — they are correct
- NEVER recalculate anything — the engine already did it
- Match the user's tone (encouraging/guiding/neutral/optimizing)
- For panic: validate → triage → sleep guard → schedule blocks
- For shame: normalize → recalculate from now → new starting point
- For frustration: acknowledge → diagnose → pivot
- For burnout: recovery first → scale down → small wins

Respond in JSON:
{
  "emotionProtocol": "neutral|panic|shame|frustration|burnout",
  "coachComment": "상황 맞춤 코멘트 (2-4문장)",
  "strategy": "전략 요약 (1문장)",
  "strategyRationale": "왜 이 전략인지 (2-3문장, 데이터 기반)",
  "questionsToAsk": [
    { "question": "질문", "decisionImpact": "이게 뭘 바꾸는지" }
  ]
}`;

export function buildCoachUserPrompt(
  skeleton: PlanSkeleton,
  input: TestCaseInput
): string {
  let prompt = `=== PRE-CALCULATED PLAN (do NOT change these numbers) ===\n\n`;

  prompt += `Subject: ${input.exam?.subject ?? input.name}\n`;
  prompt += `TimeFit: ${skeleton.timeFit}\n`;
  prompt += `TotalDailyMinutes: ${skeleton.totalDailyMinutes}\n`;
  prompt += `Warnings: ${JSON.stringify(skeleton.warnings)}\n\n`;

  prompt += `Plans:\n`;
  for (const plan of skeleton.plans) {
    prompt += `- ${plan.label}: ${plan.effortModel?.expected} ${plan.effortModel?.unit}, `;
    prompt += `${plan.estimatedDailyMinutes}min/day, priority=${plan.priority}\n`;
  }

  prompt += `\n=== USER CONTEXT ===\n\n`;
  if (input.userMessage) prompt += `User says: "${input.userMessage}"\n\n`;

  prompt += `Profile: ${input.profile.role}, ${input.profile.level}`;
  if (input.profile.year) prompt += `, ${input.profile.year}`;
  if (input.profile.focusSpan) prompt += `, focusSpan=${input.profile.focusSpan}min`;
  if (input.profile.isRetake) prompt += `, RETAKER`;
  prompt += `\n`;

  prompt += `Budget: ${input.profile.timeBudget.weekday}min weekday`;
  if (input.profile.timeBudget.weekend !== input.profile.timeBudget.weekday) {
    prompt += `, ${input.profile.timeBudget.weekend}min weekend`;
  }
  prompt += `\n`;

  prompt += `\nGenerate coaching response. Do NOT change any numbers above.`;
  return prompt;
}
```

### 5-2. Coach Generator (`src/coach/generate.ts`)

```typescript
import { callAICoach } from "../api.js";
import { COACH_SYSTEM_PROMPT, buildCoachUserPrompt } from "./prompt.js";

export async function generateCoaching(
  skeleton: PlanSkeleton,
  input: TestCaseInput
): Promise<CoachOutput> {
  const userPrompt = buildCoachUserPrompt(skeleton, input);

  // API 호출 — 기존 api.ts 재사용하되 시스템 프롬프트만 교체
  const result = await callWithPrompt(COACH_SYSTEM_PROMPT, userPrompt);

  if (!result.parsed) {
    // fallback: 기본 코칭
    return {
      emotionProtocol: "neutral",
      coachComment: "Study plan created based on your inputs.",
      strategy: "Balanced approach",
      strategyRationale: "Plan fits within your time budget.",
      questionsToAsk: [],
    };
  }

  return result.parsed as CoachOutput;
}
```

---

## 6. Phase C: 통합 + 데모 연결

### 6-1. Pipeline (`src/pipeline.ts`)

```typescript
export async function runPipeline(input: TestCaseInput): Promise<FullOutput> {
  // Layer 1: Engine (결정론적)
  const skeleton = buildSkeleton(input);

  // Layer 2: Coach (확률적)
  const coaching = await generateCoaching(skeleton, input);

  // Merge
  const output = {
    ...skeleton,
    emotionProtocol: coaching.emotionProtocol,
    coachComment: coaching.coachComment,
    strategy: coaching.strategy,
    strategyRationale: coaching.strategyRationale,
    questionsToAsk: coaching.questionsToAsk,
  };

  return output;
}

// Engine-only 모드 (AI 없이)
export function runEngineOnly(input: TestCaseInput): PlanSkeleton {
  return buildSkeleton(input);
}
```

### 6-2. HTTP Server (`src/server.ts`)

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { runPipeline, runEngineOnly } from "./pipeline.js";

const app = Fastify();
app.register(cors, { origin: true });

// Engine-only (즉시 응답)
app.post("/api/engine", async (req, res) => {
  const input = req.body as TestCaseInput;
  const skeleton = runEngineOnly(input);
  return skeleton;
});

// Full pipeline (Engine + AI Coach)
app.post("/api/plan", async (req, res) => {
  const input = req.body as TestCaseInput;
  const result = await runPipeline(input);
  return result;
});

// TC 목록
app.get("/api/tcs", async () => {
  return loadAllTestCases();
});

app.listen({ port: 3001, host: "0.0.0.0" });
console.log("🚀 Plan Engine API at http://localhost:3001");
```

### 6-3. 데모 연결 (`demo/`)

demo의 free-flow 모드에서 server API를 호출:
```typescript
// demo/src/api.ts
const API_URL = "http://localhost:3001";

export async function getEnginePlan(input: TCInput) {
  const res = await fetch(`${API_URL}/api/engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function getFullPlan(input: TCInput) {
  const res = await fetch(`${API_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}
```

---

## 7. CLI 업데이트 (`src/index.ts`)

```bash
# Engine-only 테스트 (AI 없이, 즉시)
npx tsx src/index.ts engine-test              # 42개 engine-only
npx tsx src/index.ts engine-test tc-01        # 단일 engine-only

# Full pipeline (Engine + AI Coach)
npx tsx src/index.ts run tc-01               # 단일 full
npx tsx src/index.ts run-all                 # 전체 full

# 서버
npx tsx src/index.ts serve                   # HTTP API 시작 (port 3001)

# 기존 호환
npx tsx src/index.ts iterate                 # 반복 모드 (기존 유지)
```

---

## 8. 실행 순서 — Claude Code 워크플로우

```
═══ Phase A: Engine 추출 ═══

STEP 1: src/types.ts에 PlanSkeleton, CoachOutput, RateEntry 타입 추가
STEP 2: src/engine/rates.ts — prompt.ts에서 마스터 테이블 추출
STEP 3: src/engine/matcher.ts — 키워드 → rate key 매칭
STEP 4: src/engine/calculator.ts — 산술 계산 + timeFit 판정
STEP 5: src/engine/handlers/*.ts — 7개 경로 핸들러
STEP 6: src/engine/skeleton.ts — 통합 빌더
STEP 7: src/engine/index.ts — public API export
STEP 8: tests/engine.test.ts — 42개 TC engine-only 검증
STEP 9: 실행 → 42/42 PASS 확인 (AI 없이)
  ⚠ Phase A 완료 조건: engine-only 42/42 PASS

═══ Phase B: Coach 분리 ═══

STEP 10: src/coach/prompt.ts — 슬림 코칭 프롬프트 (~200줄)
STEP 11: src/coach/generate.ts — Qwen 호출 + 파싱
STEP 12: src/pipeline.ts — engine + coach 합성
STEP 13: engine-only에서 coach 결과를 merge해서 검증
STEP 14: run-all로 42/42 full pipeline 확인
  ⚠ Phase B 완료 조건: full pipeline 42/42 PASS (90%+ 안정성)

═══ Phase C: 서버 + 데모 연결 ═══

STEP 15: src/server.ts — HTTP API (fastify 또는 hono)
STEP 16: demo/ API 연결 (free-flow 모드)
STEP 17: 서버 + 데모 동시 실행 확인
  ⚠ Phase C 완료 조건: 데모에서 인터뷰 → API → 결과 표시 동작

═══ Phase D: 정리 ═══

STEP 18: src/prompt.ts → src/prompt.legacy.ts 이름 변경 (참조용 보존)
STEP 19: README 업데이트
STEP 20: git commit + push
```

---

## 9. ⚠️ 중요 제약사항

1. **마스터 테이블 값은 v4 문서가 진실의 원천** — `docs/AI-Coach-42-Test-Cases-v4.md` 참조
2. **data/ 폴더의 input/expected JSON은 수정하지 말 것** — engine이 맞춰야 함
3. **prompt.ts의 계산 로직을 engine으로 이동할 때 누락 없이** — 49개 LOCKED CALCULATION 전부
4. **Phase A는 AI 호출 없이 42/42 달성이 목표** — 이게 핵심
5. **기존 validator.ts는 유지** — engine 출력도 같은 validator로 검증
6. **package.json에 fastify (또는 hono) + @fastify/cors 추가**
7. **demo/는 기존 코드 유지하고 API 연결만 추가** — 기존 TC 브라우저 모드는 그대로

---

## 10. 의존성 추가

```json
{
  "dependencies": {
    "openai": "^4.x",
    "zod": "^3.x",
    "dotenv": "^16.x",
    "fastify": "^5.x",
    "@fastify/cors": "^10.x"
  }
}
```

---

## 11. 성공 정의

| Phase | 조건 | 검증 방법 |
|-------|------|----------|
| **A** | Engine-only 42/42 PASS | `npx tsx tests/engine.test.ts` |
| **A** | 100회 실행 100회 통과 | 결정론적이므로 자동 보장 |
| **B** | Full pipeline 42/42 | `npx tsx src/index.ts run-all` |
| **B** | emotionProtocol 38+/42 | 90%+ 정확도 |
| **C** | 데모에서 API 호출 성공 | 브라우저에서 확인 |

---

*작성: 2026-03-20 | MUSE*
*원본: AI Coach — 42 Test Cases v4 (2026-03-19)*
*기반: prompt.ts 1,375줄 분석 + final_report.md 실패 패턴*
