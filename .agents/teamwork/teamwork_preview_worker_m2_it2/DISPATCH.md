## 2026-10-26T05:24:44Z
You are teamwork_preview_worker_m2_it2.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_worker_m2_it2
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M2 - Algorithmic Engines & Business Logic (Iteration 2 Remediation)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Authoritative Documents to Read FIRST:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read lines 37-48)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Explorer 1: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_it2_1\handoff.md
4. Blueprint from Explorer 2: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_it2_2\handoff.md
5. Blueprint from Explorer 3: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_it2_3\handoff.md

Write Ownership:
You own exclusively:
- src/lib/timeline-scheduler.ts
- src/lib/shopping-aggregator.ts
- tests/unit/timeline-scheduler.test.ts
- tests/unit/adversarial_m2.test.ts
DO NOT touch any files in .agents/teamwork/ except your own working directory.

Tasks:
1. Replace `src/lib/timeline-scheduler.ts` with the complete drop-in replacement code from Explorer 1 handoff:
   - Ensure ALL hardcoded dish name branches (previously lines 140-148, 166-169, 193-195) are completely removed.
   - Genuine dynamic DAG generation based on provided dishes' actual ingredients and steps.
   - Sequential microwave resource queueing.
   - Dynamic total time calculation: $T_{\text{total}} = T_1 + T_2 + T_3$.
   - Defensive checks for undefined steps/ingredients and natural phrasing when cut sequence is empty.
2. Replace `src/lib/shopping-aggregator.ts` with the complete drop-in replacement code from Explorer 2 handoff:
   - Range quantity scaling: proportional scaling ($A \sim B \rightarrow (A \times R) \sim (B \times R)$) so `2〜3個` at 2x becomes `4〜6個`.
   - Parenthetical note scaling: e.g. `1束(約200g)` at 2x becomes `2束(約400g)` and descriptive notes (`1丁(水切り後)` at 2x -> `2丁(水切り後)`) are preserved.
   - Defensive guards for missing properties.
3. Update test assertions in `tests/unit/timeline-scheduler.test.ts` and `tests/unit/adversarial_m2.test.ts` per Explorer 3 blueprint:
   - In `tests/unit/timeline-scheduler.test.ts`: lines 71, 79, 86, 87 update to test dynamic DAG properties and add arbitrary dish test.
   - In `tests/unit/adversarial_m2.test.ts`: lines 243, 295, 679, 696 update assertions to test non-throwing null-safety, natural phrasing, and preserved units/ranges.
4. Execute full verification:
   - `npm test` - ALL tests (all 12 test suites, >229 tests) must pass 100%!
   - `npm run build` - must complete with exit code 0 and zero TypeScript or Next.js build errors.
5. Commit to git: `git add -A && git commit -m "fix(m2): implement dynamic DAG timeline scheduler, range scaling arithmetic, and test alignment"`.
6. Write `handoff.md` in your working directory and notify parent orchestrator via send_message.
