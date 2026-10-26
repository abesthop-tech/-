## 2026-10-26T04:16:34Z
You are teamwork_preview_explorer_m2_2.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M2 - Algorithmic Engines & Business Logic
Focus: Menu Planning Engine & Variety Balancer (`src/lib/menu-planner.ts`)

Authoritative Documents to Read:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read lines 31-36)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Survey 2: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_spec_miner_survey_2\handoff.md (Lines 303-436)

Objective:
Investigate and design the exact implementation of `src/lib/menu-planner.ts`:
- 3-slot meal triad structure: `主菜` (main), `副菜` (side), `汁物` (soup)
- Scoring objective formula:
  - Context match weight (+50 for leftover/request keyword matches)
  - 14-day recency cooldown penalty (-100 for <=3 days, -60 for 4-7 days, -30 for 8-14 days)
  - Protein rotation penalty (-40 if main dish protein matches yesterday's, -20 if matches 2 days ago)
  - Household classics bonus (+15 for >=5 cookCount)
  - Wishlist item bonus (+25)
  - Stochastic variety jitter
- Slot lock preservation: locked slots are NEVER replaced during batch re-proposal
- Single-slot candidate shuffle: cycles to the next ranked candidate for an unlocked slot
- "＋ 新レシピを1品混ぜる" challenge injection: selects from wishlist stock or trusted recipe sites
Provide complete TypeScript implementation blueprints and unit test specifications for `tests/unit/menu-planner.test.ts`.

Scope Boundaries:
- Read-only exploration. DO NOT write or edit source code in the project root.
- Write your report to:
  C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2\handoff.md
- Message parent orchestrator when complete.
