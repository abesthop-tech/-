## 2026-10-26T04:16:34Z
You are teamwork_preview_explorer_m2_1.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M2 - Algorithmic Engines & Business Logic
Focus: Calendar Engine (`src/lib/ics-parser.ts`)

Authoritative Documents to Read:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read lines 24-30)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Survey 2: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_spec_miner_survey_2\handoff.md

Objective:
Investigate and design the exact implementation of `src/lib/ics-parser.ts`:
- RFC 5545 stream parser for Google Calendar `.ics` files
- Non-meal event filter (detect and exclude work, medical, garbage, general appointments)
- Multi-dish title splitter (split punctuation: "、", "・", "＋", ",", "と", newlines)
- Orthographic alias normalizer (harmonize variants like "豚の生姜焼き", "しょうが焼き", "豚生姜焼")
- Frequency-based cook classifier (>= 5 occurrences -> 'needs_registration' / Household Classics; 1..4 -> 'ai_provisional')
- Seeding output formatting to produce valid `Dish` and `DailyMenu` objects
Provide complete TypeScript implementation blueprints and unit test specifications for `tests/unit/ics-parser.test.ts`.

Scope Boundaries:
- Read-only exploration. DO NOT write or edit source code in the project root.
- Write your report to:
  C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1\handoff.md
- Message parent orchestrator when complete.
