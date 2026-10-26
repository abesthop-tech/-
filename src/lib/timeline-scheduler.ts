// ============================================================================
// Kazoku-Kondate Parallel Timeline Scheduler: src/lib/timeline-scheduler.ts
// Deterministic DAG scheduler that coordinates cutting board hygiene sequence,
// microwave pre-cook concurrency queue, and 2-burner stove climax.
// ============================================================================

import { ParallelTimelineStep } from '@/db/schema';

// ----------------------------------------------------------------------------
// 1. Interfaces
// ----------------------------------------------------------------------------

export interface DishScheduleInput {
  name: string;
  role: 'main' | 'side' | 'soup' | 'other' | string;
  steps?: string[];
  ingredients?: Array<{ name: string; amount?: string; isStaple?: boolean }>;
}

export interface ParallelTimelineResult {
  estimatedMinutes: number;
  steps: ParallelTimelineStep[];
}

export interface MicrowaveTask {
  dishName: string;
  targetFood: string;
  durationMinutes: number;
  wattage: string;
  originalStep: string;
}

// ----------------------------------------------------------------------------
// 2. Resource & Culinary Rule Matchers
// ----------------------------------------------------------------------------

export const MICROWAVE_PATTERNS = [
  /レンジ/,
  /電子レンジ/,
  /耐熱皿/,
  /耐熱容器/,
  /600W/i,
  /500W/i,
  /ラップをし/,
];

export const MEAT_FISH_PATTERNS = [
  /豚/,
  /牛/,
  /鶏/,
  /肉/,
  /鮭/,
  /魚/,
  /ミンチ/,
  /挽肉/,
  /サバ/,
  /さば/,
  /タラ/,
  /たら/,
  /エビ/,
  /海老/,
  /イカ/,
  /いか/,
  /刺身/,
  /ベーコン/,
  /ハム/,
  /ソーセージ/,
];

export const TOFU_PATTERNS = [
  /豆腐/,
  /油揚げ/,
  /厚揚げ/,
  /がんも/,
  /生揚げ/,
  /こんにゃく/,
  /糸こんにゃく/,
  /しらたき/,
];

export const DENSE_MICROWAVE_VEGGIES = [
  '大根',
  'かぼちゃ',
  'じゃがいも',
  '人参',
  'にんじん',
  'さつまいも',
  '里芋',
  'レンコン',
  'れんこん',
];

const NON_CUT_SEASONINGS =
  /^(?:だし|出汁|顆粒だし|しょうゆ|醤油|みりん|酒|清酒|料理酒|砂糖|塩|胡椒|こしょう|サラダ油|ごま油|オリーブオイル|オリーブ油|油|水|片栗粉|小麦粉|マヨネーズ|ケチャップ|酢|みそ|味噌|ソース|オイスターソース|ぽん酢|ポン酢|めんつゆ|白だし|和風だし|中華だし|コンソメ)$/;

// ----------------------------------------------------------------------------
// 3. Helper Functions for Dynamic Text Extraction & Normalization
// ----------------------------------------------------------------------------

/**
 * Strips common Japanese culinary speed/informal prefixes to resolve canonical dish names.
 * e.g. "小松菜と油揚げのさっと煮びたし" -> "小松菜と油揚げの煮びたし"
 * e.g. "簡単ポテトサラダ" -> "ポテトサラダ"
 */
export function getCanonicalDishName(name: string): string {
  if (!name) return '';
  return name.replace(/(?:さっと|パパッと|簡単|時短|絶品|極上)/g, '').trim();
}

/**
 * Extracts microwave tasks from dish steps into an ordered queue.
 */
export function extractMicrowaveTasks(dishes: DishScheduleInput[]): MicrowaveTask[] {
  const queue: MicrowaveTask[] = [];

  for (const d of dishes) {
    const steps = d.steps || [];
    for (const step of steps) {
      if (MICROWAVE_PATTERNS.some((pat) => pat.test(step))) {
        // Extract wattage
        const wattageMatch = step.match(/(\d+W)/i);
        const wattage = wattageMatch ? wattageMatch[1].toUpperCase() : '600W';

        // Extract duration in minutes
        const durationMatch = step.match(/(\d+)\s*分/);
        const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : 3;

        // Extract target food name
        let targetFood = '';
        // Check dense microwave veggies first
        for (const veg of DENSE_MICROWAVE_VEGGIES) {
          if (step.includes(veg)) {
            targetFood = veg;
            break;
          }
        }
        // If not found in dense veggies, check dish ingredients
        if (!targetFood && d.ingredients) {
          for (const ig of d.ingredients) {
            if (step.includes(ig.name)) {
              targetFood = ig.name;
              break;
            }
          }
        }
        // Fallback to dish name
        if (!targetFood) {
          targetFood = d.name;
        }

        queue.push({
          dishName: d.name,
          targetFood,
          durationMinutes,
          wattage,
          originalStep: step,
        });

        // One microwave step per dish is standard for pre-cook
        break;
      }
    }
  }

  return queue;
}

/**
 * Categorizes ingredients across dishes into cutting board hygiene buckets:
 * 1. Vegetables / Produce
 * 2. Tofu / Processed items
 * 3. Raw Meat / Seafood
 */
export function categorizeIngredientsForHygiene(dishes: DishScheduleInput[]) {
  const cutVegetables: string[] = [];
  const cutTofuProcessed: string[] = [];
  const cutMeatsSeafood: string[] = [];

  for (const d of dishes) {
    const ingredients = d.ingredients || [];
    for (const ig of ingredients) {
      const name = ig.name ? ig.name.trim() : '';
      if (!name) continue;

      if (MEAT_FISH_PATTERNS.some((p) => p.test(name))) {
        if (!cutMeatsSeafood.includes(name)) cutMeatsSeafood.push(name);
      } else if (TOFU_PATTERNS.some((p) => p.test(name))) {
        if (!cutTofuProcessed.includes(name)) cutTofuProcessed.push(name);
      } else if (NON_CUT_SEASONINGS.test(name)) {
        // Skip liquid and powder pantry staples
        continue;
      } else if (
        !ig.isStaple ||
        name.includes('ねぎ') ||
        name.includes('玉ねぎ') ||
        name.includes('大根') ||
        name.includes('人参')
      ) {
        if (!cutVegetables.includes(name)) cutVegetables.push(name);
      }
    }
  }

  return { cutVegetables, cutTofuProcessed, cutMeatsSeafood };
}

/**
 * Formats a duration in minutes into a MM:SS string.
 */
function formatMinutes(minutes: number): string {
  return `${minutes}:00`;
}

// ----------------------------------------------------------------------------
// 4. Deterministic Parallel Cooking Scheduler (Dynamic DAG Engine)
// ----------------------------------------------------------------------------

export function scheduleParallelCookingTimeline(
  dishes: DishScheduleInput[],
  servings: number = 3
): ParallelTimelineResult {
  // If empty input, return empty schedule
  if (!dishes || dishes.length === 0) {
    return {
      estimatedMinutes: 0,
      steps: [],
    };
  }

  // 1. Identify dish roles dynamically
  const mainDish = dishes.find((d) => d.role === 'main') || dishes[0];
  const sideDish = dishes.find((d) => d.role === 'side' && d !== mainDish);
  const soupDish = dishes.find((d) => d.role === 'soup' && d !== mainDish && d !== sideDish);

  // 2. Scan and queue microwave steps across all dishes (Resource: Microwave Oven)
  const microwaveQueue = extractMicrowaveTasks(dishes);
  const totalMicrowaveMinutes = microwaveQueue.reduce((acc, t) => acc + t.durationMinutes, 0);

  // 3. Collect ingredients across all dishes for cutting board hygiene ordering (Resource: Cutting Board)
  const { cutVegetables, cutTofuProcessed, cutMeatsSeafood } = categorizeIngredientsForHygiene(dishes);
  const allCutItems = [...cutVegetables, ...cutTofuProcessed, ...cutMeatsSeafood];

  // --------------------------------------------------------------------------
  // Phase 1: 下ごしらえ（まとめて切る・レンジ）
  // --------------------------------------------------------------------------
  let p1Instruction = '';

  // Hygiene cut sequence segments
  const cutSequence: string[] = [];
  if (cutVegetables.length > 0) cutSequence.push(`野菜（${cutVegetables.join('・')}）`);
  if (cutTofuProcessed.length > 0) cutSequence.push(`豆腐・加工品（${cutTofuProcessed.join('・')}）`);
  if (cutMeatsSeafood.length > 0) cutSequence.push(`肉・魚（${cutMeatsSeafood.join('・')}）`);

  if (microwaveQueue.length > 0) {
    // Microwave steps are queued sequentially without overlapping
    let mwSummary = '';
    if (microwaveQueue.length === 1) {
      const task = microwaveQueue[0];
      mwSummary = `${task.targetFood}を耐熱皿に並べてラップをし、レンジ${task.wattage}で${task.durationMinutes}分加熱開始。`;
    } else {
      const queueDescriptions = microwaveQueue.map(
        (t) => `${t.targetFood}(レンジ${t.wattage}で${t.durationMinutes}分)`
      );
      mwSummary = `電子レンジ加熱を順次開始：まず${queueDescriptions.join('、次に')}を加熱。`;
    }

    if (allCutItems.length > 0) {
      p1Instruction = `${mwSummary}加熱中にまな板の衛生順（野菜→豆腐加工品→生肉魚）で、${allCutItems.join('・')}をすべて切る。`;
    } else {
      p1Instruction = `${mwSummary}加熱中に各料理の下準備・合わせ調味料を準備する。`;
    }
  } else {
    // No microwave tasks: pure cutting board hygiene ordering
    if (cutSequence.length > 0) {
      p1Instruction = `まな板の衛生順に下ごしらえ：まず${cutSequence.join('、次に')}をすべて切る。`;
    } else {
      p1Instruction = '各料理の下準備・合わせ調味料を準備する。';
    }
  }

  // Dynamic duration for Phase 1: max(prep cutting time, total microwave time)
  let p1PrepTime = 7;
  if (allCutItems.length === 0) {
    p1PrepTime = 3;
  } else if (allCutItems.length <= 2) {
    p1PrepTime = 5;
  } else {
    p1PrepTime = 7;
  }
  const t1 = Math.max(p1PrepTime, totalMicrowaveMinutes);

  const step1: ParallelTimelineStep = {
    stepNumber: 1,
    phase: '下ごしらえ（まとめて切る・レンジ）',
    timeWindow: `0:00〜${formatMinutes(t1)}`,
    dishTag: '全品共通',
    instruction: p1Instruction,
    done: false,
    timerMinutes: t1,
  };

  // --------------------------------------------------------------------------
  // Phase 2: 副菜と汁物の火入れ (Resource: Stove Burner 1 & Stove Burner 2)
  // --------------------------------------------------------------------------
  let p2Instruction = '';
  let p2Tag = '副菜・汁物';
  let t2 = 6;

  if (sideDish && soupDish) {
    p2Tag = '副菜・汁物';
    const canonicalSide = getCanonicalDishName(sideDish.name);
    const sideDisplay = canonicalSide && canonicalSide !== sideDish.name
      ? `「${sideDish.name}」（${canonicalSide}）`
      : `「${sideDish.name}」`;

    // Check if side dish has a boil/simmer step
    const sideSteps = sideDish.steps || [];
    const simmerTimeMatch = sideSteps.join(' ').match(/(\d+)\s*分(?:煮|茹で|ゆで)/);
    const simmerMinutes = simmerTimeMatch ? simmerTimeMatch[1] : '2';

    // Check if soup dish mentions specific ingredients (like 豆腐, わかめ, ねぎ)
    const soupIngredients = (soupDish.ingredients || []).map((i) => i.name).join('・');
    const soupIngredientNote = soupIngredients ? `に具材（${soupIngredients}）を入れて` : 'に具材を入れて';

    p2Instruction = `小鍋2つ（コンロ2口並行）にだし汁を沸かす。片方で${sideDisplay}を${simmerMinutes}分煮て火を止め味を含ませる。もう片方${soupIngredientNote}「${soupDish.name}」を作る。`;
    t2 = 6;
  } else if (sideDish) {
    p2Tag = '副菜';
    const sideSteps = sideDish.steps || [];
    const isCold = sideSteps.some((s) => /和える|冷やす|器に盛り|加熱なし/.test(s)) &&
      !sideSteps.some((s) => /炒め|焼|煮|茹で/.test(s));

    if (isCold) {
      p2Instruction = `ボウルで「${sideDish.name}」を調理し、和えて冷やす（または器に盛り付けておく）。`;
    } else {
      p2Instruction = `鍋またはボウルで「${sideDish.name}」を調理し、火を止めて味を含ませる（または和えて冷やす）。`;
    }
    t2 = 6;
  } else if (soupDish) {
    p2Tag = '汁物';
    p2Instruction = `小鍋（コンロ）にだし汁を沸かし、「${soupDish.name}」の具材を入れて火を通す。`;
    t2 = 6;
  } else {
    p2Tag = '副菜・下ごしらえ';
    p2Instruction = '調味料を合わせ、付け合わせの準備をしておく。';
    t2 = 6;
  }

  const step2: ParallelTimelineStep = {
    stepNumber: 2,
    phase: '副菜と汁物の火入れ',
    timeWindow: `${formatMinutes(t1)}〜${formatMinutes(t1 + t2)}`,
    dishTag: p2Tag,
    instruction: p2Instruction,
    done: false,
    timerMinutes: t2,
  };

  // --------------------------------------------------------------------------
  // Phase 3: 主菜の仕上げ（熱々で食卓へ） (Resource: Stove Burner 1 Climax)
  // --------------------------------------------------------------------------
  let p3Instruction = '';
  const mainSteps = mainDish.steps || [];
  const mainIngredients = mainDish.ingredients || [];

  // Identify main protein / meat from ingredients or steps
  let mainProtein = '';
  const meatIng = mainIngredients.find((i) => MEAT_FISH_PATTERNS.some((p) => p.test(i.name)));
  if (meatIng) {
    for (const step of mainSteps) {
      const match = step.match(/(豚(?:バラ)?肉?|牛(?:こま)?肉?|鶏(?:もも|むね)?肉?|[^\s、]+肉|[^\s、]+魚)/);
      if (match) {
        mainProtein = match[1];
        break;
      }
    }
    if (!mainProtein) {
      mainProtein = meatIng.name;
    }
  }

  // Check if main dish used microwave pre-cooking (e.g. dense veggies pre-softened)
  const mainUsedMicrowave = microwaveQueue.some((t) => t.dishName === mainDish.name);
  const mwTaskForMain = microwaveQueue.find((t) => t.dishName === mainDish.name);
  const mwIngredientNote = mainUsedMicrowave && mwTaskForMain
    ? `レンジ加熱済みの${mwTaskForMain.targetFood}を投入。`
    : mainUsedMicrowave
    ? 'レンジ加熱済みの具材を投入。'
    : '';

  // Extract finishing technique / time from final step
  const lastStep = mainSteps.length > 0 ? mainSteps[mainSteps.length - 1] : '';
  const timeInLastStep = lastStep.match(/(\d+(?:〜\d+)?分)/);
  const timeNote = timeInLastStep ? timeInLastStep[1] : '7〜8分';

  let t3 = 10;

  if (lastStep && /照りが出るまで|煮絡める|炒め合わせる/.test(lastStep)) {
    const proteinDesc = mainProtein ? `${mainProtein}を炒め` : `「${mainDish.name}」の具材を炒め`;
    p3Instruction = `フライパンで${proteinDesc}、${mwIngredientNote}調味料を加えて強めの中火で${timeNote}照りが出るまで煮絡めて完成。汁物を温め直して同時に食卓へ。`;
  } else if (mainSteps.length > 0) {
    p3Instruction = `フライパンを熱し、「${mainDish.name}」を炒め（または焼き）、タレを加えて照りが出るまで仕上げて熱々で完成。汁物を温め直して同時に食卓へ。`;
  } else {
    p3Instruction = `フライパンを熱し、「${mainDish.name}」を仕上げて熱々で完成。汁物を温め直して同時に食卓へ。`;
  }

  const step3: ParallelTimelineStep = {
    stepNumber: 3,
    phase: '主菜の仕上げ（熱々で食卓へ）',
    timeWindow: `${formatMinutes(t1 + t2)}〜${formatMinutes(t1 + t2 + t3)}`,
    dishTag: '主菜',
    instruction: p3Instruction,
    done: false,
    timerMinutes: t3,
  };

  // Dynamic total time calculation: T_total = T_1 + T_2 + T_3
  const totalMinutes = t1 + t2 + t3;

  return {
    estimatedMinutes: totalMinutes,
    steps: [step1, step2, step3],
  };
}
