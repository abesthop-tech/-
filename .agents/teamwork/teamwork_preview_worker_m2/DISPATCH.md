## 2026-10-26T04:24:16Z
You are teamwork_preview_worker_m2.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_worker_m2
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M2 - Algorithmic Engines & Business Logic

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Authoritative Documents to Read FIRST:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read lines 24-48)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Explorer 1 (Calendar): C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1\handoff.md
4. Blueprint from Explorer 2 (Menu Planner): C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2\handoff.md
5. Blueprint from Explorer 3 (Shopping & Timeline): C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_3\handoff.md

Write Ownership:
You own exclusively:
- src/lib/ics-parser.ts
- src/lib/menu-planner.ts
- src/lib/shopping-aggregator.ts
- src/lib/timeline-scheduler.ts
- src/lib/gemini.ts
- tests/unit/ics-parser.test.ts
- tests/unit/menu-planner.test.ts
- tests/unit/shopping-aggregator.test.ts
- tests/unit/timeline-scheduler.test.ts
DO NOT touch any files in .agents/teamwork/ except your own working directory.

Tasks:
1. Implement `src/lib/ics-parser.ts`:
   - RFC 5545 stream parser (unfolding, unescaping, timezones +9h JST).
   - Non-meal event filter (excludes medical, chores, work, beauty, dining out with food-keyword rescue).
   - Multi-dish title splitter (punctuation delimiters, respects compound dishes like "豚バラと大根...").
   - Dish alias normalizer (harmonizes spelling variants into canonical dishes, retains aliases).
   - Frequency classifier (>= 5 cookCount -> 'needs_registration' / Household Classics; 1..4 -> 'ai_provisional').
   - Seeding outputs for `ParsedDish[]` and `ParsedDailyMenu[]`.
2. Implement `src/lib/menu-planner.ts`:
   - 3-slot meal triad structure (`主菜`, `副菜`, `汁物`).
   - Scoring formulas: context keyword match (+50), 14-day recency cooldown penalty (-100, -60, -30), protein rotation penalty (-40, -20), classics bonus (+15), wishlist bonus (+25), stochastic jitter.
   - Slot locking preservation (locked slots NEVER replaced during proposal).
   - Single-slot candidate shuffle.
   - New recipe challenge injection from wishlist stock or trusted web.
3. Implement `src/lib/shopping-aggregator.ts`:
   - Servings multiplier scaling (fractions, decimals, culinary units, unscaled qualitative units).
   - Cross-dish duplicate ingredient consolidation.
   - 2-stage partitioning against 17 staples (`DEFAULT_STAPLE_ITEMS`).
   - 1-tap staple promotion logic.
   - LINE shopping memo formatter (`【MM/DD 買い物メモ】\n・...`).
4. Implement `src/lib/timeline-scheduler.ts`:
   - Deterministic DAG scheduler: Phase 1 Prep/Cutting & Microwave pre-cook -> Phase 2 Simmering Side & Soup -> Phase 3 Hot Stovetop Finish.
   - Board hygiene sequence (veggies -> tofu -> meat/fish).
   - Microwave pre-cook queue and <= 2 stove burners constraint.
5. Implement `src/lib/gemini.ts`:
   - `@google/genai` client with 100% deterministic offline fallback when `GEMINI_API_KEY` is not present.
6. Create comprehensive unit tests:
   - `tests/unit/ics-parser.test.ts`
   - `tests/unit/menu-planner.test.ts`
   - `tests/unit/shopping-aggregator.test.ts`
   - `tests/unit/timeline-scheduler.test.ts`
7. Run tests and build:
   - `npm test` - ALL tests (foundation, db, adversarial, and all 4 new unit test suites) must pass 100%!
   - `npm run build` - must complete with exit code 0 and zero TypeScript or Next.js build errors.
8. Commit clean code to git (`git add -A && git commit -m "feat(m2): implement algorithmic engines and unit test suites"`).
9. Write `handoff.md` in your working directory and notify parent orchestrator via send_message.
