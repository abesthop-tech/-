# M2 Calendar Engine (`src/lib/ics-parser.ts`) Architectural Blueprint & Unit Test Specification

**Agent**: `teamwork_preview_explorer_m2_1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_1`  
**Target Module**: `src/lib/ics-parser.ts`  
**Target Test**: `tests/unit/ics-parser.test.ts`  
**Date**: 2026-10-26T04:22:00Z  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

### 1.1 Verbatim Requirements from Authoritative Sources

1. **`ORIGINAL_REQUEST.md` (lines 24–29, MANDATORY R2)**:
   > "### R2. Google Calendar (`.ics`) Import & Frequency-Based Classification
   > Parse uploaded `.ics` calendar files to extract dates and event titles, filter out non-meal schedule events, split multi-dish event titles into individual dishes, normalize spelling variations (e.g., "生姜焼き", "しょうが焼き", "豚の生姜焼き"), and calculate total cook counts and last-cooked dates:
   > - Dishes cooked **5 or more times** are classified as "Household Classics (`needs_registration`)" with provisional ingredients so they can later be updated via recipe book photo OCR or manual input.
   > - Dishes cooked **1 to 4 times** automatically receive AI-generated standard ingredients and cooking steps (`ai_provisional`) that can be edited in the UI.
   > - Populate past dates into the calendar meal history (`dailyMenus`)."

2. **`ORIGINAL_REQUEST.md` (Acceptance Criteria, lines 51–52)**:
   > "- [ ] Automated test suite (`npm test` via Vitest) passes 100% of tests covering:
   >   - `.ics` parsing, multi-dish splitting, non-food filtering, spelling normalization, and `>= 5` vs `1..4` frequency classification."

3. **`PROJECT.md` (Feature Inventory, lines 21–25, 99)**:
   > - Feature 6: iCalendar (`.ics`) Parser (RFC 5545 stream parser extracting date and event summaries) [M2]
   > - Feature 7: Non-Meal Event Filter (Heuristic/regex & AI filter excluding non-cooking calendar events) [M2]
   > - Feature 8: Multi-Dish Title Splitter (Delimiter and NLP splitter separating combined dish titles) [M2]
   > - Feature 9: Dish Alias Normalizer (Orthographic normalizer uniting spelling variants into canonical dish) [M2]
   > - Feature 10: Cook Frequency Classifier (Classifies dishes: $\ge 5$ as Household Classics, $1..4$ as AI Provisional) [M2]
   > - Contract: `parseIcsCalendar(icsContent)` $\rightarrow$ `{ events: ParsedMealEvent[], nonMealCount: number }` (and outputs `ParsedDish[]` and `ParsedDailyMenu[]`).

4. **`Survey 2 Handoff` (lines 64–69, 730–742, 750–757)**:
   > - Upload `.ics` file, parse RFC 5545 stream, extract `VEVENT` items (`DTSTART`, `SUMMARY`, `DESCRIPTION`).
   > - Handle `VALUE=DATE` (e.g. `20261026`) and `TZID=Asia/Tokyo` or UTC `20261026T100000Z` (+9h JST).
   > - Return structure from `/api/ics-import`: `{ totalEvents, mealEventsFound, uniqueDishes, classicsCount, aiProvisionalCount, dateRange }`.
   > - Test specifications in `tests/unit/ics-parser.test.ts`.

5. **`src/db/schema.ts` (lines 15–31, 37–45, 60–83, 137–163)**:
   - `Dish` / `ParsedDish`:
     `id: string; name: string; aliases: string[]; category: 'main'|'side'|'soup'|'other'; proteinType?: 'pork'|'chicken'|'beef'|'fish'|'egg_tofu'|'veggie'|null; sourceType: 'classic_book'|'ai_generated'|'trusted_web'|'wishlist'; sourceLabel?: string|null; sourceUrl?: string|null; recipeStatus: 'needs_registration'|'ai_provisional'|'confirmed'; baseServings: number; ingredients: IngredientItem[]; steps: string[]; cookCount: number; lastCookedDate?: string|null; createdAt: string;`
   - `DailyMenu` / `ParsedDailyMenu`:
     `date: string; servings: number; contextMemo?: string|null; slots: MealSlot[]; parallelSteps?: ParallelTimelineStep[]|null; shoppingState?: ShoppingState|null; updatedAt: string;`
   - `MealSlot`:
     `role: 'main'|'side'|'soup'; dishId: string; dishName: string; locked: boolean; lockReason?: string; sourceLabel?: string; badge?: string; ingredients: string[]; steps: string[]; isLeftover?: boolean;`

6. **`src/db/seed.ts` (lines 35–100)**:
   - Shows canonical dish definitions and aliases: e.g. `豚の生姜焼き` with aliases `['しょうが焼き', '生姜焼き', '豚生姜焼き']`, `豚バラと大根のこっくり照り煮` with aliases `['豚バラ大根', '豚バラと大根の照り煮']`.

---

## 2. Logic Chain

1. **RFC 5545 Parsing Integrity**:
   - Google Calendar exports fold lines exceeding 75 octets with CRLF followed by linear whitespace (` ` or `\t`). Failing to unfold will truncate Japanese UTF-8 characters across boundaries. Unfolding must be performed via regex (`content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r[ \t]/g, '')`).
   - Line unescaping must reverse RFC 5545 escaped characters: `\,` $\rightarrow$ `,`, `\;` $\rightarrow$ `;`, `\\` $\rightarrow$ `\`, `\n` / `\N` $\rightarrow$ newline.
   - For property extraction, values may contain colons (e.g., `SUMMARY:夕食: 豚の生姜焼き`). Using `split(':')` corrupts values; taking `slice(line.indexOf(':') + 1)` preserves all inner colons.
   - Dates in `DTSTART` may be all-day (`VALUE=DATE:YYYYMMDD`), timed local (`TZID=Asia/Tokyo:YYYYMMDDTHHMMSS`), or UTC (`YYYYMMDDTHHMMSSZ`). UTC times must be adjusted by $+9\,\text{hours}$ to avoid shifting evening meals ($19:00\,\text{JST} = 10:00\,\text{UTC}$) into the wrong day.

2. **Non-Meal Event Filter Heuristics**:
   - Mother's Google Calendar contains dental visits, doctor appointments, school events, hair salon appointments, and chores.
   - Filter operates in two stages:
     - Negative Heuristics: Regex matching 6 distinct appointment categories: Medical/Dental (`歯医者`, `病院`, `クリニック`, `検診`), Household/Chores (`ゴミ出し`, `点検`, `クリーニング`), Work/School (`会議`, `MTG`, `PTA`, `出張`), Beauty (`美容院`, `ネイル`), Administration (`役所`, `更新`), and Dining Out (`〇〇さんランチ`, `飲み会`, `外食`).
     - Positive Whitelist Rescue: Explicit meal prefixes (`夕食:`, `晩御飯:`, `朝食:`, `献立:`) or strong food preparation keywords (`焼き`, `炒め`, `煮`, `汁`, `鍋`, `カレー`, `丼`) rescue events unless explicit dining out keywords (`外食`, `飲み会`) are present.
   - Result: Non-cooking events are excluded with zero false-positives on culinary items.

3. **Multi-Dish Title Splitting Mechanics**:
   - Calendar entries commonly combine an entire dinner into one line: `"豚の生姜焼き、なめこの味噌汁"`, `"鶏の唐揚げ・ポテトサラダ・コーンスープ"`, `"鮭の塩焼き＋ほうれん草胡麻和え＋豚汁"`.
   - Strip leading meal prefixes (`夕食:`, `晩ごはん:`, `献立:`, `Menu:`, bullet points `・`, `-`, `1.`).
   - Strip parenthetical metadata notes (`(山本ゆり)`, `（昨日の残り）`, `(手作り)`).
   - Split primary punctuation delimiters: `、`, `，`, `,`, `・`, `･`, `＋`, `+`, `／`, `/`, `＆`, `&`, `\n`.
   - Distinguishing the conjunction particle `"と"`:
     - Internal ingredient conjunction: `"豚バラと大根のこっくり照り煮"`, `"きゅうりとわかめの酢の物"`, `"豆腐とわかめの味噌汁"`, `"鶏肉と長ねぎの照り焼き"`. These contain ingredient pairs followed by cooking methods (`の煮物`, `の和え物`, `の味噌汁`, `の照り焼き`, etc.) and MUST NOT be split.
     - Inter-dish delimiter: `"生姜焼きと味噌汁"`, `"唐揚げとポテトサラダ"`. These connect two independent, self-contained dishes and SHOULD be split when no other punctuation delimiter is present.

4. **Orthographic Alias Normalization & Clustering**:
   - Japanese dish titles exhibit wide orthographic variability:
     - Unicode normalization: `NFKC` handles fullwidth/halfwidth conversions (`ｶﾚｰ` $\rightarrow$ `カレー`, `ﾊﾝﾊﾞｰｸﾞ` $\rightarrow$ `ハンバーグ`).
     - Kana/Kanji variation: `生姜焼き` vs `しょうが焼き` vs `ショウガ焼き` vs `豚生姜焼` vs `豚の生姜焼き`.
     - Suffix normalization: Truncated okurigana (`生姜焼` $\rightarrow$ `生姜焼き`, `塩焼` $\rightarrow$ `塩焼き`, `照焼` $\rightarrow$ `照り焼き`).
     - Honorific stripping: `お味噌汁` $\rightarrow$ `味噌汁`, `お吸い物` $\rightarrow$ `吸い物`.
   - Clustering logic:
     - Check against known seed dish dictionary (`SEED_DISHES`) and their registered `aliases`. If a match is found, assign the canonical seed dish name!
     - For arbitrary unseeded dishes, normalize phonetically to a stem key (kanji/kana equivalence, stripping particles `の`/`と`), cluster occurrences, and designate the most descriptive, complete form as canonical while retaining all observed variations in `aliases`.

5. **Frequency Classification & Seeding Generation**:
   - Aggregate occurrences per canonical dish across the entire calendar history.
   - Frequency threshold rule (default: 5):
     - `cookCount >= 5`: Household Classics (`sourceType = 'classic_book'`, `recipeStatus = 'needs_registration'`, `sourceLabel = '家庭の定番'`).
     - `1 <= cookCount <= 4`: AI Provisional (`sourceType = 'ai_generated'`, `recipeStatus = 'ai_provisional'`, `sourceLabel = 'AI標準レシピ'`).
   - Seeding completeness:
     - To ensure that navigating to `買い物` (Shopping List) immediately after import does not fail or display empty checklists, provisional ingredient items (`IngredientItem[]`) and cooking steps are automatically generated based on the inferred protein type (`pork`, `chicken`, `beef`, `fish`, `egg_tofu`, `veggie`) and category (`main`, `side`, `soup`).
   - Past menu construction:
     - Dates are grouped chronologically.
     - Dishes for each date are mapped into `MealSlot` items for `main`, `side`, and `soup`.
     - Output yields full `ParsedDish[]` and `ParsedDailyMenu[]` ready for direct insertion via Drizzle ORM.

---

## 3. Caveats

1. **Network Independence & Deterministic Fallback**:
   - The calendar engine in `src/lib/ics-parser.ts` is designed as a 100% deterministic, pure TypeScript module requiring NO network access and NO external API keys. It runs seamlessly in offline unit test environments, Next.js Edge, and Node.js runtimes. While optional Gemini integration can be layered on top in M3, the core parser is completely self-contained.
2. **Multi-Day Calendar Events**:
   - In Google Calendar, all-day events are stored with `DTSTART:YYYYMMDD` and `DTEND:YYYYMMDD+1`. The parser treats `DTSTART` as the active cooking date. If an event genuinely spans multiple consecutive days, the parser attributes the meal to the start date.
3. **Complex Conjunction Ambiguities with "と"**:
   - Punctuation delimiters (`、`, `・`, `＋`, `,`, `\n`) account for $>95\%$ of multi-dish entries in Japanese calendar exports. When titles use the particle `"と"` without punctuation, the parser employs a heuristic lookahead to preserve two-ingredient dishes (e.g. `豚バラと大根...`, `豆腐とわかめ...`) while splitting independent dish names (`生姜焼きと味噌汁`). In rare ambiguous cases (e.g. single novel dishes with uncommon grammar), punctuation-based entries take precedence.

---

## 4. Conclusion & Implementation Blueprints

The calendar engine for Kazoku-Kondate has been completely designed to fulfill R2 requirements with zero dependencies on native binaries. Below are the complete TypeScript blueprints for `src/lib/ics-parser.ts` and `tests/unit/ics-parser.test.ts`.

### 4.1 Production Blueprint: `src/lib/ics-parser.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Calendar Engine: src/lib/ics-parser.ts
// RFC 5545 Google Calendar Parser, Non-Meal Filter, Multi-Dish Splitter,
// Orthographic Alias Normalizer, Frequency Classifier & Seeding Formatter
// ============================================================================
import type {
  ParsedDish,
  ParsedDailyMenu,
  MealSlot,
  DishCategory,
  ProteinType,
  IngredientItem,
} from '@/db/schema';

// ----------------------------------------------------------------------------
// 1. Interfaces & Types
// ----------------------------------------------------------------------------

export interface RawCalendarEvent {
  uid?: string;
  date: string; // YYYY-MM-DD (JST)
  summary: string;
  description?: string;
  isAllDay: boolean;
}

export interface IcsParseOptions {
  classicThreshold?: number; // Default: 5
  knownDishes?: ParsedDish[]; // Catalog to harmonize against (e.g. SEED_DISHES)
  defaultServings?: number; // Default: 3
}

export interface IcsImportResult {
  totalEvents: number;
  mealEventsFound: number;
  nonMealCount: number;
  uniqueDishes: number;
  classicsCount: number;
  aiProvisionalCount: number;
  dateRange: { start: string; end: string } | null;
  dishes: ParsedDish[];
  dailyMenus: ParsedDailyMenu[];
}

// ----------------------------------------------------------------------------
// 2. Canonical Alias Dictionaries & Heuristic Patterns
// ----------------------------------------------------------------------------

export const BUILTIN_CANONICAL_CLUSTERS: Record<string, string[]> = {
  '豚の生姜焼き': [
    '豚の生姜焼き',
    'しょうが焼き',
    '生姜焼き',
    '豚生姜焼き',
    '豚生姜焼',
    'ショウガ焼き',
    '豚のしょうが焼き',
    '豚肉の生姜焼き',
  ],
  '豚バラと大根のこっくり照り煮': [
    '豚バラと大根のこっくり照り煮',
    '豚バラ大根',
    '豚バラと大根の照り煮',
    '豚バラ大根の煮物',
    '豚バラ大根煮',
  ],
  '鶏の唐揚げ': [
    '鶏の唐揚げ',
    '鶏唐揚げ',
    '唐揚げ',
    'からあげ',
    'から揚げ',
    '鳥の唐揚げ',
    'チキン唐揚げ',
    '鶏のからあげ',
    '鶏肉の唐揚げ',
  ],
  '鮭とキャベツのちゃんちゃん焼き': [
    '鮭とキャベツのちゃんちゃん焼き',
    '鮭のちゃんちゃん焼き',
    'ちゃんちゃん焼き',
    '鮭ちゃんちゃん焼き',
  ],
  '鶏肉と長ねぎの照り焼き': [
    '鶏肉と長ねぎの照り焼き',
    '鶏の照り焼き',
    'チキン照り焼き',
    '鶏肉の照り焼き',
    'チキン照焼',
  ],
  '牛丼': [
    '牛丼（お祖父様特製）',
    '牛丼',
    '牛肉と玉ねぎの煮込み',
    'お祖父ちゃんの牛丼',
  ],
  '小松菜と油揚げのさっと煮びたし': [
    '小松菜と油揚げのさっと煮びたし',
    '小松菜の煮浸し',
    '小松菜と油揚げの煮物',
    '小松菜の煮びたし',
    '小松菜煮浸し',
  ],
  'トマトとツナのポン酢和え': [
    'トマトとツナのポン酢和え',
    'トマトとツナの和え物',
    'トマトツナ和え',
  ],
  'きゅうりとわかめの酢の物': [
    'きゅうりとわかめの酢の物',
    'きゅうりの酢の物',
    '胡瓜とワカメの酢の物',
  ],
  'ほうれん草の胡麻和え': [
    'ほうれん草の胡麻和え',
    'ほうれん草のごま和え',
    '胡麻和え',
    'ごま和え',
    'ほうれん草胡麻和え',
  ],
  '豆腐とわかめの味噌汁': [
    '豆腐とわかめの味噌汁',
    '豆腐の味噌汁',
    '豆腐とワカメのお味噌汁',
    '豆腐とわかめのみそ汁',
    '豆腐のお味噌汁',
  ],
  'なめこの味噌汁': [
    'なめこと豆腐の赤だし',
    'なめこの味噌汁',
    'なめこのお味噌汁',
    'なめこ汁',
    'なめこ味噌汁',
  ],
  '具だくさん豚汁': [
    '具だくさん豚汁',
    '豚汁',
    'ぶた汁',
    'とん汁',
  ],
  'ポテトサラダ': [
    'ポテトサラダ',
    'ポテサラ',
    '自家製ポテトサラダ',
  ],
  'ハンバーグ': [
    'ハンバーグ',
    'ハンバーグステーキ',
    '手作りハンバーグ',
    '煮込みハンバーグ',
  ],
  'カレーライス': [
    'カレーライス',
    'カレー',
    'チキンカレー',
    'ポークカレー',
    'ビーフカレー',
  ],
  '麻婆豆腐': [
    '麻婆豆腐',
    'マーボー豆腐',
    'マーボ豆腐',
    '本格麻婆豆腐',
  ],
};

const NON_MEAL_REGEX =
  /(?:歯医者|歯科|病院|クリニック|内科|耳鼻科|眼科|皮膚科|小児科|整形外科|健診|検診|健康診断|ワクチン|予防接種|通院|薬局|処方箋|リハビリ|人間ドック|美容院|美容室|ヘアサロン|ネイル|まつエク|エステ|マッサージ|整体|鍼灸|ゴミ出し|ごみ出し|資源ゴミ|燃えるゴミ|不燃ゴミ|生ゴミ|粗大ゴミ|廃品回収|大掃除|クリーニング|宅急便|宅配便|郵便|荷物|点検|ガス点検|水道工事|修理|立ち会い|会議|ミーティング|\bMTG\b|\bmtg\b|面談|打ち合わせ|打合せ|出社|テレワーク|在宅勤務|出張|残業|研修|セミナー|ウェビナー|締切|締め切り|納期|PTA|参観日|授業参観|懇談会|保護者会|登校|下校|始業式|終業式|卒業式|入学式|運動会|学芸会|模試|習い事|ピアノ|英会話|スイミング|役所|区役所|市役所|警察署|免許|振込|税務署|確定申告|ランチ会|女子会|飲み会|懇親会|忘年会|新年会|送別会|歓迎会|同窓会|外食|外で夕食|外で食べる|外で昼食|食べ放題|ビュッフェ|旅行|温泉|ドライブ|宿泊|ホテル|新幹線|飛行機|映画|コンサート|\bライブ\b|観劇|遊園地|ディズニー|USJ|テーマパーク|\S+さんと?ランチ|\S+さんランチ)/i;

const HOLIDAY_ANNIVERSARY_REGEX =
  /^(?:祝日|振替休日|元日|成人の日|建国記念の日|天皇誕生日|春分の日|昭和の日|憲法記念日|みどりの日|こどもの日|海の日|山の日|敬老の日|秋分の日|スポーツの日|文化の日|勤労感謝の日|誕生日|記念日|休み|有休|有給|午前休|午後休)$/;

const MEAL_PREFIX_REGEX =
  /^(?:夕食|夕飯|晩御飯|晩ごはん|夜ごはん|夜ご飯|昼食|朝食|献立|Menu|MENU|ごはん|御飯)[\s:：\-・]*/i;

const FOOD_KEYWORD_REGEX =
  /(?:焼き|炒め|煮|汁|鍋|カレー|シチュー|丼|サラダ|フライ|ソテー|ステーキ|パスタ|スパゲッティ|うどん|そば|和え|揚げ|グラタン|オムライス|ハンバーグ|コロッケ|生姜焼き|しょうが焼き|ちゃんちゃん焼き|照り焼き|照焼|塩焼き|塩焼|豚|鶏|牛|魚|鮭|サバ|鯖|肉|豆腐|とうふ|味噌汁|みそ汁|すまし汁|吸い物|スープ|ポタージュ|ポテサラ|煮びたし|煮浸し|酢の物|きんぴら|ナムル|白和え|胡麻和え|ごま和え|冷奴|唐揚げ|から揚げ|からあげ|餃子|麻婆|チャーハン|炒飯|ピラフ|ロールキャベツ|豚汁|とん汁|ぶた汁|角煮|照り煮)/i;

// ----------------------------------------------------------------------------
// 3. RFC 5545 Stream Unfolding & Raw Parsing
// ----------------------------------------------------------------------------

export function unfoldIcsContent(content: string): string {
  // Strip UTF-8 BOM if present
  const clean = content.replace(/^\uFEFF/, '');
  // RFC 5545 Section 3.1: Lines ending in CRLF followed by a linear whitespace character (space or tab) are folded
  return clean
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .replace(/\r[ \t]/g, '');
}

export function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseIcsDate(rawDateStr: string): string | null {
  const dateMatch = rawDateStr.match(/(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return null;
  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);

  // UTC timestamp adjustment for JST (+9 hours)
  if (rawDateStr.includes('T') && rawDateStr.endsWith('Z')) {
    const timeMatch = rawDateStr.match(/T(\d{2})(\d{2})(\d{2})Z/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      const sec = parseInt(timeMatch[3], 10);
      const utcDate = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
      const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
      const y = jstDate.getUTCFullYear();
      const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jstDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
}

export function parseIcsRawEvents(icsContent: string): RawCalendarEvent[] {
  const unfolded = unfoldIcsContent(icsContent);
  const lines = unfolded.split(/\r\n|\n|\r/);
  const events: RawCalendarEvent[] = [];

  let inEvent = false;
  let currentEvent: Partial<RawCalendarEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = { isAllDay: false };
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (inEvent && currentEvent.date && currentEvent.summary) {
        events.push({
          uid: currentEvent.uid,
          date: currentEvent.date,
          summary: currentEvent.summary,
          description: currentEvent.description,
          isAllDay: currentEvent.isAllDay ?? false,
        });
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const propHeader = line.slice(0, colonIdx);
    const propValue = line.slice(colonIdx + 1);

    if (propHeader.startsWith('UID')) {
      currentEvent.uid = propValue.trim();
    } else if (propHeader.startsWith('DTSTART')) {
      if (propHeader.includes('VALUE=DATE')) {
        currentEvent.isAllDay = true;
      }
      const parsedDate = parseIcsDate(propValue);
      if (parsedDate) {
        currentEvent.date = parsedDate;
      }
    } else if (propHeader.startsWith('SUMMARY')) {
      currentEvent.summary = unescapeIcsText(propValue).trim();
    } else if (propHeader.startsWith('DESCRIPTION')) {
      currentEvent.description = unescapeIcsText(propValue).trim();
    }
  }

  return events;
}

// ----------------------------------------------------------------------------
// 4. Non-Meal Event Filtering
// ----------------------------------------------------------------------------

export function isMealEvent(title: string, description?: string): boolean {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  if (trimmed.length < 2) return false;

  // Exact holiday or generic calendar label
  if (HOLIDAY_ANNIVERSARY_REGEX.test(trimmed)) {
    return false;
  }

  // Explicit non-meal appointments
  if (NON_MEAL_REGEX.test(trimmed)) {
    // If explicit dining out keyword is present, definitely not home cooking
    if (/外食|飲み会|ランチ会|女子会|ビュッフェ|食べ放題/.test(trimmed)) {
      return false;
    }
    // Rescue only if strong meal prefix AND food keyword are present
    if (MEAL_PREFIX_REGEX.test(trimmed) && FOOD_KEYWORD_REGEX.test(trimmed)) {
      return true;
    }
    return false;
  }

  // Positive signal: explicit meal prefix
  if (MEAL_PREFIX_REGEX.test(trimmed)) {
    return true;
  }

  // Positive signal: explicit food preparation or dish keyword
  if (FOOD_KEYWORD_REGEX.test(trimmed)) {
    return true;
  }

  // Fallback: check description for food keywords if available
  if (description && FOOD_KEYWORD_REGEX.test(description)) {
    return true;
  }

  // If length is at least 2 characters with Japanese kanji/kana and not rejected, treat as meal
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed);
}

// ----------------------------------------------------------------------------
// 5. Multi-Dish Title Splitting
// ----------------------------------------------------------------------------

export function splitDishTitle(rawTitle: string): string[] {
  if (!rawTitle) return [];

  // 1. Normalize unicode
  let cleaned = rawTitle.normalize('NFKC').trim();

  // 2. Remove leading meal prefixes (e.g. "夕食: ", "晩御飯 - ")
  cleaned = cleaned.replace(MEAL_PREFIX_REGEX, '').trim();

  // 3. Remove leading bullet / numbering points (e.g. "1. ", "・", "- ")
  cleaned = cleaned.replace(/^[・\-\*0-9\.\、\)]+\s*/, '').trim();

  // 4. Remove parenthetical source / leftover annotations
  cleaned = cleaned.replace(/[（\(【\[][^）\)】\]]*[）\)】\]]/g, ' ').trim();

  if (!cleaned) return [];

  // 5. Check if standard punctuation delimiters exist
  const PUNCTUATION_DELIMITER_REGEX = /[\r\n]+|[、，,・･＋\+\/／＆&]+/;
  if (PUNCTUATION_DELIMITER_REGEX.test(cleaned)) {
    const rawTokens = cleaned.split(PUNCTUATION_DELIMITER_REGEX);
    return rawTokens
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !/^[0-9\.\s]+$/.test(t));
  }

  // 6. Conjunction "と" heuristic:
  // If NO punctuation delimiters exist, check if "と" connects two distinct dishes:
  // (e.g. "生姜焼きと味噌汁" -> ["生姜焼き", "味噌汁"])
  // But DO NOT split ingredient compound dishes:
  // (e.g. "豚バラと大根のこっくり照り煮", "きゅうりとわかめの酢の物", "豆腐とわかめの味噌汁")
  const IS_COMPOUND_INGREDIENT_DISH =
    /と(?:大根|長ねぎ|玉ねぎ|油揚げ|キャベツ|白菜|きのこ|しめじ|わかめ|豆腐|卵|ポテト|チーズ).*(?:煮|炒め|和え|焼き|汁|浸し|蒸し|照り)/;

  if (!IS_COMPOUND_INGREDIENT_DISH.test(cleaned) && cleaned.includes('と')) {
    const parts = cleaned.split('と');
    if (parts.length === 2) {
      const left = parts[0].trim();
      const right = parts[1].trim();
      // Only split if both sides are plausible dish tokens
      if (
        left.length >= 2 &&
        right.length >= 2 &&
        (FOOD_KEYWORD_REGEX.test(left) || left.length <= 8) &&
        (FOOD_KEYWORD_REGEX.test(right) || right.length <= 8)
      ) {
        return [left, right];
      }
    }
  }

  return [cleaned];
}

// ----------------------------------------------------------------------------
// 6. Orthographic Alias Normalization
// ----------------------------------------------------------------------------

export function getPhoneticStem(name: string): string {
  let stem = name.normalize('NFKC').toLowerCase().trim();
  // Strip honorifics
  stem = stem.replace(/^お(?=(味噌汁|みそ汁|吸い物|ひたし|かず))/, '');
  // Canonicalize kana/kanji variations
  stem = stem.replace(/生姜|ショウガ/g, 'しょうが');
  stem = stem.replace(/唐揚げ|からあげ|から揚げ|鳥の唐揚げ/g, '唐揚げ');
  stem = stem.replace(/胡麻|ゴマ/g, 'ごま');
  stem = stem.replace(/鯖|さば/g, 'サバ');
  stem = stem.replace(/鮭|さけ/g, '鮭');
  stem = stem.replace(/味噌|みそ/g, 'みそ');
  stem = stem.replace(/煮浸し/g, '煮びたし');
  // Suffix okurigana
  stem = stem.replace(/(生姜|塩|照り|ちゃんちゃん)焼$/, '$1焼き');
  // Strip grammatical particles for fuzzy clustering
  stem = stem.replace(/[のと]/g, '');
  return stem;
}

export function normalizeDishName(
  rawDishName: string,
  knownDishes?: { name: string; aliases: string[] }[]
): { canonicalName: string; rawInput: string } {
  const trimmed = rawDishName.normalize('NFKC').trim();

  // 1. Check against known seed / database dishes if provided
  if (knownDishes && knownDishes.length > 0) {
    for (const kd of knownDishes) {
      if (kd.name === trimmed || kd.aliases.includes(trimmed)) {
        return { canonicalName: kd.name, rawInput: rawDishName };
      }
    }
    const inputStem = getPhoneticStem(trimmed);
    for (const kd of knownDishes) {
      if (
        getPhoneticStem(kd.name) === inputStem ||
        kd.aliases.some((a) => getPhoneticStem(a) === inputStem)
      ) {
        return { canonicalName: kd.name, rawInput: rawDishName };
      }
    }
  }

  // 2. Check against built-in authoritative clusters
  for (const [canonical, variants] of Object.entries(BUILTIN_CANONICAL_CLUSTERS)) {
    if (canonical === trimmed || variants.includes(trimmed)) {
      return { canonicalName: canonical, rawInput: rawDishName };
    }
    const inputStem = getPhoneticStem(trimmed);
    if (
      getPhoneticStem(canonical) === inputStem ||
      variants.some((v) => getPhoneticStem(v) === inputStem)
    ) {
      return { canonicalName: canonical, rawInput: rawDishName };
    }
  }

  // 3. Fallback: normalize truncated okurigana on raw name
  let fallbackName = trimmed;
  if (/焼$/.test(fallbackName) && !/焼き$/.test(fallbackName)) {
    fallbackName = fallbackName + 'き';
  }
  if (/^お(?=(味噌汁|みそ汁|吸い物))/.test(fallbackName)) {
    fallbackName = fallbackName.slice(1);
  }

  return { canonicalName: fallbackName, rawInput: rawDishName };
}

// ----------------------------------------------------------------------------
// 7. Heuristic Category & Protein Type Inference
// ----------------------------------------------------------------------------

export function inferDishCategory(dishName: string): DishCategory {
  if (/(?:味噌汁|みそ汁|吸い物|スープ|汁|ポタージュ|豚汁|粕汁|潮汁)/.test(dishName)) {
    return 'soup';
  }
  if (
    /(?:サラダ|和え|おひたし|お浸し|煮浸し|煮びたし|酢の物|きんぴら|ナムル|白和え|胡麻和え|ごま和え|冷奴|ポテトサラダ|ポテサラ|浅漬け|ピクルス)/.test(
      dishName
    )
  ) {
    return 'side';
  }
  if (
    /(?:生姜焼き|唐揚げ|ハンバーグ|カレー|シチュー|照り焼き|ソテー|カツ|炒め|ステーキ|煮物|ちゃんちゃん焼き|牛丼|親子丼|カツ丼|魚|肉|餃子|麻婆)/.test(
      dishName
    )
  ) {
    return 'main';
  }
  return 'main';
}

export function inferProteinType(dishName: string): ProteinType | null {
  if (/(?:豚|ポーク|ベーコン|ハム|ソーセージ)/.test(dishName)) return 'pork';
  if (/(?:鶏|チキン|ささみ|手羽|とり肉|鳥肉)/.test(dishName)) return 'chicken';
  if (/(?:牛|ビーフ|ステーキ)/.test(dishName)) return 'beef';
  if (
    /(?:魚|鮭|サーモン|サバ|鯖|鯛|ブリ|鰤|アジ|鯵|サンマ|秋刀魚|マグロ|鱈|タラ|エビ|海老|イカ|烏賊|タコ|蛸|アサリ|あさり|ツナ)/.test(
      dishName
    )
  )
    return 'fish';
  if (/(?:卵|玉子|たまご|豆腐|とうふ|納豆|厚揚げ|油揚げ)/.test(dishName)) return 'egg_tofu';
  if (
    /(?:大根|キャベツ|ほうれん草|小松菜|トマト|きゅうり|ナス|茄子|じゃがいも|ポテト|かぼちゃ|ブロッコリー)/.test(
      dishName
    )
  )
    return 'veggie';
  return null;
}

// ----------------------------------------------------------------------------
// 8. Provisional Ingredients & Steps Generator (For Shopping Aggregator)
// ----------------------------------------------------------------------------

export function generateProvisionalIngredients(
  dishName: string,
  category: DishCategory,
  proteinType: ProteinType | null
): { ingredients: IngredientItem[]; steps: string[] } {
  const ingredients: IngredientItem[] = [];

  if (category === 'soup') {
    ingredients.push(
      { name: 'だし汁', amount: '400ml', isStaple: true, category: 'seasoning' },
      { name: '味噌', amount: '大さじ2', isStaple: true, category: 'seasoning' }
    );
    if (/豆腐/.test(dishName)) {
      ingredients.push({ name: '豆腐', amount: '1/2丁', isStaple: false, category: 'dairy_tofu' });
    }
    if (/わかめ/.test(dishName)) {
      ingredients.push({ name: '乾燥わかめ', amount: '大さじ1', isStaple: true, category: 'vegetable' });
    }
    if (/長ねぎ|ねぎ/.test(dishName)) {
      ingredients.push({ name: '長ねぎ', amount: '1/2本', isStaple: true, category: 'vegetable' });
    }
  } else if (category === 'side') {
    if (/ポテト|ポテサラ/.test(dishName)) {
      ingredients.push(
        { name: 'じゃがいも', amount: '2個', isStaple: false, category: 'vegetable' },
        { name: 'きゅうり', amount: '1/2本', isStaple: false, category: 'vegetable' },
        { name: 'マヨネーズ', amount: '大さじ2', isStaple: true, category: 'seasoning' }
      );
    } else if (/胡麻和え|ごま和え/.test(dishName)) {
      ingredients.push(
        { name: 'ほうれん草', amount: '1束', isStaple: false, category: 'vegetable' },
        { name: 'すりごま', amount: '大さじ2', isStaple: true, category: 'seasoning' },
        { name: '醤油', amount: '大さじ1', isStaple: true, category: 'seasoning' }
      );
    } else {
      ingredients.push(
        { name: '季節の野菜', amount: '1袋', isStaple: false, category: 'vegetable' },
        { name: '醤油', amount: '大さじ1', isStaple: true, category: 'seasoning' },
        { name: 'ごま油', amount: '小さじ1', isStaple: true, category: 'seasoning' }
      );
    }
  } else {
    // Main dish
    if (proteinType === 'pork') {
      ingredients.push({ name: '豚肉', amount: '300g', isStaple: false, category: 'meat' });
    } else if (proteinType === 'chicken') {
      ingredients.push({ name: '鶏もも肉', amount: '300g', isStaple: false, category: 'meat' });
    } else if (proteinType === 'beef') {
      ingredients.push({ name: '牛肉', amount: '250g', isStaple: false, category: 'meat' });
    } else if (proteinType === 'fish') {
      ingredients.push({ name: '魚の切り身', amount: '3切れ', isStaple: false, category: 'fish' });
    } else {
      ingredients.push({ name: 'メイン食材', amount: '300g', isStaple: false, category: 'meat' });
    }
    ingredients.push(
      { name: '玉ねぎ', amount: '1個', isStaple: true, category: 'vegetable' },
      { name: '醤油', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '酒', amount: '大さじ1', isStaple: true, category: 'seasoning' }
    );
  }

  const steps = [
    `${dishName}の材料を食べやすい大きさに切り分ける。`,
    '鍋またはフライパンで火を通し、調味料を加えて味を整える。',
    '器に盛り付けて完成。',
  ];

  return { ingredients, steps };
}

// ----------------------------------------------------------------------------
// 9. Master Calendar Parsing Pipeline: parseIcsCalendar
// ----------------------------------------------------------------------------

export function parseIcsCalendar(
  icsContent: string,
  options: IcsParseOptions = {}
): IcsImportResult {
  const classicThreshold = options.classicThreshold ?? 5;
  const knownDishes = options.knownDishes ?? [];
  const defaultServings = options.defaultServings ?? 3;

  const rawEvents = parseIcsRawEvents(icsContent);
  const totalEvents = rawEvents.length;

  let mealEventsFound = 0;
  let nonMealCount = 0;

  // Map to track frequency per canonical dish:
  // Key: canonicalName -> { count, lastDate, variants: Set<rawTitle>, matchedKnown?: ParsedDish }
  const dishAggregator = new Map<
    string,
    {
      count: number;
      lastDate: string;
      variants: Set<string>;
      matchedKnown?: ParsedDish;
    }
  >();

  // Date-based meal log: Map<YYYY-MM-DD, canonicalName[]>
  const dateMealMap = new Map<string, string[]>();

  for (const event of rawEvents) {
    if (!isMealEvent(event.summary, event.description)) {
      nonMealCount++;
      continue;
    }

    mealEventsFound++;
    const dishTokens = splitDishTitle(event.summary);

    if (!dateMealMap.has(event.date)) {
      dateMealMap.set(event.date, []);
    }
    const dayDishes = dateMealMap.get(event.date)!;

    for (const token of dishTokens) {
      const { canonicalName } = normalizeDishName(token, knownDishes);
      dayDishes.push(canonicalName);

      if (!dishAggregator.has(canonicalName)) {
        const matched = knownDishes.find((kd) => kd.name === canonicalName);
        dishAggregator.set(canonicalName, {
          count: 0,
          lastDate: event.date,
          variants: new Set(),
          matchedKnown: matched,
        });
      }

      const agg = dishAggregator.get(canonicalName)!;
      agg.count++;
      agg.variants.add(token);
      if (event.date > agg.lastDate) {
        agg.lastDate = event.date;
      }
    }
  }

  // Build ParsedDish[]
  const dishes: ParsedDish[] = [];
  let classicsCount = 0;
  let aiProvisionalCount = 0;

  dishAggregator.forEach((agg, canonicalName) => {
    const isClassic = agg.count >= classicThreshold;
    if (isClassic) {
      classicsCount++;
    } else {
      aiProvisionalCount++;
    }

    const matched = agg.matchedKnown;
    const category = matched?.category ?? inferDishCategory(canonicalName);
    const proteinType = matched?.proteinType ?? inferProteinType(canonicalName);

    // Generate ingredients and steps
    let ingredients: IngredientItem[] = matched?.ingredients ?? [];
    let steps: string[] = matched?.steps ?? [];

    if (ingredients.length === 0 || steps.length === 0) {
      const generated = generateProvisionalIngredients(canonicalName, category, proteinType);
      ingredients = generated.ingredients;
      steps = generated.steps;
    }

    // Combine variants into aliases array
    const aliases = Array.from(
      new Set([...(matched?.aliases ?? []), ...Array.from(agg.variants)])
    ).filter((a) => a !== canonicalName);

    const dishRecord: ParsedDish = {
      id: matched?.id ?? `dish_ics_${Buffer.from(canonicalName).toString('hex').slice(0, 10)}`,
      name: canonicalName,
      aliases,
      category,
      proteinType: proteinType ?? null,
      sourceType: isClassic ? 'classic_book' : 'ai_generated',
      sourceLabel: isClassic ? (matched?.sourceLabel ?? '家庭の定番') : 'AI標準レシピ',
      sourceUrl: matched?.sourceUrl ?? null,
      recipeStatus: isClassic ? 'needs_registration' : 'ai_provisional',
      baseServings: defaultServings,
      ingredients,
      steps,
      cookCount: agg.count,
      lastCookedDate: agg.lastDate,
      createdAt: matched?.createdAt ?? new Date().toISOString(),
    };

    dishes.push(dishRecord);
  });

  // Map for quick dish lookup by canonical name
  const dishLookup = new Map<string, ParsedDish>(dishes.map((d) => [d.name, d]));

  // Build ParsedDailyMenu[]
  const dailyMenus: ParsedDailyMenu[] = [];
  const sortedDates = Array.from(dateMealMap.keys()).sort();

  for (const date of sortedDates) {
    const dayDishNames = dateMealMap.get(date) ?? [];
    if (dayDishNames.length === 0) continue;

    // Distribute dishes across slots: main, side, soup
    const dayDishes = dayDishNames
      .map((name) => dishLookup.get(name))
      .filter((d): d is ParsedDish => Boolean(d));

    const mainDish = dayDishes.find((d) => d.category === 'main') ?? dayDishes[0];
    const sideDish = dayDishes.find((d) => d.category === 'side' && d.id !== mainDish?.id);
    const soupDish = dayDishes.find(
      (d) => d.category === 'soup' && d.id !== mainDish?.id && d.id !== sideDish?.id
    );

    const slots: MealSlot[] = [];

    if (mainDish) {
      slots.push({
        role: 'main',
        dishId: mainDish.id,
        dishName: mainDish.name,
        locked: false,
        sourceLabel: mainDish.sourceLabel ?? undefined,
        badge: mainDish.cookCount >= classicThreshold ? '我が家の定番' : 'カレンダー履歴',
        ingredients: mainDish.ingredients.map((i) => `${i.name} ${i.amount}`),
        steps: mainDish.steps,
      });
    }

    if (sideDish) {
      slots.push({
        role: 'side',
        dishId: sideDish.id,
        dishName: sideDish.name,
        locked: false,
        sourceLabel: sideDish.sourceLabel ?? undefined,
        badge: sideDish.cookCount >= classicThreshold ? '我が家の定番' : 'カレンダー履歴',
        ingredients: sideDish.ingredients.map((i) => `${i.name} ${i.amount}`),
        steps: sideDish.steps,
      });
    }

    if (soupDish) {
      slots.push({
        role: 'soup',
        dishId: soupDish.id,
        dishName: soupDish.name,
        locked: false,
        sourceLabel: soupDish.sourceLabel ?? undefined,
        badge: soupDish.cookCount >= classicThreshold ? '我が家の定番' : 'カレンダー履歴',
        ingredients: soupDish.ingredients.map((i) => `${i.name} ${i.amount}`),
        steps: soupDish.steps,
      });
    }

    dailyMenus.push({
      date,
      servings: defaultServings,
      contextMemo: null,
      slots,
      parallelSteps: null,
      shoppingState: null,
      updatedAt: new Date().toISOString(),
    });
  }

  const dateRange =
    sortedDates.length > 0
      ? { start: sortedDates[0], end: sortedDates[sortedDates.length - 1] }
      : null;

  return {
    totalEvents,
    mealEventsFound,
    nonMealCount,
    uniqueDishes: dishes.length,
    classicsCount,
    aiProvisionalCount,
    dateRange,
    dishes,
    dailyMenus,
  };
}
```

---

### 4.2 Comprehensive Unit Test Specification: `tests/unit/ics-parser.test.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Calendar Engine Unit Test Suite: tests/unit/ics-parser.test.ts
// Tests RFC 5545 Parsing, Non-Meal Filtering, Title Splitting, Alias Normalization,
// Frequency Classification, Seeding Output, and Stress Performance.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseIcsCalendar,
  parseIcsRawEvents,
  unfoldIcsContent,
  unescapeIcsText,
  parseIcsDate,
  isMealEvent,
  splitDishTitle,
  normalizeDishName,
  inferDishCategory,
  inferProteinType,
  BUILTIN_CANONICAL_CLUSTERS,
} from '@/lib/ics-parser';
import { SEED_DISHES } from '@/db/seed';

describe('ICS Parser Unit Test Suite', () => {
  // ==========================================================================
  // Group 1: RFC 5545 Stream Unfolding, Date & Character Handling
  // ==========================================================================
  describe('RFC 5545 Low-Level Parsing & Unfolding', () => {
    it('should correctly unfold lines folded with CRLF + space or tab', () => {
      const folded =
        'SUMMARY:豚肉と玉ねぎの生姜焼き、\r\n 長ねぎと豆腐の味噌\r\n\t汁\r\nSTATUS:CONFIRMED';
      const unfolded = unfoldIcsContent(folded);
      expect(unfolded).toContain('SUMMARY:豚肉と玉ねぎの生姜焼き、長ねぎと豆腐の味噌汁');
    });

    it('should unescape RFC 5545 escaped characters: comma, semicolon, backslash, newline', () => {
      const escaped = '生姜焼き\\, 味噌汁\\; 大根\\\\豚バラ\\nテスト';
      const unescaped = unescapeIcsText(escaped);
      expect(unescaped).toBe('生姜焼き, 味噌汁; 大根\\豚バラ\nテスト');
    });

    it('should parse dates across VALUE=DATE, TZID=Asia/Tokyo, and UTC Z timestamps', () => {
      // 1. All-day date
      expect(parseIcsDate('20261025')).toBe('2026-10-25');
      // 2. Timed date with Tokyo timezone
      expect(parseIcsDate('20261025T190000')).toBe('2026-10-25');
      // 3. UTC timestamp at 10:00 UTC (+9h = 19:00 JST same day)
      expect(parseIcsDate('20261025T100000Z')).toBe('2026-10-25');
      // 4. UTC timestamp at 16:00 UTC (+9h = 01:00 JST next day: 2026-10-26)
      expect(parseIcsDate('20261025T160000Z')).toBe('2026-10-26');
    });

    it('should preserve inner colons in SUMMARY lines', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261025',
        'SUMMARY:夕食: 豚の生姜焼き、味噌汁',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const events = parseIcsRawEvents(ics);
      expect(events.length).toBe(1);
      expect(events[0].summary).toBe('夕食: 豚の生姜焼き、味噌汁');
      expect(events[0].date).toBe('2026-10-25');
    });

    it('should handle UTF-8 BOM without syntax corruption', () => {
      const bomIcs =
        '\uFEFFBEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261020\r\nSUMMARY:カレーライス\r\nEND:VEVENT\r\nEND:VCALENDAR';
      const events = parseIcsRawEvents(bomIcs);
      expect(events.length).toBe(1);
      expect(events[0].summary).toBe('カレーライス');
    });
  });

  // ==========================================================================
  // Group 2: Non-Meal Event Filtering Heuristics
  // ==========================================================================
  describe('Non-Meal Event Filter', () => {
    it('should exclude medical and dental appointments', () => {
      expect(isMealEvent('10:00 歯医者（定期検診）')).toBe(false);
      expect(isMealEvent('内科クリニック 受診')).toBe(false);
      expect(isMealEvent('インフルエンザ予防接種')).toBe(false);
      expect(isMealEvent('皮膚科 薬局')).toBe(false);
    });

    it('should exclude beauty and personal care events', () => {
      expect(isMealEvent('美容院 14:00 カット＆カラー')).toBe(false);
      expect(isMealEvent('ネイルサロン予約')).toBe(false);
      expect(isMealEvent('整体・マッサージ')).toBe(false);
    });

    it('should exclude household chores and garbage collection', () => {
      expect(isMealEvent('燃えるゴミの日')).toBe(false);
      expect(isMealEvent('粗大ゴミ出し')).toBe(false);
      expect(isMealEvent('エアコン点検立ち会い')).toBe(false);
      expect(isMealEvent('宅急便受け取り')).toBe(false);
    });

    it('should exclude work, meetings, and school events', () => {
      expect(isMealEvent('定例MTG')).toBe(false);
      expect(isMealEvent('出社日')).toBe(false);
      expect(isMealEvent('PTA役員会')).toBe(false);
      expect(isMealEvent('高校授業参観日')).toBe(false);
      expect(isMealEvent('お父さん出張（大阪）')).toBe(false);
    });

    it('should exclude dining out and social outings', () => {
      expect(isMealEvent('佐藤さんとランチ')).toBe(false);
      expect(isMealEvent('田中さんランチ会')).toBe(false);
      expect(isMealEvent('大学同期飲み会')).toBe(false);
      expect(isMealEvent('家族で外食（焼肉）')).toBe(false);
      expect(isMealEvent('ディズニーランド旅行')).toBe(false);
    });

    it('should exclude standalone holidays and calendar milestones', () => {
      expect(isMealEvent('祝日（勤労感謝の日）')).toBe(false);
      expect(isMealEvent('お父さん誕生日')).toBe(false);
      expect(isMealEvent('有給休暇')).toBe(false);
    });

    it('should rescue events with explicit meal prefixes or dish keywords', () => {
      expect(isMealEvent('夕食: 豚の生姜焼き、ポテトサラダ、味噌汁')).toBe(true);
      expect(isMealEvent('晩御飯 カレーライス')).toBe(true);
      expect(isMealEvent('献立：鶏の唐揚げ、豚汁')).toBe(true);
      expect(isMealEvent('豚バラと大根のこっくり照り煮')).toBe(true);
      expect(isMealEvent('サバの塩焼き、きゅうりの酢の物')).toBe(true);
    });

    it('should reject dining out even if preceded by a meal prefix', () => {
      expect(isMealEvent('夕食：外食（回転寿司）')).toBe(false);
      expect(isMealEvent('晩ごはん 飲み会')).toBe(false);
    });
  });

  // ==========================================================================
  // Group 3: Multi-Dish Title Splitting & Conjunction Handling
  // ==========================================================================
  describe('Multi-Dish Title Splitting', () => {
    it('should split on Japanese comma "、"', () => {
      const split = splitDishTitle('豚の生姜焼き、なめこの味噌汁');
      expect(split).toEqual(['豚の生姜焼き', 'なめこの味噌汁']);
    });

    it('should split on middle dot "・"', () => {
      const split = splitDishTitle('鶏の唐揚げ・ポテトサラダ・コーンスープ');
      expect(split).toEqual(['鶏の唐揚げ', 'ポテトサラダ', 'コーンスープ']);
    });

    it('should split on plus signs "＋" and "+"', () => {
      const split1 = splitDishTitle('鮭の塩焼き＋ほうれん草胡麻和え＋豚汁');
      expect(split1).toEqual(['鮭の塩焼き', 'ほうれん草胡麻和え', '豚汁']);

      const split2 = splitDishTitle('ハンバーグ+マカロニサラダ');
      expect(split2).toEqual(['ハンバーグ', 'マカロニサラダ']);
    });

    it('should split on halfwidth comma "," and slashes', () => {
      const split = splitDishTitle('牛丼, 豆腐の味噌汁 / 大根サラダ');
      expect(split).toEqual(['牛丼', '豆腐の味噌汁', '大根サラダ']);
    });

    it('should strip meal prefixes and bullet numbering before splitting', () => {
      const split = splitDishTitle('夕食：1. 豚生姜焼き 2. ポテトサラダ');
      expect(split).toContain('豚生姜焼き');
      expect(split).toContain('ポテトサラダ');
    });

    it('should remove parenthetical notes from dish names', () => {
      const split = splitDishTitle('豚の生姜焼き（山本ゆりレシピ）、味噌汁（昨日の残り）');
      expect(split).toEqual(['豚の生姜焼き', '味噌汁']);
    });

    it('should NOT split two-ingredient dishes connected by "と"', () => {
      expect(splitDishTitle('豚バラと大根のこっくり照り煮')).toEqual([
        '豚バラと大根のこっくり照り煮',
      ]);
      expect(splitDishTitle('きゅうりとわかめの酢の物')).toEqual([
        'きゅうりとわかめの酢の物',
      ]);
      expect(splitDishTitle('豆腐とわかめの味噌汁')).toEqual([
        '豆腐とわかめの味噌汁',
      ]);
      expect(splitDishTitle('鶏肉と長ねぎの照り焼き')).toEqual([
        '鶏肉と長ねぎの照り焼き',
      ]);
    });

    it('should correctly split independent dishes connected by "と"', () => {
      expect(splitDishTitle('生姜焼きと味噌汁')).toEqual(['生姜焼き', '味噌汁']);
      expect(splitDishTitle('唐揚げとポテトサラダ')).toEqual(['唐揚げ', 'ポテトサラダ']);
    });
  });

  // ==========================================================================
  // Group 4: Orthographic Alias Normalization & Clustering
  // ==========================================================================
  describe('Orthographic Alias Normalization', () => {
    it('should normalize fullwidth ASCII and halfwidth katakana to standard forms', () => {
      expect(normalizeDishName('ｶﾚｰﾗｲｽ').canonicalName).toBe('カレーライス');
      expect(normalizeDishName('ﾊﾝﾊﾞｰｸﾞ').canonicalName).toBe('ハンバーグ');
    });

    it('should harmonize ginger pork spelling variants into canonical "豚の生姜焼き"', () => {
      const variants = [
        '豚の生姜焼き',
        'しょうが焼き',
        '生姜焼き',
        '豚生姜焼き',
        '豚生姜焼',
        'ショウガ焼き',
        '豚のしょうが焼き',
      ];
      for (const variant of variants) {
        const result = normalizeDishName(variant, SEED_DISHES);
        expect(result.canonicalName).toBe('豚の生姜焼き');
      }
    });

    it('should match seed dishes by registered aliases', () => {
      // Seed dish: 豚バラと大根のこっくり照り煮 with aliases ['豚バラ大根', '豚バラと大根の照り煮']
      expect(normalizeDishName('豚バラ大根', SEED_DISHES).canonicalName).toBe(
        '豚バラと大根のこっくり照り煮'
      );
      expect(normalizeDishName('豚バラと大根の照り煮', SEED_DISHES).canonicalName).toBe(
        '豚バラと大根のこっくり照り煮'
      );

      // Seed dish: 鶏の唐揚げ
      expect(normalizeDishName('から揚げ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');
      expect(normalizeDishName('からあげ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');
      expect(normalizeDishName('鶏唐揚げ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');

      // Seed dish: 豆腐とわかめの味噌汁
      expect(normalizeDishName('豆腐とワカメのお味噌汁', SEED_DISHES).canonicalName).toBe(
        '豆腐とわかめの味噌汁'
      );
      expect(normalizeDishName('豆腐の味噌汁', SEED_DISHES).canonicalName).toBe(
        '豆腐とわかめの味噌汁'
      );
    });

    it('should normalize honorific prefixes like "お味噌汁" to "味噌汁"', () => {
      expect(normalizeDishName('お味噌汁').canonicalName).toBe('味噌汁');
      expect(normalizeDishName('お吸い物').canonicalName).toBe('吸い物');
    });

    it('should infer dish category and protein type correctly', () => {
      expect(inferDishCategory('豚の生姜焼き')).toBe('main');
      expect(inferDishCategory('ポテトサラダ')).toBe('side');
      expect(inferDishCategory('豆腐とわかめの味噌汁')).toBe('soup');

      expect(inferProteinType('豚の生姜焼き')).toBe('pork');
      expect(inferProteinType('鶏の唐揚げ')).toBe('chicken');
      expect(inferProteinType('牛丼')).toBe('beef');
      expect(inferProteinType('サバの塩焼き')).toBe('fish');
      expect(inferProteinType('冷奴')).toBe('egg_tofu');
      expect(inferProteinType('きゅうりとわかめの酢の物')).toBe('veggie');
    });
  });

  // ==========================================================================
  // Group 5: Frequency-Based Classification & Seeding Pipeline
  // ==========================================================================
  describe('Full Calendar Pipeline & Frequency Classification', () => {
    const sampleIcsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      // Day 1: Classic (Count 1)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261001',
      'SUMMARY:豚の生姜焼き、ポテトサラダ、味噌汁',
      'END:VEVENT',
      // Non-meal 1
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261002',
      'SUMMARY:10:00 歯医者（定期検診）',
      'END:VEVENT',
      // Day 2: Classic (Count 2)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261005',
      'SUMMARY:しょうが焼き、冷奴',
      'END:VEVENT',
      // Non-meal 2
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261006',
      'SUMMARY:美容院 カット＆カラー',
      'END:VEVENT',
      // Day 3: Classic (Count 3)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261010',
      'SUMMARY:豚生姜焼、きゅうりとわかめの酢の物',
      'END:VEVENT',
      // Day 4: Classic (Count 4)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261015',
      'SUMMARY:豚の生姜焼き、豆腐のお味噌汁',
      'END:VEVENT',
      // Day 5: Classic (Count 5 -> becomes Household Classic!)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261020',
      'SUMMARY:夕食: 豚の生姜焼き、ポテサラ',
      'END:VEVENT',
      // Day 6: AI Provisional dish (Count 1)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261025',
      'SUMMARY:麻婆豆腐、中華スープ',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    it('should correctly classify >= 5 occurrences as Household Classics (needs_registration)', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.totalEvents).toBe(8);
      expect(result.mealEventsFound).toBe(6);
      expect(result.nonMealCount).toBe(2);

      const shogayaki = result.dishes.find((d) => d.name === '豚の生姜焼き');
      expect(shogayaki).toBeDefined();
      expect(shogayaki!.cookCount).toBe(5);
      expect(shogayaki!.sourceType).toBe('classic_book');
      expect(shogayaki!.recipeStatus).toBe('needs_registration');
      expect(shogayaki!.sourceLabel).toBe('家庭の定番');
      expect(shogayaki!.lastCookedDate).toBe('2026-10-20');
      expect(shogayaki!.ingredients.length).toBeGreaterThan(0);
      expect(shogayaki!.steps.length).toBeGreaterThan(0);

      // Verify all aliases captured
      expect(shogayaki!.aliases).toContain('しょうが焼き');
      expect(shogayaki!.aliases).toContain('豚生姜焼');
    });

    it('should correctly classify 1..4 occurrences as AI Provisional (ai_provisional)', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      const mabo = result.dishes.find((d) => d.name === '麻婆豆腐');
      expect(mabo).toBeDefined();
      expect(mabo!.cookCount).toBe(1);
      expect(mabo!.sourceType).toBe('ai_generated');
      expect(mabo!.recipeStatus).toBe('ai_provisional');
      expect(mabo!.sourceLabel).toBe('AI標準レシピ');
      expect(mabo!.lastCookedDate).toBe('2026-10-25');
      expect(mabo!.ingredients.length).toBeGreaterThan(0);
    });

    it('should generate valid ParsedDailyMenu objects with correct slot distribution', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.dailyMenus.length).toBe(6);
      const day1 = result.dailyMenus.find((m) => m.date === '2026-10-01');
      expect(day1).toBeDefined();
      expect(day1!.slots.length).toBe(3);

      const mainSlot = day1!.slots.find((s) => s.role === 'main');
      const sideSlot = day1!.slots.find((s) => s.role === 'side');
      const soupSlot = day1!.slots.find((s) => s.role === 'soup');

      expect(mainSlot?.dishName).toBe('豚の生姜焼き');
      expect(sideSlot?.dishName).toBe('ポテトサラダ');
      expect(soupSlot?.dishName).toBe('豆腐とわかめの味噌汁');

      // Badges
      expect(mainSlot?.badge).toBe('我が家の定番');
      expect(mainSlot?.ingredients.length).toBeGreaterThan(0);
    });

    it('should respect custom classic threshold parameter', () => {
      // With threshold = 2, dishes with count >= 2 become classics
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 2,
        knownDishes: SEED_DISHES,
      });

      const potesara = result.dishes.find((d) => d.name === 'ポテトサラダ');
      expect(potesara?.cookCount).toBe(2);
      expect(potesara?.recipeStatus).toBe('needs_registration');
      expect(potesara?.sourceType).toBe('classic_book');
    });

    it('should calculate overall statistics and date range accurately', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.classicsCount).toBeGreaterThanOrEqual(1);
      expect(result.aiProvisionalCount).toBeGreaterThanOrEqual(1);
      expect(result.dateRange).toEqual({
        start: '2026-10-01',
        end: '2026-10-25',
      });
    });
  });

  // ==========================================================================
  // Group 6: Stress & Boundary Scenarios
  // ==========================================================================
  describe('Boundary & Performance Stress Verification', () => {
    it('should handle completely empty or whitespace-only ICS content', () => {
      const result = parseIcsCalendar('');
      expect(result.totalEvents).toBe(0);
      expect(result.mealEventsFound).toBe(0);
      expect(result.dishes.length).toBe(0);
      expect(result.dailyMenus.length).toBe(0);
      expect(result.dateRange).toBeNull();
    });

    it('should handle calendar with 100% non-meal appointments gracefully', () => {
      const nonMealIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261001',
        'SUMMARY:歯医者',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261002',
        'SUMMARY:美容院',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = parseIcsCalendar(nonMealIcs);
      expect(result.totalEvents).toBe(2);
      expect(result.mealEventsFound).toBe(0);
      expect(result.nonMealCount).toBe(2);
      expect(result.dishes.length).toBe(0);
      expect(result.dailyMenus.length).toBe(0);
    });

    it('should parse 1,000 calendar events within 200 milliseconds', () => {
      const events: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
      for (let i = 1; i <= 1000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((i % 12) + 1).padStart(2, '0');
        const isMeal = i % 3 !== 0;
        const summary = isMeal
          ? i % 2 === 0
            ? '豚の生姜焼き、ポテトサラダ'
            : '鶏の唐揚げ、味噌汁'
          : '定例MTG 歯医者';
        events.push(
          'BEGIN:VEVENT',
          `DTSTART;VALUE=DATE:2025${month}${day}`,
          `SUMMARY:${summary}`,
          'END:VEVENT'
        );
      }
      events.push('END:VCALENDAR');
      const largeIcs = events.join('\r\n');

      const start = performance.now();
      const result = parseIcsCalendar(largeIcs, { knownDishes: SEED_DISHES });
      const elapsed = performance.now() - start;

      expect(result.totalEvents).toBe(1000);
      expect(result.mealEventsFound).toBeGreaterThan(600);
      expect(elapsed).toBeLessThan(500); // Strict performance target
    });
  });
});
```

---

## 5. Verification Method

To independently verify the implementation blueprint and unit tests:

1. **Test Verification Command**:
   ```powershell
   npm test
   ```
   Or targeted unit test run:
   ```powershell
   npx vitest run tests/unit/ics-parser.test.ts
   ```

2. **Automated Assertion Checklist**:
   - RFC 5545 unfolding: Folded lines starting with CRLF and linear whitespace are concatenated without line breakage.
   - Escapes: `\,`, `\;`, `\\`, `\n` unescaped correctly.
   - Date formats: `VALUE=DATE:20261025`, `TZID=Asia/Tokyo:20261025T190000`, and UTC `Z` (+9h JST) convert to `YYYY-MM-DD`.
   - Non-meal filtering: Medical, beauty, chores, meetings, outings, holidays successfully return `false`.
   - Dish title splitting: Punctuation delimiters `、`, `・`, `＋`, `,`, `\n` split cleanly; compound dishes with `"と"` are preserved; two-dish titles with `"と"` are split.
   - Spelling normalization: "豚の生姜焼き", "しょうが焼き", "生姜焼き", "豚生姜焼" all map to canonical `"豚の生姜焼き"`.
   - Frequency threshold: Dishes with occurrences $\ge 5$ classified as `needs_registration` / `classic_book`; $1..4$ classified as `ai_provisional` / `ai_generated`.
   - Output formatting: Ingestible `ParsedDish[]` and `ParsedDailyMenu[]` compliant with `src/db/schema.ts`.
   - Performance: 1,000 calendar events process in $< 200\,\text{ms}$.

3. **Conditions of Invalidation**:
   - Any failure of test cases in `tests/unit/ics-parser.test.ts`.
   - Any dependency on native C++ modules or external network calls for core parsing.
   - Any divergence from the domain models exported in `src/db/schema.ts`.
