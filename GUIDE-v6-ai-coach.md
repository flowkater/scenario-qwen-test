# GUIDE v6 — AI Study Coach 구현 가이드

> **이 문서는 Claude Code가 읽고 구현하는 가이드.**
> 전체 설계는 `PROJECT-SPEC-v6.md` 참조.

---

## 1. 구현할 파일 목록

```
src/
  prompt-v6.ts      — Qwen 시스템 프롬프트 + 유저 프롬프트 빌더
  pipeline-v6.ts    — 멀티턴 파이프라인 (conversation 순회 + Engine pre-calc)
  judge.ts          — Claude LLM-as-Judge (3축 평가)
  validator-v6.ts   — HFG 자동 검증 + 분기 검증
  index.ts          — CLI 명령어 추가 (run-v6, run-all-v6, judge-v6)

data/v6/            — TC 파일 (44개, 각각 paths A/B/C 포함)
```

---

## 2. Qwen 시스템 프롬프트 (`src/prompt-v6.ts`)

### 원칙

프롬프트는 **200줄 이내**. 원칙만. 하드코딩 없음.

```typescript
export const V6_SYSTEM_PROMPT = `
너는 Todait의 AI 학습 코치야.
학생과 선택지 기반 인터뷰를 하면서 상황을 파악하고,
실행 가능한 학습 계획을 함께 만들어.

## 네가 이미 아는 것
학생의 Profile이 주어진다 (온보딩에서 수집됨):
  role, year, level, focusSpan, timeBudget
이 정보를 다시 묻지 마. 자동으로 plan에 반영해.

## 인터뷰 규칙
1. 매 질문: 선택지 최대 3개 + "직접 입력" + "🤷 잘 모르겠어"
2. 각 선택지는 plan을 다르게 만들어야 한다 (장식 선택지 금지)
3. 🤷이면 한 단계 쉬운 질문으로 재시도
4. 재시도도 🤷이면 Smart Default + "나중에 알려주면 조정해줄게"
5. 분량을 모른다고 넘어가지 마 — 추정 질문으로 근사값 확보
6. plan을 만들 충분한 정보가 있으면 바로 plan 생성 (불필요한 질문 금지)

## 필수 수집 정보 (plan 생성 전)
- 자료 종류 + 분량 (페이지, 문제 수, 강의 수)
- 마감/시험일
- 시간 예산 (Profile에서 이미 있음)
선택 수집: 어려운 부분, 감정 상태

## 계획 생성 원칙

### SMART
- Specific: 자료별로 분리 (교재 Plan, 문제 Plan 따로)
- Measurable: dailyTarget을 숫자로 (14p/day, 4문제/day)
- Achievable: focusSpan → effective budget 계산, level 반영
- Relevant: 어려운 부분 있으면 우선순위 높게 (비균등 분배)
- Time-bound: 마감까지 역산

### CPI (시험 경로에서 제안)
- Coverage: 전체 대비 커버리지 % 명시 (150/200 = 75%)
- Practice: 인출 연습 제안 ("읽은 범위에서 문제 풀기")
- Insight: 이해도 확인 제안 ("틀린 문제는 다음날 다시")
CPI는 강제가 아니라 제안. 시험(E) 경로에서 주로 적용.

### 코치 4원칙
- 진단: profile + 유저 답변으로 상황 파악. plan에 반영.
- 전략: timeFit에 맞는 전략 (deficit→대안 2개+, fits→최적화 옵션)
- 현실 직면: deficit이면 솔직하게. "다 할 수 있어" 금지.
- 감정 대응: emotion에 맞는 톤. shame이면 자책 유도 금지.

## focusSpan 반영법
focusSpan → effective budget 계산 → dailyTarget에 반영
focusSpan=15: effective = timeBudget × 0.65
focusSpan=25: effective = timeBudget × 0.80
focusSpan=45+: effective = timeBudget × 0.90
"X분씩 끊어서" 같은 chunk 제안 하지 마. Todait는 "오늘 14p"만 준다.

## 절대 하지 마
- 시간 기반 plan (포모도로, 시간 블록)
- 과목 전문 지식 단정 ("Ch.12가 메커니즘이야" — 모델이 모름)
- 분량 모르는데 넘어가기
- deficit인데 "충분히 할 수 있어"
- profile 데이터 무시 (focusSpan, level)
- 첫 턴에 정보 부족한데 바로 plan 생성

## 출력 형식

질문할 때:
{
  "message": "코치 메시지",
  "choices": [
    { "id": "1", "text": "선택지1" },
    { "id": "2", "text": "선택지2" },
    { "id": "3", "text": "선택지3" },
    { "id": "free", "text": "직접 입력" },
    { "id": "idk", "text": "🤷 잘 모르겠어" }
  ],
  "action": "ask"
}

계획 제안할 때:
{
  "message": "코치 메시지 (상황 요약 + 솔직한 판단 + CPI 제안)",
  "plans": [
    {
      "label": "자료명",
      "type": "read|practice|watch|assignment|review",
      "dailyTarget": { "value": 14, "unit": "page" },
      "totalQuantity": 200,
      "duration": 10,
      "priority": "primary|secondary"
    }
  ],
  "timeFit": "fits|tight|deficit|impossible",
  "coverage": "150/200 (75%)",
  "alternatives": [
    { "label": "옵션명", "change": "변경 내용", "newTimeFit": "tight" }
  ],
  "choices": [
    { "id": "1", "text": "이대로 시작" },
    { "id": "2", "text": "다른 옵션 보여줘" },
    { "id": "3", "text": "직접 조정할래" }
  ],
  "action": "generate_plan"
}

JSON만 출력. 설명 텍스트 없이.
`;
```

### 유저 프롬프트 빌더

```typescript
export function buildUserPromptV6(
  profile: Profile,
  conversation: ConversationTurn[],
  engineCalc?: EngineCalcResult
): string {
  let prompt = `## 학생 프로필\n${JSON.stringify(profile, null, 2)}\n\n`;
  
  if (engineCalc) {
    prompt += `## Engine 계산 결과 (수학은 이 숫자 사용)\n${JSON.stringify(engineCalc, null, 2)}\n\n`;
  }
  
  prompt += `## 대화\n`;
  for (const turn of conversation) {
    prompt += `학생: ${turn.user}\n`;
    if (turn.aiResponse) {
      prompt += `코치: ${JSON.stringify(turn.aiResponse)}\n`;
    }
  }
  
  return prompt;
}
```

---

## 3. 멀티턴 파이프라인 (`src/pipeline-v6.ts`)

```typescript
export async function runPipelineV6(tc: TestCaseV6, pathKey: 'A' | 'B' | 'C') {
  const path = tc.paths[pathKey];
  const results: TurnResult[] = [];
  const conversationHistory: Message[] = [];
  
  for (const turn of path.conversation) {
    // 1. 유저 메시지 추가
    conversationHistory.push({ role: 'user', content: turn.user });
    
    // 2. Engine pre-calc (plan 생성 턴이면)
    let engineCalc = undefined;
    if (isLastTurn(turn, path)) {
      engineCalc = preCalculate(tc.profile, conversationHistory);
    }
    
    // 3. Qwen 호출
    const prompt = buildUserPromptV6(tc.profile, conversationHistory, engineCalc);
    const aiResponse = await callQwen(V6_SYSTEM_PROMPT, prompt);
    
    // 4. 응답 파싱 + 검증
    const parsed = parseAIResponse(aiResponse);
    const turnValidation = validateTurn(parsed, turn.expectedAI, tc);
    
    results.push({ turn: turn.turn, response: parsed, validation: turnValidation });
    
    // 5. 다음 턴을 위해 히스토리에 추가
    conversationHistory.push({ role: 'assistant', content: aiResponse });
  }
  
  return { tcId: tc.id, path: pathKey, results };
}
```

### Engine Pre-calculate

```typescript
function preCalculate(profile: Profile, conversation: Message[]): EngineCalcResult {
  // 대화에서 자료/분량/마감 추출
  const resources = extractResources(conversation);
  const deadline = extractDeadline(conversation);
  
  // focusSpan → effective budget
  const effectiveBudget = calculateEffectiveBudget(
    profile.timeBudget,
    profile.focusSpan
  );
  
  // 자료별 계산
  const calculations = resources.map(r => ({
    label: r.label,
    totalQuantity: r.quantity,
    dailyTarget: Math.ceil(r.quantity / deadline.days),
    estimatedMinPerUnit: lookupRate(r.type, r.subject),
    totalMinutes: r.quantity * lookupRate(r.type, r.subject),
  }));
  
  // timeFit 판정
  const totalMinNeeded = calculations.reduce((s, c) => s + c.totalMinutes, 0);
  const totalMinAvailable = effectiveBudget.daily * deadline.days;
  const timeFit = judgeTimeFit(totalMinNeeded, totalMinAvailable);
  
  return { calculations, timeFit, effectiveBudget, deadline };
}
```

---

## 4. LLM-as-Judge (`src/judge.ts`)

### 왜 필요한가
키워드 매칭이나 숫자 비교로는 "좋은 코치인지" 판단 불가.
Claude가 Qwen 응답을 읽고 3축 기준으로 평가.

### 구현

```typescript
import Anthropic from '@anthropic-ai/sdk';

const JUDGE_PROMPT = `
너는 AI Study Coach 품질 평가관이다.
Qwen이 생성한 학습 코칭 응답을 3축 기준으로 평가해.

## 평가 기준

### SMART (각 0-2점)
S: 과목/자료/분량이 구체적으로 특정됐는가
M: dailyTarget이 숫자로 나왔는가
A: profile(focusSpan/level) + timeFit이 현실적으로 반영됐는가
R: 약점/우선순위가 plan 구조에 반영됐는가
T: 마감 기반으로 일정이 역산됐는가

### CPI (각 0-2점, 시험 경로 필수 / 다른 경로 보너스)
C: 전체 대비 커버리지 %가 명시됐는가
P: 인출 연습(문제풀기, 셀프테스트)이 제안됐는가
I: 이해도 확인 구조(틀린 문제 복습 등)가 제안됐는가

### Coach (각 0-2점)
진단: profile + 유저 답변이 plan에 실제로 반영됐는가
전략: timeFit에 맞는 전략인가
현실: timeFit을 솔직하게 전달했는가
감정: emotion에 맞는 톤인가, mustNotSay 위반 없는가

### Hard Fail (하나라도 있으면 전체 FAIL)
HFG-1: deficit인데 "충분히 할 수 있어"
HFG-2: mustNotSay 위반
HFG-3: 분량 모르는데 추정 없이 plan 생성
HFG-4: 시간 기반 plan (포모도로 등)
HFG-5: profile 데이터(focusSpan/level) 완전 무시

## 출력 형식 (JSON만)
{
  "smart": {
    "specific": { "score": 0|1|2, "reason": "한 줄" },
    "measurable": { "score": 0|1|2, "reason": "한 줄" },
    "achievable": { "score": 0|1|2, "reason": "한 줄" },
    "relevant": { "score": 0|1|2, "reason": "한 줄" },
    "timeBound": { "score": 0|1|2, "reason": "한 줄" }
  },
  "cpi": {
    "coverage": { "score": 0|1|2, "reason": "한 줄" },
    "practice": { "score": 0|1|2, "reason": "한 줄" },
    "insight": { "score": 0|1|2, "reason": "한 줄" }
  },
  "coach": {
    "diagnosis": { "score": 0|1|2, "reason": "한 줄" },
    "strategy": { "score": 0|1|2, "reason": "한 줄" },
    "honesty": { "score": 0|1|2, "reason": "한 줄" },
    "emotion": { "score": 0|1|2, "reason": "한 줄" }
  },
  "hardFails": ["HFG-1", ...] | [],
  "totalScore": number,
  "maxScore": 24,
  "pass": boolean,
  "summary": "한 줄 총평"
}
`;

export async function judgeResponse(
  tc: TestCaseV6,
  pathKey: string,
  qwenResponses: QwenResponse[]
): Promise<JudgeResult> {
  const client = new Anthropic();
  
  const userPrompt = `
## TC 정보
ID: ${tc.id}
Path: ${pathKey}
Profile: ${JSON.stringify(tc.profile)}
Emotion: ${tc.emotionProtocol}
Category: ${tc.category}

## 대화 내역
${qwenResponses.map((r, i) => `
Turn ${i + 1}:
  학생: ${tc.paths[pathKey].conversation[i].user}
  코치: ${JSON.stringify(r, null, 2)}
`).join('\n')}

## 이 TC의 기대사항
${JSON.stringify(tc.paths[pathKey].conversation.map(c => c.expectedAI), null, 2)}

위 대화를 평가해.
`;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: JUDGE_PROMPT + '\n\n' + userPrompt }
    ]
  });
  
  return JSON.parse(response.content[0].text);
}
```

### 비용 추정
```
Judge 1회: ~1K input + 500 output tokens = ~$0.005
132 paths × $0.005 = ~$0.66/round
Qwen 132 paths: ~$0.15/round
총: ~$0.81/round
```

---

## 5. 분기 검증 (`src/validator-v6.ts`)

### Path Differentiation Check

```typescript
export function validatePathDiff(
  pathAResult: PipelineResult,
  pathBResult: PipelineResult,
  pathCResult: PipelineResult
): PathDiffResult {
  const planA = extractFinalPlan(pathAResult);
  const planB = extractFinalPlan(pathBResult);
  const planC = extractFinalPlan(pathCResult);
  
  const diffs = {
    planCount: new Set([planA.length, planB.length, planC.length]).size > 1,
    dailyTargetDiff: compareDailyTargets(planA, planB, planC),
    priorityDiff: comparePriorities(planA, planB, planC),
    strategyDiff: compareStrategies(pathAResult, pathBResult, pathCResult),
    timeFitDiff: compareTimeFits(pathAResult, pathBResult, pathCResult),
  };
  
  const diffCount = Object.values(diffs).filter(Boolean).length;
  
  return {
    diffs,
    diffCount,
    pass: diffCount >= 2,  // 최소 2개 이상 차이
  };
}
```

### HFG 자동 검증

```typescript
export function checkHardFails(response: QwenResponse, tc: TestCaseV6): string[] {
  const fails: string[] = [];
  
  // HFG-1: deficit인데 긍정적
  if (response.timeFit === 'deficit' || response.timeFit === 'impossible') {
    if (containsPositive(response.message)) fails.push('HFG-1');
  }
  
  // HFG-2: mustNotSay 위반
  const mustNotSay = tc.emotionProtocol ? EMOTION_MUST_NOT_SAY[tc.emotionProtocol] : [];
  for (const phrase of mustNotSay) {
    if (response.message.toLowerCase().includes(phrase.toLowerCase())) {
      fails.push('HFG-2');
      break;
    }
  }
  
  // HFG-3: 분량 모르는데 plan 생성
  if (response.action === 'generate_plan' && hasUnknownQuantity(response)) {
    fails.push('HFG-3');
  }
  
  // HFG-4: 시간 기반 plan
  if (hasTimeBasedPlan(response)) fails.push('HFG-4');
  
  // HFG-5: profile 무시
  if (!reflectsProfile(response, tc.profile)) fails.push('HFG-5');
  
  return fails;
}
```

---

## 6. CLI (`src/index.ts` 추가)

```typescript
// 단일 TC, 단일 path
// npx tsx src/index.ts run-v6 tc-04 A
program.command('run-v6 <tcId> [path]')

// 단일 TC, 3 paths 모두
// npx tsx src/index.ts run-v6-all-paths tc-04
program.command('run-v6-all-paths <tcId>')

// 전체 TC, 전체 paths
// npx tsx src/index.ts run-all-v6
program.command('run-all-v6')

// Judge 실행 (Qwen 결과 → Claude 평가)
// npx tsx src/index.ts judge-v6 tc-04 A
program.command('judge-v6 <tcId> [path]')

// 전체 Judge
// npx tsx src/index.ts judge-all-v6
program.command('judge-all-v6')
```

---

## 7. 실행 순서 (Claude Code iterate mode)

```
STEP 1: TC 파일 확인
  data/v6/tc-01.json ~ tc-42.json (paths A/B/C 포함)
  → 없거나 형식 오류면 STOP

STEP 2: prompt-v6.ts 작성
  V6_SYSTEM_PROMPT + buildUserPromptV6()
  → 200줄 이내

STEP 3: pipeline-v6.ts 작성
  runPipelineV6() + preCalculate()
  → 기존 engine/ 코드 재사용 (rates.ts, calculator.ts)

STEP 4: judge.ts 작성
  judgeResponse() + JUDGE_PROMPT
  → Anthropic SDK 사용, claude-sonnet-4-5 모델

STEP 5: validator-v6.ts 작성
  checkHardFails() + validatePathDiff()

STEP 6: index.ts 업데이트
  run-v6, run-all-v6, judge-v6, judge-all-v6 명령어

STEP 7: 단일 TC 테스트
  npx tsx src/index.ts run-v6 tc-04 A
  npx tsx src/index.ts judge-v6 tc-04 A
  → 파싱 오류 없는지 확인

STEP 8: 전체 실행
  npx tsx src/index.ts run-all-v6
  npx tsx src/index.ts judge-all-v6
  → 결과 리포트 출력

검증 기준:
  Pass = totalScore 18+ (75%) AND hardFails.length === 0
  Ship Gate = 전체 평균 80%+ AND Path 분기 85%+

최대 10 라운드. 3 라운드 개선 없으면 STOP.
```

---

## 8. 의존성

```
기존 유지:
  @dashscope (Qwen API)
  zod (스키마 검증)
  engine/ (rates, calculator, matcher)

새로 추가:
  @anthropic-ai/sdk (Judge용 Claude API)
```

### 환경 변수
```
DASHSCOPE_API_KEY — Qwen 호출
ANTHROPIC_API_KEY — Claude Judge 호출
```

---

*작성: 2026-03-21 17:30 | MUSE*
*핵심: Qwen이 코치, Claude가 심사관, Engine이 계산기*
