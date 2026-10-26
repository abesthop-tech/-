## 2026-10-26T04:07:48Z
You are teamwork_preview_worker_m1_it2.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_worker_m1_it2
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M1 - Core Foundation & Database (Iteration 2 Remediation)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Authoritative Documents to Read FIRST:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Middleware Fix Blueprint: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_1\handoff.md
4. Database Schema & Index Fix Blueprint: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_2\handoff.md
   (Also see proposed files: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_2\proposed_schema.ts and proposed_index.ts)
5. Test Execution Blueprint: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_3\handoff.md

Write Ownership:
You own exclusively:
- src/middleware.ts
- src/app/api/auth/verify/route.ts
- src/db/schema.ts
- src/db/index.ts
- tests/unit/adversarial_db_stress.test.ts
DO NOT touch any files in .agents/teamwork/ except your own working directory.

Tasks:
1. Apply the middleware fixes to `src/middleware.ts`:
   - Route precedence: ensure paths starting with `/api/` (case-insensitive) NEVER get bypassed by the static file extension regex.
   - Fix trailing slash handling for `/api`.
   - Fix overly broad prefix match on `/api/auth` (only allow `/api/auth/verify` or `/api/auth/*`).
2. Apply the auth route fixes to `src/app/api/auth/verify/route.ts`:
   - Gracefully handle null body, non-object body, and non-string `passcode` returning 400 Bad Request instead of throwing an unhandled TypeError.
3. Apply the database fixes to `src/db/schema.ts` and `src/db/index.ts`:
   - Replace `|| 3` with `?? 3` for `baseServings` and `servings`.
   - Implement exported `safeJsonParse` helper function with typed fallback in schema helpers (`parseDish`, `parseDailyMenu`).
   - Refine auto-seed check in `src/db/index.ts` to strictly `dishCount === 0`.
4. Update assertions in `tests/unit/adversarial_db_stress.test.ts` to verify the fixed behavior (lines 396 and 476).
5. Run full test verification:
   - `npm test` (all tests in foundation.test.ts, db.test.ts, adversarial-auth.test.ts, adversarial_db_stress.test.ts must pass 100%).
   - `npm run build` must complete with exit code 0 and zero TypeScript or Next.js build errors.
6. Commit the clean fixes to git (`git add -A && git commit -m "fix(m1): harden middleware security, auth validation, and db schema"`).
7. Write `handoff.md` in your working directory and message parent orchestrator.
