# Phase A + Phase B 구현 결과 리포트

**날짜**: 2026-03-20
**목표**: PROJECT-SPEC-engine.md 3-Layer 아키텍처 구현
**최종 결과**: **44/44 PASS (100%)**

---

## 최종 점수

| Track | 결과 |
|-------|------|
| Engine (Phase A) | **44/44 PASS (100%)** |
| Coach (Phase B) | **44/44 PASS (100%)** |
| **Overall** | **44/44 PASS (100%)** |

---

## Phase A — Engine 추출

### 구현 파일

| 파일 | 역할 |
|------|------|
| `src/engine/rates.ts` | 마스터 레이트 테이블 (reading/watch/practice/langExam) |
| `src/engine/calculator.ts` | timeFit / effortModel 결정론적 계산 |
| `src/engine/matcher.ts` | 키워드 기반 레이트 매칭 |
| `src/engine/utils.ts` | parseQuantity, isHoursQuantity 유틸 |
| `src/engine/handlers/exam.ts` | 시험/읽기/시청/과제 핸들러 |
| `src/engine/handlers/replan.ts` | 재계획 핸들러 (remainingQuantity 기반) |
| `src/engine/handlers/multi.ts` | 멀티 과목 글로벌 버짓 할당 |
| `src/engine/handlers/langExam.ts` | TOEFL/JLPT 점수 기반 계산 |
| `src/engine/skeleton.ts` | PlanSkeleton 빌드 진입점 |
| `src/engine/index.ts` | re-export |
| `tests/engine.test.ts` | Engine-only 44TC 검증 테스트 |

### 검증 기준 (ENGINE TRACK)
- `timeFit` 일치 (허용: deficit↔impossible, fits↔tight)
- `effortModel.expected` ∈ [min×0.7, max×1.3]
- `plans.length > 0`
- HFG: deficit/impossible인데 fits면 FAIL
- `assumptions[]` 하나 이상 존재

---

## Phase B — Coach 분리

### 구현 파일

| 파일 | 역할 |
|------|------|
| `src/coach/prompt.ts` | 슬림 코칭 프롬프트 (~100줄) |
| `src/coach/generate.ts` | Qwen API 호출 (DashScope) |
| `src/pipeline.ts` | Engine + Coach merge |
| `src/validator.ts` | 2-Track 검증 (enginePass / coachPass) |
| `src/runner.ts` | pipeline 사용 러너 + engine-only 모드 |
| `src/index.ts` | engine-test / run / run-all 명령 |
| `src/prompt.legacy.ts` | 기존 prompt.ts 참조용 보존 |

### Coach 프롬프트 튜닝 이력

**Round 1** (40/44): 감정 과잉 감지 발생
- tc-03, tc-19, tc-28, tc-42 — neutral 예상인데 panic/frustration/shame 오감지

**Round 2** (44/44): 감정 감지 보수화
- **핵심 수정**: 감정은 사용자 메시지의 **명시적 감정 언어**에서만 감지
- 금지 신호 목록 명시:
  - `timeFit = "deficit"` → frustration X (neutral)
  - 과거 실패 사실 언급 → shame X (neutral)
  - 대용량 과제, 어려운 과목 → frustration X (neutral)
  - "Haven't started" 중립 서술 → panic X (neutral)
  - "no deadline, just for fun" → 항상 neutral

---

## 아키텍처 다이어그램

```
사용자 입력 (TestCaseInput)
        │
        ▼
┌───────────────────┐
│  Layer 1: Engine  │  결정론적 (AI 없음)
│  buildSkeleton()  │  → timeFit, effortModel, plans, warnings
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Layer 2: Coach   │  확률적 (Qwen AI)
│  generateCoaching │  → emotionProtocol, coachComment, strategy
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Layer 3: Merge   │
│  runPipeline()    │  Engine 필드 고정 + Coach 필드 채우기
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  2-Track Validate │
│  enginePass (100%)│
│  coachPass  (90%+)│
└───────────────────┘
```

---

## 실행 명령

```bash
# Engine 전용 검증 (AI 없음)
npx tsx src/index.ts engine-test

# 단일 TC 실행
npx tsx src/index.ts run tc-01

# 전체 44TC 실행
npx tsx src/index.ts run-all
```
