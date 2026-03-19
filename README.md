# AI Coach Test Cases — Scenario Test Suite

> v4 (2026-03-19) — 42 Test Cases + Rubric + Hard Fail Gates

## Overview
- **42 test cases** across 11 categories (A-K)
- **178 real-world data points** validating min/unit estimates
- **P50 [P25-P75] range format** for all time estimates
- **Hard Fail Gates (4)** — automatic 0 score conditions
- **Emotion Protocol (5)** — neutral/panic/shame/frustration/burnout
- **Personalization Rubric** — 6-dimension weighted, 20-point scale

## Categories
| Section | Category | TCs | Version |
|---------|----------|-----|---------|
| A | Exam - University | TC-01~10 | v1~v1.5 |
| B | Exam - High School | TC-11~13 | v1.5 |
| C | Exam - Certification | TC-14~18 | v1.5 |
| D | Read | TC-19~23 | v1~v1.5 |
| E | Assignment | TC-24~26 | v1 |
| F | Watch | TC-27~29 | v1.5 |
| G | Practice | TC-30~32 | v1~v1.5 |
| H | Cross-Profile | TC-33~36 | v1.5~v2 |
| I | Replan (NEW v4) | TC-37~39 | v2 |
| J | Multi-Subject (NEW v4) | TC-40~42 | v2 |

## Data Files
- `data/input/tc-XX-name.json` — User input scenarios
- `data/expected/tc-XX-name.json` — Expected AI behavior

## Running Tests
```bash
npm install
npm run test        # Run all TCs
npm run test:v1     # Run v1 TCs only
npm run test:v1.5   # Run v1 + v1.5 TCs
```

## Hard Fail Gates
1. **HFG-1**: False Plan (lowering min/unit to fit budget)
2. **HFG-2**: Redundant Question (asking already-provided info)
3. **HFG-3**: Profile Stereotyping (demographic-based assumptions)
4. **HFG-4**: Hidden Assumptions (undisclosed AI estimates)

## Source
- TC v4 Document: `AI Coach — 42 Test Cases v4 (2026-03-19).md`
- Research Data: `tc-v3-research/` (178 data points, 5 research agents)
- Academic References: Wake Forest CAT, Brysbaert 2019, UCLA speed study, Keshav 3-pass, MOOC completion meta-analysis, Cal Newport Deep Work
