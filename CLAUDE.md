# CLAUDE.md

답변은 한글로

## 구현 명세서
**반드시 `PROJECT-SPEC-v4.md`를 먼저 읽고 시작하라.** 이 파일이 전체 구현 계획서다.

## 프로젝트 개요
AI Coach 42 Test Cases v4 테스트 스위트. 학습 플래너 AI 코치의 행동을 검증하는 시나리오 테스트.
**목표: 42/42 TC 통과할 때까지 프롬프트 반복 개선.**

## 이미 작성된 파일 (건드리지 마)
- `src/types.ts` — v4 타입 정의
- `src/prompt.ts` — v4 시스템 프롬프트 + 유저 프롬프트 빌더 (iterate 중 수정 가능)
- `data/input/*.json` — 42개 TC 입력
- `data/expected/*.json` — 42개 TC 기대값
- `docs/AI-Coach-42-Test-Cases-v4.md` — TC v4 원본 문서 (진실의 원천)

## 네가 작성/재작성해야 할 파일
- `src/api.ts` — DashScope API 호출 (v4)
- `src/validator.ts` — v4 검증기 6단계 (전면 재작성)
- `src/analyzer.ts` — v4 분석기 (전면 재작성)
- `src/runner.ts` — v4 러너 (전면 재작성)
- `src/index.ts` — CLI + iterate 모드 (전면 재작성)

## 핵심 규칙
1. **마스터 테이블 값 변경 금지** — docs/AI-Coach-42-Test-Cases-v4.md가 진실
2. **TC input/expected JSON 수정 금지** — 프롬프트(prompt.ts)만 수정
3. **시스템 프롬프트 8,000 토큰 이하 유지** — few-shot은 최대 3개
4. **3라운드 연속 개선 없으면 멈추고 보고**
5. **각 라운드 리포트 저장** — reports/round-{N}-{timestamp}.json

## 실행 방법
```bash
npm install
npx tsx src/index.ts run tc-01       # 단일 TC
npx tsx src/index.ts run-all         # 전체 1회
npx tsx src/index.ts iterate --max-rounds=10 --target=42  # 무한 반복
```

## TC v4 원본 문서
`docs/AI-Coach-42-Test-Cases-v4.md` — 3,736줄, 164KB
