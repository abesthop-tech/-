# UI/UX Specification Mining & Design Craft Handoff

**Agent**: `teamwork_preview_spec_miner_survey_1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_spec_miner_survey_1`  
**Date**: `2026-10-26T03:32:00Z`  
**Parent Conversation ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Navigation & Shell | Date Navigation & Stepper | Header navigation displaying current date (e.g. `10.26`), Japanese day of week (`月`), and context badge (`今日`, `昨日`, `明日`). Left/Right arrows navigate days. | Click `◀` / `▶` (prev/next day delta) | Updates date heading, day of week, today tag, and dynamic watermark typography | Clamped to available date range | `ui_mock.html:140-154`, `ORIGINAL_REQUEST.md:20` |
| 2 | Navigation & Shell | Servings Stepper | Interactive counter to adjust household portion scale (default 3人分, range 1..8). | Click `−` / `＋` buttons | Updates displayed servings (`N人分`) and scales ingredient measurements across recipes and shopping lists | Clamped within [1, 8] range | `ui_mock.html:157-162, 731-735`, `implementation_plan.md:111` |
| 3 | Navigation & Shell | Primary Tier 1 Tabs | 3-tab segmented navigation between `献立` (Menu), `買い物` (Shopping + badge counter), and `調理工程` (Cooking Process). | Click on tab button | Switches visible section container; updates active button styling to `surface-sheet` with `font-semibold` | N/A (always defaults to valid tab) | `ui_mock.html:165-175, 634-647` |
| 4 | Navigation & Shell | Light/Dark Theme Switcher | Header toggle switching between Warm Editorial light mode and Atmospheric Dark mode. | Click theme toggle button | Toggles `dark` class on `<html>`, updating CSS color variables, ambient glow, and watermark tint | Fallback to light mode if class toggle fails | `ui_mock.html:9-41, 127-132, 763-767`, `ORIGINAL_REQUEST.md:19` |
| 5 | Navigation & Shell | Viewport Mode Toggle | Dev/preview control switching container width between mobile smartphone (390px) and PC/tablet (640px / `max-w-xl`). | Click `スマホ幅` / `PC・タブレット幅` | Updates container CSS max-width class (`max-w-[390px]` vs `max-w-xl`) | Defaults to mobile width | `ui_mock.html:120-126, 746-761` |
| 6 | Menu Planning | Leftover / Request Context Bar | Input field allowing user to type leftover fridge items or specific dinner requests (e.g. "大根、豚バラ", "魚系、さっぱり"). | Text input string + click `提案する` (Primary CTA) | Triggers candidate scoring, prioritizing matching ingredients for unlocked meal slots | Empty input uses history cooldown and recency rules | `ui_mock.html:183-207, 663-671`, `ORIGINAL_REQUEST.md:32-34` |
| 7 | Menu Planning | Recency Context & Anti-Repetition | Context indicator reflecting previous day's meal (e.g. "前日: 鶏の唐揚げ（肉・揚げ物）を考慮中") to enforce protein variety. | Date selection / DB meal history | Displays textual reminder of yesterday's protein/cooking style | Gracefully omitted if no prior day record | `ui_mock.html:201-202`, `implementation_plan.md:146` |
| 8 | Menu Planning | New Recipe Challenge Button | Action link `＋ 新レシピを1品混ぜる` that injects a recipe from the wishlist stock or trusted web sites. | Click `＋ 新レシピを1品混ぜる` | Unlocks side/main dish slot and switches candidate to challenge recipe with `新レシピ挑戦` badge | If wishlist is empty, queries trusted recipe API | `ui_mock.html:203-206, 673-679`, `ORIGINAL_REQUEST.md:33` |
| 9 | Menu Planning | 3-Slot Meal Structure | Structured display of `主菜` (Main), `副菜` (Side), and `汁物` (Soup) within a single 1px divider container. | Dish master & daily slot state | Renders slot role, recipe source, cook count/recency metadata, dish name, and main ingredients | Missing slot shows placeholder prompt | `ui_mock.html:209-212, 506-550`, `design_spec.md:48-58` |
| 10 | Menu Planning | Slot Lock Control | Button toggling slot locked state (`固定` vs `固定中`) for cases where a family member (e.g. grandfather) already made a dish. | Click `固定` button | Changes button to accent-tinted `固定中`; disables shuffle button for this slot | Locked slots are preserved during batch re-proposal | `ui_mock.html:529-537, 650-653`, `ORIGINAL_REQUEST.md:32` |
| 11 | Menu Planning | Single-Slot Shuffle | Instant candidate replacement button (`変更`) on unlocked dish slots. | Click `変更` button on slot | Cycles candidate dishes to the next proposal; updates cooking view simultaneously | Disabled with `opacity: 0.4` when slot is locked | `ui_mock.html:538-545, 655-661`, `design_spec.md:57` |
| 12 | Shopping List | Stage 1: Main Shopping List (`買うもの`) | Aggregated shopping checklist for fresh meats, fish, tofu, and main vegetables with real-time unchecked item counter. | Scaled dish ingredients from active menu | Renders checkboxes with item name, quantity, dish source; updates badge counter | Scaled to selected servings | `ui_mock.html:229-245, 553-577`, `ORIGINAL_REQUEST.md:37-38` |
| 13 | Shopping List | Checklist Strike-Through | Interactive checkboxes for marking purchased items in the supermarket. | Click on row or checkbox | Toggles `checked` state; applies `line-through opacity-45`; decrements remaining counter | Unchecking restores full opacity and increments counter | `ui_mock.html:560-575, 681-685` |
| 14 | Shopping List | Stage 2: Household Staples Check (`家にあるかも`) | Horizontal wrap chips displaying configured staple vegetables and basic seasonings (onions, garlic, ginger, eggs, soy sauce, etc.). | Configured staple items intersecting with recipe ingredients | Rendered as clickable pill chips (`＋ 長ねぎ (1/2本)`, `＋ しょうが`) | When empty, displays "すべて買うものリストへ移動済みです" | `ui_mock.html:248-256, 578-590`, `ORIGINAL_REQUEST.md:38-39` |
| 15 | Shopping List | 1-Tap Staple Promotion | Tapping any staple chip in Stage 2 immediately promotes it into Stage 1 (`買うもの`). | Click on staple chip button | Removes chip from Stage 2; appends item to Stage 1 list with amount `補充` and dish tag `常備品` | Instant DOM update without page reload | `ui_mock.html:584-589, 687-699`, `design_spec.md:74` |
| 16 | Shopping List | LINE Export & Copy | Formats unchecked items from Stage 1 into a clean Japanese bulleted shopping memo for LINE sharing. | Click `LINE用にコピー` (Primary CTA) | Copies text to clipboard, displays preview toast, and triggers `navigator.share` / LINE URL scheme | Fallback to text box display if clipboard API is blocked | `ui_mock.html:236-240, 259-265, 701-706`, `ORIGINAL_REQUEST.md:40` |
| 17 | Cooking Mode | Mode Switcher (Parallel vs Individual) | Segmented toggle button between `まとめ工程（3品並行）` and `料理別に見る`. | Click toggle buttons | Switches DOM view between parallel multi-dish timeline and individual dish recipe cards | Retains step completion state across mode switches | `ui_mock.html:274-284, 708-724`, `ORIGINAL_REQUEST.md:43` |
| 18 | Cooking Mode | Estimated Total Time Badge | High-visibility badge indicating total cooking duration (e.g. `目安 25分`). | Sum of parallel phase timelines | Renders tabular numeral time badge in header | Defaults to single longest dish time if calculation fails | `ui_mock.html:283` |
| 19 | Cooking Mode | Parallel Cooking Timeline View | Merged cooking flow organizing multi-dish preparation into unified phases (Prep/Cutting -> Side/Soup Stovetop -> Main Dish Finish). | Gemini timeline output / deterministic fallback | Numbered step cards with phase title, time window, dish tags, and combined instructions | Fallback to sequential dish steps if parallel generation fails | `ui_mock.html:287-289, 594-611`, `ORIGINAL_REQUEST.md:43-45` |
| 20 | Cooking Mode | Cooking Step Completion Toggle | Tap on cooking step card to mark phase completed. | Click anywhere on step row | Switches number badge (`1`, `2`) to checkmark (`✓`) with accent background; applies `line-through opacity-45` | Can be tapped again to toggle uncompleted | `ui_mock.html:596-610, 726-729` |
| 21 | Cooking Mode | Individual Recipe Cards View | Detailed view per dish listing scaled ingredient measurements and sequential numbered preparation steps. | Dish candidates data & servings scale | Renders dish title, recipe source attribution, ingredient pill container, and numbered steps | Renders all 3 dishes in order of slot | `ui_mock.html:292-294, 613-630`, `design_spec.md:84` |
| 22 | Secondary Drawers (Tier 2) | Recipe Book & Wishlist Drawer (`レシピ帳・追加`) | Subdued secondary navigation button opening a bottom modal drawer with recipe inventory and 3 entry methods. | Click `レシピ帳・追加` card | Opens overlay drawer showing count ("定番 42 · 作ってみたい 5"), 3 add buttons, and wishlist items | Click backdrop or `閉じる` closes drawer | `ui_mock.html:303-310, 770-807`, `ORIGINAL_REQUEST.md:21` |
| 23 | Secondary Drawers (Tier 2) | 3 Recipe Entry Methods | Quick buttons within recipe drawer: `本の写真を撮る` (Photo OCR), `URL・検索追加` (Trusted sites), `手入力メモ` (Manual memo). | Click respective button | Launches photo file input, URL/query input dialog, or structured memo form | Graceful fallback if camera/API unavailable | `ui_mock.html:780-787`, `ORIGINAL_REQUEST.md:21, 66-69` |
| 24 | Secondary Drawers (Tier 2) | Wishlist 1-Tap Meal Assignment | Wishlist item rows have direct action buttons `今日の主菜にする` and `今日の副菜にする`. | Click assignment button | Assigns recipe to today's menu slot, recalculates shopping list, and closes drawer | Alerts user if slot was locked | `ui_mock.html:796, 803` |
| 25 | Secondary Drawers (Tier 2) | Calendar Meal History Drawer (`カレンダー履歴`) | Bottom modal drawer displaying past dates and recorded meal combinations with 1-tap `修正` (Edit) buttons. | Click `カレンダー履歴` card | Displays chronological list of past menus (e.g. `鶏の唐揚げ · ポテトサラダ · コーンスープ`) | Allows editing actual dish if plan changed | `ui_mock.html:311-318, 808-835`, `ORIGINAL_REQUEST.md:21, 86-89` |
| 26 | Footer Settings (Tier 3) | Google Calendar (`.ics`) Import Modal | Low-profile text link at footer launching initial `.ics` file upload and AI classification setup. | Click footer link -> select `.ics` file | Uploads calendar file; triggers parsing, deduplication, spelling normalization, and frequency-based classification | Reports non-meal event exclusion count and preview | `ui_mock.html:325-329, 836-864`, `ORIGINAL_REQUEST.md:22, 24-28` |
| 27 | Footer Settings (Tier 3) | Frequency-Based Classification Rule | Automatic tiering: dishes made >= 5 times classified as Household Classics (`needs_registration`); 1..4 times as AI provisional (`ai_provisional`). | `.ics` parsed dish cook count | Displays classification badge and preview of classic vs AI provisional recipes | Threshold configurable in settings | `ui_mock.html:849-855`, `ORIGINAL_REQUEST.md:26-27` |
| 28 | Footer Settings (Tier 3) | Household Staples Configuration | Editor for list of pantry staple items that should be sorted into Stage 2 rather than Stage 1. | Tag input / toggle list | Persists staple keywords in `appSettings` table | Resets to default staple set if cleared | `ui_mock.html:856-861`, `ORIGINAL_REQUEST.md:22, 38` |
| 29 | Footer Settings (Tier 3) | Family Passcode Lock | Simple shared family passphrase modal protection stored in 1-year HttpOnly cookie. | Enter passcode string | Sets authentication cookie and unlocks app without requiring multi-user account credentials | Re-prompts on incorrect passphrase | `design_spec.md:34`, `implementation_plan.md:78-80` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Servings Stepper | Decrement when servings = 1 | `changeServings(-1)` clamps to minimum value of 1 (`Math.max(1, ...)`); display stays `1人分`. Button remains interactive without negative or 0 values. |
| 2 | Servings Stepper | Increment when servings = 8 | `changeServings(1)` clamps to maximum value of 8 (`Math.min(8, ...)`); display stays `8人分`. |
| 3 | Date Navigation | Shift left from earliest history date (idx = 0) | `shiftDate(-1)` clamps index to 0 (`Math.max(0, ...)`); heading, day, and tag remain on earliest date. |
| 4 | Date Navigation | Shift right from latest forecast date (idx = 2) | `shiftDate(1)` clamps index to `days.length - 1`; heading, day, and tag remain on latest date. |
| 5 | Single-Slot Shuffle | User clicks `変更` on a slot where `locked = true` | The button has `disabled`, `style="opacity:0.4; cursor:not-allowed;"`, and `shuffleSlot` immediately returns if `slot.locked === true`. Candidate does not change. |
| 6 | Batch Re-proposal (`提案する`) | User has locked Main Dish (主菜) and clicks `提案する` | `reproposeUnlocked()` iterates over `dishSlots` and only updates `currentIdx` for slots where `!slot.locked`. Main dish stays intact, only Side and Soup change. |
| 7 | New Recipe Challenge | User clicks `＋ 新レシピを1品混ぜる` | `proposeNewChallenge()` explicitly sets `dishSlots[1].locked = false` and assigns `currentIdx = 1` (pointing to "新レシピ挑戦" candidate), re-rendering menu and cooking views. |
| 8 | Household Staples Promotion | User taps all chips in Stage 2 (`家にあるかも`) | When `stapleItems.length === 0`, Stage 2 container dynamically renders `<span class="text-xs py-1">すべて買うものリストへ移動済みです</span>`. |
| 9 | Shopping List LINE Copy | User checks off all items in Stage 1 and clicks `LINE用にコピー` | `mainShoppingItems.filter(i => !i.checked)` produces empty array; output text displays `【10/26 買い物メモ】\n` with no bullet items. |
| 10 | Cooking Step Toggle | User taps completed cooking step card again | `step.done = !step.done` toggles back to `false`; number reverts from `✓` to original index number, line-through and opacity styles are removed. |
| 11 | Cooking View Mode Switch | User switches between `まとめ工程` and `料理別に見る` after completing step 1 | Step completion state is preserved in memory; switching back to `まとめ工程` retains step 1 checked state. |
| 12 | Dark Theme Toggle | User toggles theme repeatedly | `document.documentElement.classList.toggle('dark')` dynamically switches CSS custom properties for canvas, surface, borders, text, glow, and watermark. Button label updates between `ダーク切替` and `ライト切替`. |
| 13 | Viewport Toggle | User switches between `mobile` and `pc` | Container class alternates between `max-w-[390px]` and `max-w-xl` (`576px-640px`). Layout remains single-column on both viewports without breaking into confusing multi-column grids. |
| 14 | Drawer Overlay | User clicks modal backdrop outside drawer content | Event handler closes drawer, removes `flex` class, and adds `hidden` class to backdrop overlay. |
| 15 | Special Characters in Dish Name | Dish name contains Japanese punctuation or slash (e.g. `鶏肉とキノコの包み焼き／和風だれ`) | Rendered cleanly with `palt` class and `leading-snug`, without clipping or line overflow. |

---

## 1. Observation

Direct code observations from authoritative sources:

### A. Color Palette & CSS Variables (`ui_mock.html:9-41`)
```css
:root {
  --bg-canvas: #FAF9F6;        /* Warm off-white page background */
  --bg-surface: #FFFFFF;       /* Pure white elevated sheet surface */
  --bg-subtle: #F3F2EE;        /* Neutral warm grey for tab bars and badges */
  --border-subtle: #E6E4DD;    /* 1px dividing lines and card borders */
  --border-strong: #C7C4B8;    /* High-contrast input borders and secondary button outlines */
  --text-primary: #1C1917;     /* Stone-900: Titles, headings, primary copy (NO pure #000) */
  --text-secondary: #57534E;   /* Stone-600: Ingredients, body instructions */
  --text-muted: #78716C;       /* Stone-500: Dates, counters, metadata */
  --accent-primary: #C2410C;   /* Terracotta: Single primary accent color */
  --accent-hover: #9A3412;     /* Darker terracotta on hover */
  --accent-subtle: #FFF7ED;    /* Orange-50: Tinted background for locked badges */
  --glow-color: rgba(194, 65, 12, 0.06);
  --dot-color: rgba(28, 25, 23, 0.045);
  --watermark-color: rgba(28, 25, 23, 0.035);
}

html.dark {
  --bg-canvas: #151821;        /* Smoky charcoal (NO sterile jet black #000000) */
  --bg-surface: #1C202B;       /* Deep slate surface sheet */
  --bg-subtle: #242936;        /* Subtle panel background */
  --border-subtle: rgba(255, 255, 255, 0.09);
  --border-strong: rgba(255, 255, 255, 0.22);
  --text-primary: #F4F5F7;     /* Off-white text */
  --text-secondary: #A3ACBF;   /* Medium slate body */
  --text-muted: #6E788C;       /* Slate muted captions */
  --accent-primary: #EA580C;   /* Warm terracotta in dark mode */
  --accent-hover: #C2410C;
  --accent-subtle: rgba(234, 88, 12, 0.14);
  --glow-color: rgba(234, 88, 12, 0.08);
  --dot-color: rgba(255, 255, 255, 0.035);
  --watermark-color: rgba(255, 255, 255, 0.03);
}
```

### B. Spatial Atmosphere Background Styling (`ui_mock.html:48-52, 116-118`)
- **Soft Ambient Glow**:
  `radial-gradient(circle at 50% 0%, var(--glow-color) 0%, transparent 65%)`
- **Subtle Dot Matrix**:
  `radial-gradient(var(--dot-color) 1px, transparent 1px)` with `background-size: 100% 100%, 20px 20px`
- **Watermark Typography**:
  Fixed at top-10, `text-[112px] font-bold tracking-tighter leading-none tabular`, `color: var(--watermark-color)`, `pointer-events-none select-none z-0`.

### C. Japanese Typography & Sizing (`ui_mock.html:46, 55-61, 96-104`, `design-system-rules.md:96-104`)
- **Font Stack**:
  `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'BIZ UDPGothic', 'Noto Sans JP', sans-serif;`
- **Typography Scale**:
  - `H1 (Page/Date)`: 24px (`text-2xl font-bold tracking-tight`), `font-feature-settings: "palt" 1`
  - `H2 (Section Header)`: 16px (`text-base font-semibold`)
  - `H3 (Dish / Item Title)`: 16px (`text-base font-semibold leading-snug palt`)
  - `Body / Recipe Steps`: 14px (`text-sm leading-relaxed`, `line-height: 1.75`, `max-w-[65ch]`)
  - `UI Labels / Table Data`: 14px (`text-sm font-medium`)
  - `Metadata / Captions`: 12px (`text-xs tabular font-medium`, `text-stone-500`)
  - `Numbers & Metrics`: Always apply `tabular-nums` / `.tabular`

### D. Single-Column Layout & Viewport Specifications (`ui_mock.html:136, 746-761`)
- **Mobile Width**: `max-w-[390px] w-full mx-auto px-3.5 pt-5`
- **Desktop/Tablet Width**: `max-w-xl` (`576px-640px`) `w-full mx-auto px-4 pt-6`
- **Single-Column Discipline**: Identical component order on smartphone, tablet, and PC to maintain spatial memory across cooking and shopping contexts.

### E. Micro-Interaction States & CSS Rules (`ui_mock.html:63-110, 560-610`)
- **1px Divider Lists (No nested shadow cards)**:
  `.surface-sheet { background-color: var(--bg-surface); border: 1px solid var(--border-subtle); }`
  `.divider-y > * + * { border-top: 1px solid var(--border-subtle); }`
- **Checkbox & Done State**:
  `input[type="checkbox"]` with `accent-[#C2410C]`; checked label text applies `line-through opacity-45`.
- **Cooking Step Number Badge**:
  `w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-xs font-bold tabular`. Uncompleted: `border-color: var(--border-strong); color: var(--text-secondary);`. Completed: `background-color: var(--accent-primary); border-color: var(--accent-primary); color: #fff;` displaying `✓`.
- **Slot Lock Button**:
  Default: `btn-secondary px-2.5 py-1 rounded-md text-xs font-medium` (`固定`). Locked: `background-color: var(--accent-subtle); color: var(--accent-primary); border: 1px solid var(--accent-primary);` (`固定中`).

---

## 2. Logic Chain

1. **User Persona & Kitchen Reality**:
   - The app is used by three family members (mother, grandfather, self). The mother frequently plans menus and shops; the grandfather often cooks the main dish; the user coordinates and manages recipe digitizations.
   - Using the app occurs in three distinct physical environments: (1) supermarket aisles with a phone in one hand, (2) kitchen counter with a tablet or phone propped up next to cutting boards, and (3) living room PC or tablet planning tomorrow's dinner.
   - Changing the layout between mobile and desktop (e.g. splitting into 3 columns on desktop) causes disorientation when moving from PC to phone. Therefore, a **unified single-column responsive container** (`max-w-[390px]` on phone, expanding to `max-w-xl` / `576px-640px` on PC) maintains absolute layout parity.

2. **Elimination of "AI Slop" via `human-crafted-ui`**:
   - Generic AI output relies on purple/cyan gradients, multiple nested cards with `shadow-lg`, and decorative emojis (🚀✨💡).
   - In contrast, high-craft human design relies on:
     - Organic Warm Editorial palette (`#FAF9F6` canvas, `#1C1917` Stone-900 text, single terracotta `#C2410C` accent).
     - 1px dividing lines (`divide-y`) inside a single elevated surface sheet.
     - Spatial atmosphere (ambient glow + 20px dot grid + watermark typography) so that reducing text does not result in a sterile blank screen.
     - Strict Japanese typography: `palt` on headings, `tabular-nums` on all numbers, `leading-relaxed` (1.75) on reading text with max 65 characters per line.

3. **2-Stage Shopping Cart & LINE Integration**:
   - Comprehensive inventory tracking of refrigerators always fails due to high maintenance overhead.
   - Splitting ingredients into Stage 1 (`買うもの` - fresh meats, fish, produce) and Stage 2 (`家にあるかも` - onions, garlic, soy sauce, eggs) solves this: users only check staple items if they are running low.
   - A single tap promotes a staple item to Stage 1. Unchecked Stage 1 items export directly to LINE with clean bulleted text.

4. **Multi-Dish Parallel Cooking vs. Recipe View**:
   - Cooking 3 separate dishes sequentially takes 60+ minutes and results in cold side dishes.
   - The parallel timeline merges preparation (cutting all vegetables first to reduce cutting board washing), staggers stovetop simmer times, and finishes the main dish hot right before serving.
   - For users who prefer studying one dish at a time, the mode switcher provides instant access to individual recipe cards.

---

## 3. Caveats

1. **Audio & Timer Permissions**:
   - When running timers on mobile web (iOS Safari / Android Chrome), background audio alerts require user interaction before the Web Audio API or audio elements can play. The first tap on a cooking step or timer button should prime the audio context.
2. **Mobile Viewport Safe Areas**:
   - The single-column container must include `padding-bottom: env(safe-area-inset-bottom, 16px)` and `padding-top: env(safe-area-inset-top, 0px)` so that bottom drawers and fixed headers do not collide with smartphone navigation bars.
3. **Clipboard API in Insecure / Embedded Contexts**:
   - `navigator.clipboard.writeText` requires HTTPS or localhost. The LINE copy feature must retain a fallback text display dialog (`line-toast`) with selectable text if clipboard access is denied.
4. **Deterministic Fallback for AI Features**:
   - In environments without an active `GEMINI_API_KEY` (such as automated tests or offline use), all API endpoints (`/api/menu`, `/api/cooking/timeline`, `/api/recipes/ocr`) must have deterministic mock fallback logic so that the entire UI remains functional.

---

## 4. Conclusion

The authoritative UI/UX specification for "kazoku-kondate" is defined in `ui_mock.html`, `design_spec.md`, `implementation_plan.md`, and `human-crafted-ui`.

### Key Architectural Standards for Implementation:
1. **Shell**: Next.js App Router + Tailwind CSS + `shadcn/ui` + `lucide-react`.
2. **Theme**: Light (`#FAF9F6` / `#FFFFFF` / `#1C1917` / `#C2410C`) and Dark (`#151821` / `#1C202B` / `#F4F5F7` / `#EA580C`) with ambient glow, 20px dot grid, and 112px watermark date.
3. **Information Hierarchy**:
   - **Tier 1 (Core)**: Date navigator, servings stepper, 3 main tabs (`献立`, `買い物`, `調理工程`).
   - **Tier 2 (Drawers)**: Bottom cards for `レシピ帳・追加` (Photo OCR, URL, manual) and `カレンダー履歴`.
   - **Tier 3 (Footer)**: Understated links for `.ics` calendar import, staples configuration, and family passcode lock.
4. **Interactivity**: Checkbox strike-throughs, 1-tap staple promotion, slot lock toggle, candidate shuffle, parallel cooking phase checks, and LINE export.

---

## 5. Verification Method

### A. Code Inspection
- Inspect `src/app/globals.css` to verify `--bg-canvas`, `--bg-surface`, `--accent-primary` (`#C2410C`), dot matrix, and ambient glow CSS rules.
- Inspect `src/components/` to verify zero decorative emojis, presence of `.palt` and `.tabular` typography classes, and `divide-y` list structures.

### B. Automated Verification
```powershell
# In project root: C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
npm install
npm test
npm run build
```
Verify zero TypeScript compilation errors and 100% test pass on shopping aggregation and menu planning logic.

### C. UI & Visual Craft Checklist
1. **Visual Atmosphere**:
   - Check background: Off-white `#FAF9F6` with subtle dot grid and top ambient glow.
   - Watermark: Large date (`10.26`) softly visible behind sheet content.
   - Dark mode toggle: Smoothly transitions to smoky charcoal `#151821` without neon saturation.
2. **Menu Interaction**:
   - Tap `固定` on 主菜 -> button shifts to accent-tinted `固定中`; `変更` button is disabled.
   - Tap `提案する` -> Unlocked slots shuffle while locked slot stays fixed.
   - Tap `＋ 新レシピを1品混ぜる` -> Slot unlocks and displays `新レシピ挑戦` badge.
3. **Smart Shopping Cart**:
   - Change servings from 3 to 6 -> Ingredient quantities double.
   - Tap staple item chip (`＋ 長ねぎ`) -> Immediately vanishes from Stage 2 and appears in Stage 1 under `常備品`.
   - Tap checkbox on shopping item -> Text gains line-through and fades to 45% opacity; counter decrements.
   - Tap `LINE用にコピー` -> Unchecked items format cleanly with bullet points and date header.
4. **Parallel Cooking**:
   - Switch between `まとめ工程` and `料理別に見る` -> Views alternate cleanly.
   - Tap cooking step -> Step number turns into `✓` with accent background; text strikes through.
