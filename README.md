# AddPlan Scenario AI Test

Tests Todait AddPlan Phase 3-E SMART+CPI study plan generation via Qwen API.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — add DASHSCOPE_API_KEY
```

## Commands

```bash
npx tsx src/index.ts prompt tc-1      # Preview prompt (no API call)
npx tsx src/index.ts run tc-1         # Run single test case
npx tsx src/index.ts run-all          # Run all 8 test cases + report
```

## Model

DashScope `qwen3.5-flash` via OpenAI-compatible API.
