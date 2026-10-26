# BRIEFING — 2026-10-26T04:24:00Z

## Mission
Investigate and design the exact implementation of `src/lib/ics-parser.ts` (Google Calendar RFC 5545 parsing, non-meal filtering, multi-dish splitting, orthographic alias normalization, frequency classification, and seeding format for Dish/DailyMenu) and unit test specifications for `tests/unit/ics-parser.test.ts`.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1
- Original parent: 35a3dc7b-a199-49dc-b838-a1010ac73ac1
- Milestone: M2 - Algorithmic Engines & Business Logic

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in project root
- Only write files inside working directory `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1\`
- Provide complete TypeScript implementation blueprints and unit test specifications
- Follow authoritative documents (ORIGINAL_REQUEST.md lines 24-30, PROJECT.md, Survey 2 handoff)

## Current Parent
- Conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (lines 24-30: R2 requirements)
  - `PROJECT.md` (Feature Inventory, Interface contracts, Code layout)
  - `teamwork_preview_spec_miner_survey_2\handoff.md` (Blueprint, domain models, algorithms)
  - `src/db/schema.ts` (Dishes, daily_menus, app_settings tables and domain interfaces)
  - `src/db/seed.ts` (17 pantry staples, seed dishes with aliases, 14-day history)
  - `tests/unit/foundation.test.ts` & existing test suite (all 103 tests passing)
  - Design specifications (`design_spec.md`, `implementation_plan.md`, `ui_mock.html`)
- **Key findings**:
  - RFC 5545 unfolding (CRLF + space/tab), escape handling, and date extraction (handling all-day, TZID, and UTC+9 JST conversion) designed cleanly.
  - Multi-dish titles require distinguishing punctuation delimiters (`、`, `・`, `＋`, `,`, `\n`) from ingredient conjunction "と" (e.g. "豚バラと大根" is 1 dish vs "生姜焼きと味噌汁" is 2 dishes).
  - Orthographic normalizer harmonizes variants into canonical names (e.g. "豚の生姜焼き", "しょうが焼き", "生姜焼き", "豚生姜焼") while preserving all variants in `aliases`.
  - Classification rule: `>= 5` cookCount -> `sourceType = 'classic_book'`, `recipeStatus = 'needs_registration'`; `1..4` -> `sourceType = 'ai_generated'`, `recipeStatus = 'ai_provisional'`.
  - Output generates valid `ParsedDish[]` and `ParsedDailyMenu[]` directly ingestible by Drizzle ORM.
  - Complete, drop-in TypeScript implementation blueprint and full Vitest unit test suite authored in `handoff.md`.
- **Unexplored areas**: None.

## Key Decisions Made
- Architecture: Pure, deterministic TypeScript module in `src/lib/ics-parser.ts` with zero external native dependencies, runnable in Vitest and Next.js Edge/Node.
- Non-meal filter: Multi-category regex heuristic covering medical, beauty, chores, work/school, administration, and dining out/social, with meal-prefix whitelisting and food-keyword detection.
- Normalizer: Built-in cluster dictionary matching against `SEED_DISHES` + generalized stem normalizer.
- Seeding: Auto-generates valid provisional `IngredientItem[]` and cooking steps for unmapped classics so the shopping list functions without error prior to OCR.
- Report: Fully populated 5-component handoff report saved to `handoff.md`.

## Artifact Index
- DISPATCH.md — incoming dispatch instructions
- BRIEFING.md — working memory and identity
- progress.md — liveness heartbeat
- handoff.md — final 5-component handoff report
