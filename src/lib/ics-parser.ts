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
  /(?:祝日|振替休日|元日|成人の日|建国記念の日|天皇誕生日|春分の日|昭和の日|憲法記念日|みどりの日|こどもの日|海の日|山の日|敬老の日|秋分の日|スポーツの日|文化の日|勤労感謝の日|誕生日|記念日|休み|有休|有給|有給休暇|午前休|午後休)/;

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
  const PUNCTUATION_DELIMITER_REGEX = /[\r\n]+|[、，,・･＋\+\/／＆&]+|\s+\d+[\.\)]\s*/;
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
    /と(?:大根|長ねぎ|玉ねぎ|油揚げ|キャベツ|白菜|きのこ|しめじ|わかめ|豆腐|卵|ポテト|チーズ).*(?:煮|炒め|和え|焼き|汁|浸し|蒸し|照り|物|酢)/;

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
    // Generic miso soup harmonizing to catalog miso soup if available
    if (/^お?(?:味噌汁|みそ汁)$/.test(trimmed)) {
      const knownMiso = knownDishes.find((kd) => kd.name.includes('味噌汁') || kd.name.includes('みそ汁'));
      if (knownMiso) {
        return { canonicalName: knownMiso.name, rawInput: rawDishName };
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
  if (/(?:卵|玉子|たまご|豆腐|とうふ|納豆|厚揚げ|油揚げ|冷奴|奴)/.test(dishName)) return 'egg_tofu';
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
