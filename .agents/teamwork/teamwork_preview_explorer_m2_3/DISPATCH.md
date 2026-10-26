## 2026-10-26T04:16:35Z
You are teamwork_preview_explorer_m2_3.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_3
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M2 - Algorithmic Engines & Business Logic
Focus: Shopping Aggregator (`src/lib/shopping-aggregator.ts`), Parallel Timeline DAG Scheduler (`src/lib/timeline-scheduler.ts`), and Gemini Offline Fallback (`src/lib/gemini.ts`)

Authoritative Documents to Read:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read lines 37-48)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Survey 2: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_spec_miner_survey_2\handoff.md (Lines 438-580)
4. UI Mock data structures: C:\Users\HCP4\.gemini\brain\db2fa280-5ac6-472b-9577-acd1554f0701\ui_mock.html (Lines 349-503, 700-706)

Objective:
Investigate and design the exact implementation of:
1. `src/lib/shopping-aggregator.ts`:
   - Portion scaling multiplier: $Ratio = targetServings / baseServings$. Fractions (1/2, 1/4), decimals, units (g, ml, 大さじ, 小さじ, 本, 個, 丁, 束), qualitative units ("少々", "適量" unscaled).
   - Duplicate ingredient consolidation across dishes.
   - Two-stage partitioning: Stage 1 (`買うもの` fresh meat/produce) vs Stage 2 (`家にあるかも` 17 staples).
   - 1-tap staple promotion logic.
   - Clean Japanese LINE shopping memo formatter (`【MM/DD 買い物メモ】\n・...`).
2. `src/lib/timeline-scheduler.ts`:
   - Deterministic DAG parallel timeline scheduler:
     - Phase 1: `下ごしらえ（まとめて切る・レンジ）` (vegetables before raw meat/fish, microwave pre-heating)
     - Phase 2: `副菜と汁物の火入れ` (simmering side & soup flavor absorption)
     - Phase 3: `主菜の仕上げ（熱々で食卓へ）` (hot finish on stove right before serving)
   - Resource queues: single cutting board hygiene sequence, microwave queue, $\le 2$ stove burners.
3. `src/lib/gemini.ts`:
   - `@google/genai` client integration with 100% deterministic offline fallback for timeline, OCR, and search when `GEMINI_API_KEY` is not present.
Provide complete TypeScript implementation blueprints and unit test specifications for `tests/unit/shopping-aggregator.test.ts` and `tests/unit/timeline-scheduler.test.ts`.

Scope Boundaries:
- Read-only exploration. DO NOT write or edit source code in the project root.
- Write your report to:
  C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_3\handoff.md
- Message parent orchestrator when complete.
