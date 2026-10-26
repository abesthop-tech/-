# Project: kazoku-kondate (家族献立)

## Architecture
- **Framework**: Next.js 14 (App Router, TypeScript) + Tailwind CSS + `lucide-react`.
- **Database**: SQLite via `@libsql/client` (file: `local.db`) with Drizzle ORM (`drizzle-orm`, `drizzle-kit`). Pure JS/WASM compatible without native Windows C++ compilation requirements.
- **AI Engine**: `@google/genai` (`gemini-2.5-flash`) for unstructured OCR, calendar splitting, and recipe scraping, paired with a 100% deterministic offline fallback engine in `src/lib/gemini.ts`.
- **Testing**: `vitest` for unit, algorithmic, and route integration tests. Native Node 24 ESM execution.
- **UI Design System**: `human-crafted-ui` Warm Editorial (`#FAF9F6`) & Atmospheric Dark (`#151821`), single terracotta accent (`#C2410C`/`#EA580C`), ambient radial glow, 20px dot grid, 112px watermark typography, strict Japanese typography (`palt`, `tabular-nums`), 1px `divide-y` lists, zero decorative emojis. Unified single-column shell (`max-w-[390px]` to `max-w-xl`).

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Scaffolding & Git Init | Git init, package.json, TypeScript, Next.js 14, Tailwind, Drizzle, Vitest | M1 | survey_3 |
| 2 | SQLite Database Schema | Drizzle schema for `dishes`, `daily_menus`, `app_settings` tables | M1 | survey_2 |
| 3 | Database Connection & Client | `@libsql/client` + Drizzle client with automatic schema initialization | M1 | survey_2, survey_3 |
| 4 | Seed Data Engine | Initial household classics, 17 pantry staples, and sample 14-day history | M1 | survey_2 |
| 5 | Passcode Middleware | Next.js middleware comparing `APP_PASSCODE` with HttpOnly cookie | M1 | survey_2 |
| 6 | iCalendar (`.ics`) Parser | RFC 5545 stream parser extracting date and event summaries | M2 | survey_2 |
| 7 | Non-Meal Event Filter | Heuristic/regex & AI filter excluding non-cooking calendar events | M2 | survey_2 |
| 8 | Multi-Dish Title Splitter | Delimiter and NLP splitter separating combined dish titles | M2 | survey_2 |
| 9 | Dish Alias Normalizer | Orthographic normalizer uniting spelling variants into canonical dish | M2 | survey_2 |
| 10 | Cook Frequency Classifier | Classifies dishes: $\ge 5$ as Household Classics, $1..4$ as AI Provisional | M2 | survey_2 |
| 11 | Menu Balance Scoring Engine | Mathematical scoring: context matching, recency penalty, protein rotation | M2 | survey_2 |
| 12 | Slot Lock & Shuffle Logic | Preserves locked slots; cycles candidate proposals for unlocked slots | M2 | survey_2 |
| 13 | New Recipe Challenge Injection | Injects recipe from "Want to Make" wishlist or trusted online sources | M2 | survey_2 |
| 14 | Portion Scaling Arithmetic | Scales ingredient amounts by servings ratio; parses fractions & units | M2 | survey_2 |
| 15 | Duplicate Ingredient Consolidation | Merges identical ingredients across dishes with matching unit arithmetic | M2 | survey_2 |
| 16 | 2-Stage Shopping Aggregator | Partitions ingredients into Stage 1 (Buy) and Stage 2 (Household Staples) | M2 | survey_2 |
| 17 | 1-Tap Staple Promotion Logic | Promotes staple chip from Stage 2 into Stage 1 with "補充" amount tag | M2 | survey_1, survey_2 |
| 18 | LINE Shopping Memo Formatter | Formats unchecked Stage 1 items into Japanese bulleted LINE memo | M2 | survey_1, survey_2 |
| 19 | Parallel Timeline DAG Scheduler | Multi-dish preparation scheduler (Prep/Cut -> Simmer -> Hot Finish) | M2 | survey_2 |
| 20 | Kitchen Resource Constraint Rules | Cutting board hygiene (veggies before raw meat) & stove/microwave queues | M2 | survey_2 |
| 21 | Deterministic AI Offline Fallback | Rule-based offline fallbacks for menu, OCR, scraping, and timeline | M2 | survey_2, survey_3 |
| 22 | API: `/api/menu` | Route handler for fetching and proposing daily menus with slot locks | M3 | survey_2 |
| 23 | API: `/api/cooking/timeline` | Route handler for generating multi-dish parallel cooking timeline | M3 | survey_2 |
| 24 | API: `/api/recipes` | Route handler for listing, filtering, and creating recipe records | M3 | survey_2 |
| 25 | API: `/api/recipes/ocr` | Route handler for extracting recipe from cookbook photo upload | M3 | survey_2 |
| 26 | API: `/api/recipes/import-url` | Route handler for scraping recipes from trusted Japanese recipe sites | M3 | survey_2 |
| 27 | API: `/api/ics-import` | Route handler for uploading `.ics` file, importing and seeding DB | M3 | survey_2 |
| 28 | Atmospheric Design System | Warm Editorial & Dark tokens, ambient glow, dot grid, watermark | M4 | survey_1 |
| 29 | Header & Date Navigation | Date navigator `◀ MM.DD 曜 ▶`, day tags (今日/昨日), dynamic watermark | M4 | survey_1 |
| 30 | Servings Stepper Control | Portion counter `[1..8]` scaling all ingredients across views | M4 | survey_1 |
| 31 | Theme & Viewport Toggles | Light/Dark switch & Mobile (390px) / PC-Tablet (max-w-xl) preview toggles | M4 | survey_1 |
| 32 | Menu Planning Tab UI (`献立`) | Leftover search bar, recency banner, 3 dish slots with lock & shuffle | M4 | survey_1 |
| 33 | Shopping List Tab UI (`買い物`) | Scaled checklist, strikethrough, badge count, Stage 2 staple chips | M4 | survey_1 |
| 34 | LINE Export Button & Toast | "LINE用にコピー" button with clipboard write and preview toast | M4 | survey_1 |
| 35 | Cooking Mode Tab UI (`調理工程`) | Switcher (`まとめ工程` vs `料理別に見る`), total time, phase cards, checks | M4 | survey_1 |
| 36 | Recipe Book & Wishlist Drawer | Tier 2 slide-up drawer: OCR photo button, URL button, wishlist assign | M4 | survey_1 |
| 37 | Calendar Meal History Drawer | Tier 2 slide-up drawer: Past dates, dishes cooked, and 1-tap edit button | M4 | survey_1 |
| 38 | Footer Settings Modal | Tier 3 modal: `.ics` upload dialog, staple items editor, passcode form | M4 | survey_1 |
| 39 | End-to-End Test Suite | Comprehensive opaque-box test suite (Tiers 1-4) in `tests/` | E2E | survey_2, survey_3 |
| 40 | Adversarial Coverage Hardening | White-box stress tests, extreme edge cases, error recovery (Tier 5) | M5 | survey_1, survey_2 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Foundation & Database | Git init, Next.js 14 setup, Drizzle ORM schema, SQLite client, seed data, passcode middleware | none | DONE |
| M2 | Algorithmic Engines & Business Logic | `.ics` parser & classifier, menu scoring engine, portion scaling & 2-stage shopping aggregator, parallel cooking DAG scheduler, deterministic AI fallback | M1 | IN_PROGRESS |
| M3 | API Routes & Persistence Layer | Route handlers: `/api/menu`, `/api/cooking/timeline`, `/api/recipes`, `/api/recipes/ocr`, `/api/recipes/import-url`, `/api/ics-import` | M2 | PLANNED |
| M4 | High-Craft UI & Interactive Screens | Warm Editorial/Dark theming, header nav, servings stepper, 3 main tabs (`献立`, `買い物`, `調理工程`), Tier 2 drawers, Tier 3 settings modal | M3 | PLANNED |
| M5 | Final Milestone: E2E Verification & Adversarial Hardening | Phase 1: 100% E2E tests pass (Tiers 1-4). Phase 2: Tier 5 adversarial coverage hardening. Forensic integrity audit. Production build (`npm run build`). | M4, E2E | PLANNED |
| E2E | E2E Testing Track | Independent opaque-box test infrastructure and comprehensive test cases (Tiers 1-4) | M1 | PLANNED |

---

## Interface Contracts

### 1. Database ↔ Algorithmic Engines (`src/db/schema.ts` ↔ `src/lib/`)
```typescript
export interface DishRecord {
  id: string;
  name: string;
  aliasesJson: string; // string[]
  category: 'main' | 'side' | 'soup' | 'other';
  proteinType?: 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
  sourceType: 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist';
  sourceLabel?: string;
  sourceUrl?: string;
  recipeStatus: 'needs_registration' | 'ai_provisional' | 'confirmed';
  baseServings: number;
  ingredientsJson: string; // Array<{ name: string, amount: string, isStaple: boolean }>
  stepsJson: string; // string[]
  cookCount: number;
  lastCookedDate?: string; // YYYY-MM-DD
  createdAt: string;
}
```

### 2. Algorithmic Engines ↔ API Handlers (`src/lib/` ↔ `src/app/api/`)
- `proposeDailyMenu(date, servings, contextMemo, lockedSlots, pastMenus, allDishes, forceNew)` $\rightarrow$ `MealSlot[]`
- `consolidateAndPartitionShoppingList(dishes, targetServings, stapleList)` $\rightarrow$ `{ mainItems: ShoppingStateItem[], stapleItems: { id: number, name: string }[] }`
- `scheduleParallelCookingTimeline(dishes, servings)` $\rightarrow$ `{ estimatedMinutes: number, steps: ParallelTimelineStep[] }`
- `parseIcsCalendar(icsContent)` $\rightarrow$ `{ events: ParsedMealEvent[], nonMealCount: number }`

### 3. API Handlers ↔ UI Frontend (`src/app/api/` ↔ `src/components/`)
- Standard JSON responses with status 200 on success, status 400 on invalid inputs, 500/offline fallback with valid structured response.

---

## Code Layout

```
kazoku_kondate/
├── .agents/                      # Teamwork agent metadata (DO NOT TOUCH)
├── .env.example                  # Environment template (GEMINI_API_KEY, APP_PASSCODE)
├── .gitignore                    # node_modules, .next, local.db*, .env
├── next.config.mjs               # Next.js configuration
├── package.json                  # Scripts: dev, build, start, test, db:push
├── postcss.config.mjs            # PostCSS for Tailwind
├── tailwind.config.ts            # Tailwind color tokens & font-feature-settings
├── tsconfig.json                 # TypeScript strict configuration
├── vitest.config.ts              # Vitest configuration with alias support
├── drizzle.config.ts             # Drizzle kit configuration for SQLite
├── local.db                      # Local SQLite file database
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Global HTML/head, theme provider, fonts
│   │   ├── page.tsx              # Single-column 3-tier main layout
│   │   ├── globals.css           # Warm Editorial & Atmospheric Dark CSS variables
│   │   └── api/
│   │       ├── menu/route.ts
│   │       ├── recipes/route.ts
│   │       ├── recipes/ocr/route.ts
│   │       ├── recipes/import-url/route.ts
│   │       ├── cooking/timeline/route.ts
│   │       └── ics-import/route.ts
│   ├── components/
│   │   ├── header-nav.tsx        # Date navigation, servings stepper, theme toggle
│   │   ├── menu-view.tsx         # Tier 1 Menu 3-slot list with lock & shuffle
│   │   ├── shopping-view.tsx     # Tier 1 2-stage shopping & LINE text generator
│   │   ├── cooking-view.tsx      # Tier 1 Parallel cooking timeline view
│   │   ├── recipe-drawer.tsx     # Tier 2 Recipe book & OCR/URL import drawer
│   │   ├── history-drawer.tsx    # Tier 2 Calendar meal history drawer
│   │   └── settings-drawer.tsx   # Tier 3 Google calendar (.ics) import & staples modal
│   ├── db/
│   │   ├── schema.ts             # dishes, dailyMenus, appSettings
│   │   ├── index.ts              # @libsql/client + drizzle client setup
│   │   └── seed.ts               # Default staple ingredients & sample classics
│   └── lib/
│       ├── ics-parser.ts         # .ics parsing, multi-dish split, frequency count
│       ├── shopping-aggregator.ts# Scaled 2-stage aggregation & LINE formatting
│       ├── menu-planner.ts       # Slot locking, recency cooldown, heuristic shuffle
│       ├── timeline-scheduler.ts # Parallel cooking DAG timeline scheduler
│       └── gemini.ts             # @google/genai client + deterministic offline fallback
└── tests/
    ├── e2e/
    │   ├── tier1-feature-coverage.test.ts
    │   ├── tier2-boundary-corner.test.ts
    │   ├── tier3-cross-feature.test.ts
    │   └── tier4-real-world-scenarios.test.ts
    └── unit/
        ├── ics-parser.test.ts
        ├── shopping-aggregator.test.ts
        ├── menu-planner.test.ts
        └── timeline-scheduler.test.ts
```
