# AddPlan v1.0 AI Parser — Iterate to 44/44

## Goal
Run `npx tsx src/parser/runner.ts run-all` and iterate until **44/44 PASS (100%)**.

## Strategy: Fix Prompt OR Fix Expected Values

For each failed TC, determine:
1. **Is the AI output reasonable?** → Fix the expected value in `data/parser/{tc-id}.json`
2. **Is the AI output wrong?** → Fix the prompt in `src/parser/prompt.ts`
3. **Is the validator logic wrong?** → Fix `src/parser/validator.ts`

### Common Patterns to Fix

**Purpose enum mismatch**: AI may use correct enum but a different reasonable choice. If the AI's choice is defensible, update expected.

**Confidence too conservative**: AI gives confidence 0.5 when expected to skip (needs ≥0.65/0.75/0.80). Two options:
- Lower thresholds in validator.ts
- Add prompt instruction to be more confident when signal is clear

**Quantity format**: "300 pages" should → startValue:1, endValue:300 (range). "500문제" → totalQuantity:500 (amount). If AI does differently but reasonably, fix expected.

**planType derivation**: planType comes from purpose. If purpose is correct but planType wrong, check the mapping.

**Skip decision**: Derived from confidence thresholds. If confidence is off, skipDecision will be off too. Fix the root cause (confidence).

## Rules

1. **NEVER fabricate quantities** — if description has no explicit number, quantity must be null
2. **NEVER set examPrep=true for non-exam activities** (piano, guitar, meditation, leisure)
3. **Profile is a Bayesian prior** — description overrides when explicit
4. **Category selected by user** — never suggest changing it
5. **Todait is quantity-based** — time inputs (hours/minutes) must NOT convert to quantity

## Iteration Loop

```
1. npx tsx src/parser/runner.ts run-all
2. Check results — identify failed TCs
3. For each failure: read data/parser/results/{tc-id}.json to see actual output
4. Decide: fix prompt.ts OR fix {tc-id}.json expected values OR fix validator.ts
5. Make changes
6. Re-run: npx tsx src/parser/runner.ts run-all
7. Repeat until 44/44
```

## File Locations

- Prompt: `src/parser/prompt.ts`
- API client: `src/parser/api.ts`
- Validator: `src/parser/validator.ts`
- Runner: `src/parser/runner.ts`
- Types: `src/parser/types.ts`
- TC data: `data/parser/tc-*.json` (44 files)
- Results: `data/parser/results/tc-*.json`

## Important

- Model: `qwen3.5-flash` with `enable_thinking: false`
- API: DashScope (already configured via .env)
- Temperature: 0.1 (extraction task)
- Add 300ms sleep between API calls (rate limit)
- Each run-all takes ~60 seconds
- When done: `openclaw system event --text "Parser 44/44 PASS 🎉" --mode now`

## Hard Fail Rules (Never violate)

- HF-1: AI must not fabricate quantities not in description
- HF-2: AI must not convert time to quantity (2 hours ≠ 2)
- HF-3: Profile must not override explicit description intent
- HF-4: examPrep must not be true for non-exam activities
- HF-5: AI must not suggest category changes
