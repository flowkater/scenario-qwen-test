# CLAUDE.md

답변은 한글로

## 프로젝트 개요
AI Coach 42 Test Cases v4 테스트 스위트. 학습 플래너 AI 코치의 행동을 검증하는 시나리오 테스트.

## 구조
- `data/input/` — 유저 입력 시나리오 (42개)
- `data/expected/` — 기대 AI 행동 (42개)
- `src/types.ts` — 타입 정의 (v4 스키마)
- `src/` — 테스트 러너, 검증기, 분석기

## v4 핵심 개념
- **P50 [P25-P75]**: 모든 시간 추정은 범위. effortModel 참조
- **Hard Fail Gates (HFG 1-4)**: 자동 0점 조건
- **Emotion Protocol**: neutral/panic/shame/frustration/burnout
- **Version Tags**: v1(기본) / v1.5(전략차별화) / v2(감정+재계획+다과목)

## TC v4 원본 문서
`/Users/flowkater/Obsidian/flowkater/flowkater/Project/Todait/온보딩-AddPlan/AI Coach — 42 Test Cases v4 (2026-03-19).md`
