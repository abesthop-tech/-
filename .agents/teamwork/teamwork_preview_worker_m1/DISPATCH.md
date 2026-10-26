## 2026-10-26T03:43:27Z
You are teamwork_preview_worker_m1.
Working Directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_worker_m1
Project Root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Your parent orchestrator conversation ID: 35a3dc7b-a199-49dc-b838-a1010ac73ac1

Milestone: M1 - Core Foundation & Database

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Authoritative Documents to Read FIRST:
1. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY - read before starting)
2. C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\PROJECT.md
3. Blueprint from Explorer 1: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_1\handoff.md
4. Blueprint from Explorer 2: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_2\handoff.md
5. Blueprint from Explorer 3: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_3\handoff.md

Write Ownership:
You own exclusively the following files in the project root:
- git initialization (.git) and .gitignore
- package.json, tsconfig.json, next.config.mjs, postcss.config.mjs, tailwind.config.ts, vitest.config.ts, drizzle.config.ts, .env.example
- src/db/schema.ts, src/db/index.ts, src/db/seed.ts
- src/middleware.ts, src/app/api/auth/verify/route.ts
- src/app/globals.css, src/app/layout.tsx, src/app/page.tsx
- tests/unit/foundation.test.ts, tests/unit/db.test.ts
DO NOT touch any files in .agents/teamwork/ except your own working directory.

Tasks:
1. Initialize git repository in project root (`git init`) and create `.gitignore` and `.env.example`.
2. Create `package.json` with exact scripts and dependencies specified by Explorer 1 (use `npm install`).
3. Create `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, and `drizzle.config.ts`.
4. Create database modules: `src/db/schema.ts`, `src/db/index.ts` (with auto-table creation fallback `ensureDatabaseInitialized`), and `src/db/seed.ts` (with 17 staples, 13 authentic classics, and 14-day history).
5. Create `src/middleware.ts` for passcode authentication and `src/app/api/auth/verify/route.ts`.
6. Create minimal baseline Next.js App Router shell (`src/app/layout.tsx`, `src/app/globals.css` with Warm Editorial/Dark tokens, and `src/app/page.tsx`).
7. Create test suites `tests/unit/foundation.test.ts` and `tests/unit/db.test.ts`.
8. Execute verification:
   - Run `npm test` (via Vitest) - ALL tests must pass (100%).
   - Run `npm run build` - must complete with exit code 0 and zero TypeScript or Next.js build errors.
9. Write a comprehensive `handoff.md` in your working directory documenting what was built, exact commands run, test and build outputs, and verification results.
10. Send a message to your parent orchestrator with your results and handoff.md path.
