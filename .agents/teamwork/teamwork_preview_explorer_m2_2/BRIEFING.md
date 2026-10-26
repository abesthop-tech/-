# BRIEFING — 2026-10-26T04:22:00Z

## Mission
Design the exact implementation blueprint for `src/lib/menu-planner.ts` and test specifications for `tests/unit/menu-planner.test.ts` focusing on the 3-slot meal triad, objective scoring formula, slot lock preservation, candidate shuffle, and new recipe challenge injection.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesis
- Working directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2
- Original parent: 35a3dc7b-a199-49dc-b838-a1010ac73ac1
- Milestone: M2 - Algorithmic Engines & Business Logic

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in project root
- Scope: `src/lib/menu-planner.ts` and `tests/unit/menu-planner.test.ts`
- Write report to `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2\handoff.md`
- Message parent orchestrator when complete

## Current Parent
- Conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (lines 31-36, R3 requirement)
  - `PROJECT.md` (Feature 11, 12, 13, milestone M2)
  - Survey 2 handoff (`teamwork_preview_spec_miner_survey_2/handoff.md`, lines 303-436, 611-663, 758-764)
  - `src/db/schema.ts` (`MealSlot`, `ParsedDish`, `ParsedDailyMenu`, `DishCategory`, `ProteinType`, `SourceType`)
  - `src/db/seed.ts` (13 seed dishes, 14-day history, protein types)
  - `implementation_plan.md` & `ui_mock.html` (3-slot controls, lock toggle, shuffle, new challenge)
- **Key findings**:
  - 3-slot triad uses canonical roles `main`, `side`, `soup` mapped to Japanese labels `主菜`, `副菜`, `汁物`.
  - Scoring formula incorporates: context keyword match (+50 per token), recency penalty (-100 for <=3d, -60 for 4-7d, -30 for 8-14d), protein rotation penalty on main (-40 for D-1, -20 for D-2), household classics bonus (+15 for >=5 cookCount), wishlist bonus (+25), stochastic jitter (+[0, 5) with deterministic override).
  - Slot lock preservation guarantees locked slots are never overwritten in batch proposal or single shuffle.
  - Candidate shuffle sorts eligible candidates by score and cyclically advances index with duplicate exclusion.
  - Challenge injection targets unlocked side slot first (fallback to main/soup) and picks from wishlist/trusted_web with badge "新レシピ挑戦".
- **Unexplored areas**: None, full blueprint ready for synthesis.

## Key Decisions Made
- Include configurable options (`MenuPlannerOptions`) supporting zero-jitter deterministic unit tests.
- Maintain separate breakdown object in `ScoredDish` for transparency, debugging, and UI explainability.
- Map and align types 100% with `src/db/schema.ts` to ensure zero compilation friction with M1 database layer.

## Artifact Index
- DISPATCH.md — initial task instructions
- BRIEFING.md — situational awareness
- progress.md — task heartbeat
- handoff.md — comprehensive blueprint and test specification
