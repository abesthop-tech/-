# Original User Request

## 2026-10-26T03:27:15Z

Build a personal family cooking assistant web application ("kazoku-kondate") for smartphones, tablets, and PCs that imports past dish history from a Google Calendar (`.ics`) file, plans daily menus based on available ingredients and recent history, manages a two-stage shopping list with LINE sharing, and generates a multi-dish parallel cooking timeline.

Working directory: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
Integrity mode: development

Reference specifications and UI mock:
- Design Specification: `C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\design_spec.md`
- Implementation Plan: `C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\implementation_plan.md`
- Interactive UI Mock: `C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\ui_mock.html`

## Requirements

### R1. Human-Crafted Single-Column Web UI (Light/Dark & 3-Tier Hierarchy)
Provide a responsive single-column web application (identical structure on mobile and desktop) following the visual design in `ui_mock.html` and `implementation_plan.md`:
- Warm Editorial light mode (`#FAF9F6` canvas, `#FFFFFF` sheet, `#1C1917` text, `#C2410C` terracotta single accent) and Atmospheric Dark mode (`#151821` canvas, `#1C202B` surface) with a header toggle, watermark date typography, subtle dot texture, 1px `divide-y` lists (no nested shadow cards), and zero decorative emojis in the UI.
- **Tier 1 (Top / Primary)**: Date navigation (`◀ MM.DD 曜 ▶`), servings stepper, and 3 main tabs: `献立` (Menu), `買い物` (Shopping), and `調理工程` (Cooking Process).
- **Tier 2 (Subdued Secondary Drawers)**: `レシピ帳・追加` (Recipe book, "want to make" stock list, and recipe addition via book photo OCR, trusted site URL/search, or manual entry) and `カレンダー履歴` (Past meal calendar history with 1-tap editing).
- **Tier 3 (Unobtrusive Footer Settings)**: Modal for Google Calendar (`.ics`) initial import, household staple items configuration, and simple family passcode lock.

### R2. Google Calendar (`.ics`) Import & Frequency-Based Classification
Parse uploaded `.ics` calendar files to extract dates and event titles, filter out non-meal schedule events, split multi-dish event titles into individual dishes, normalize spelling variations (e.g., "生姜焼き", "しょうが焼き", "豚の生姜焼き"), and calculate total cook counts and last-cooked dates:
- Dishes cooked **5 or more times** are classified as "Household Classics (`needs_registration`)" with provisional ingredients so they can later be updated via recipe book photo OCR or manual input.
- Dishes cooked **1 to 4 times** automatically receive AI-generated standard ingredients and cooking steps (`ai_provisional`) that can be edited in the UI.
- Populate past dates into the calendar meal history (`dailyMenus`).

### R3. Context-Aware Menu Planning & Slot Controls
Support daily menu planning across 3 slots (`主菜` Main, `副菜` Side, `汁物` Soup):
- Allow locking any individual slot (e.g., when the grandfather already made the main dish or a family member requested a specific dish) and proposing or shuffling only the unlocked slots.
- Rank and propose candidates prioritizing: (1) user-entered leftover/desired ingredients, (2) avoiding dishes made in the last 14 days and alternating protein types from the previous day, and (3) mixing in items from the "want to make" stock list or trusted recipe sources (`sirogohan.com`, `kurashiru.com`, `kyounoryouri.jp`, `oceans-nadia.com`, `ameblo.jp/syunkon`, `lettuceclub.net`, `orangepage.net`) when recent history is repetitive or when the user clicks "＋ 新レシピを1品混ぜる".
- Confirming or updating a day's menu automatically records it in the calendar history.

### R4. Two-Stage Shopping List & LINE Export
Generate a shopping list scaled to the selected number of servings from the day's menu:
- Separate ingredients into **Stage 1: `買うもの` (Main Shopping List)** for fresh/main ingredients (aggregating duplicate ingredients across dishes) and **Stage 2: `家にあるかも` (Household Staples Check)** for configured staple vegetables and basic seasonings (onion, garlic, ginger, green onion, egg, soy sauce, mirin, sake, sugar, miso, oil, potato starch, dashi, etc.).
- Tapping a staple item in Stage 2 immediately promotes it into Stage 1 (`買うもの`).
- Provide a 1-tap "LINE用にコピー" / share action that formats unchecked items in Stage 1 into a clean bulleted shopping memo for LINE.

### R5. Multi-Dish Parallel Cooking Timeline & Gemini AI Integration
In the `調理工程` tab, allow switching between a **parallel timeline view (`まとめ工程`)** that merges preparation, cutting, microwave pre-heating, and stove timing across all dishes for the day, and an **individual recipe view (`料理別に見る`)**:
- Integrate `@google/genai` (`gemini-2.5-flash`) for `.ics` event normalization, recipe book photo OCR, trusted recipe extraction/generation, and parallel cooking timeline generation.
- Include a graceful deterministic fallback when `GEMINI_API_KEY` is not set (or in offline/test environments) so all features, `.ics` imports, OCR simulation, menu proposals, and parallel timelines remain fully functional and testable out of the box.

## Acceptance Criteria

### Build & Automated Verification
- [ ] `npm install && npm run build` completes with exit code 0 and zero TypeScript or Next.js build errors.
- [ ] Automated test suite (`npm test` via Vitest) passes 100% of tests covering:
  - `.ics` parsing, multi-dish splitting, non-food filtering, spelling normalization, and `>= 5` vs `1..4` frequency classification.
  - Menu recommendation and single-slot shuffle respecting locked slots, leftover ingredient matching, and 14-day recency cooldown.
  - Two-stage shopping list ingredient scaling, duplicate aggregation, staple separation, 1-tap promotion from staples to main list, and LINE memo text formatting.
  - Parallel cooking timeline generation and API route responses.

### End-to-End Functional & UI Verification
- [ ] Starting the app server and making HTTP requests to all API endpoints (`/api/menu`, `/api/recipes`, `/api/recipes/ocr`, `/api/recipes/import-url`, `/api/cooking/timeline`, `/api/ics-import`) returns valid JSON responses and persists state in the SQLite/LibSQL database.
- [ ] The rendered UI adheres to the Human-Crafted UI specification: zero emoji characters in UI templates, working Light/Dark mode toggle, single-column layout (`max-w-xl`) consistent across mobile and desktop viewports, and working Tier 1 / Tier 2 / Tier 3 navigation.
