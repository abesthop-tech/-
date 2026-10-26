// ============================================================================
// Unit Tests: tests/unit/timeline-scheduler.test.ts
// Tests: Deterministic DAG Parallel Timeline Scheduler, cutting board hygiene,
// microwave concurrency, 2-burner stove climax, and offline Gemini fallback.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { scheduleParallelCookingTimeline, DishScheduleInput } from '@/lib/timeline-scheduler';
import {
  isGeminiConfigured,
  generateCookingTimelineWithGemini,
  ocrRecipePhoto,
  extractRecipeFromUrl,
  isAllowedRecipeUrl,
  DETERMINISTIC_OCR_FALLBACK_RECIPE,
} from '@/lib/gemini';

describe('Parallel Timeline DAG Scheduler', () => {
  const seedDishes: DishScheduleInput[] = [
    {
      name: '豚バラと大根のこっくり照り煮',
      role: 'main',
      ingredients: [
        { name: '豚バラ薄切り', amount: '300g' },
        { name: '大根', amount: '1/2本' },
      ],
      steps: [
        '大根は1.5cm厚さのいちょう切りにし、耐熱皿に並べてラップをし電子レンジ(600W)で5分加熱する。',
        '豚バラ肉は4cm幅に切る。フライパンに油をひかず豚バラを炒め、焼き色がついたら大根を加える。',
        '砂糖・酒・みりん・醤油・オイスターソースを加え、強めの中火で照りが出るまで煮絡める。',
      ],
    },
    {
      name: '小松菜と油揚げのさっと煮びたし',
      role: 'side',
      ingredients: [
        { name: '小松菜', amount: '1束' },
        { name: '油揚げ', amount: '1枚' },
      ],
      steps: [
        '小松菜は4cm長さ、油揚げは短冊切りにする。',
        '鍋にだし汁・薄口醤油・みりんを沸かし、油揚げと小松菜の茎から入れて2分煮る。',
      ],
    },
    {
      name: '豆腐とわかめの味噌汁',
      role: 'soup',
      ingredients: [
        { name: '絹ごし豆腐', amount: '1丁' },
        { name: '長ねぎ', amount: '1/2本' },
      ],
      steps: [
        'だし汁を沸かし、さいの目に切った豆腐と小口切りの長ねぎを入れる。',
        '火を弱めて味噌を溶き入れ、乾燥わかめを加える。',
      ],
    },
  ];

  it('generates a 3-phase timeline matching UI mock specifications', () => {
    const result = scheduleParallelCookingTimeline(seedDishes, 3);

    expect(result.estimatedMinutes).toBe(23);
    expect(result.steps).toHaveLength(3);

    // Phase 1
    const p1 = result.steps[0];
    expect(p1.phase).toBe('下ごしらえ（まとめて切る・レンジ）');
    expect(p1.dishTag).toBe('全品共通');
    expect(p1.timeWindow).toBe('0:00〜7:00');
    expect(p1.instruction).toContain('大根');
    expect(p1.instruction).toContain('レンジ600Wで5分');

    // Phase 2
    const p2 = result.steps[1];
    expect(p2.phase).toBe('副菜と汁物の火入れ');
    expect(p2.dishTag).toBe('副菜・汁物');
    expect(p2.timeWindow).toBe('7:00〜13:00');
    expect(p2.instruction).toContain('小鍋2つ');
    expect(p2.instruction).toContain('小松菜と油揚げの煮びたし');

    // Phase 3
    const p3 = result.steps[2];
    expect(p3.phase).toBe('主菜の仕上げ（熱々で食卓へ）');
    expect(p3.dishTag).toBe('主菜');
    expect(p3.timeWindow).toBe('13:00〜23:00');
    expect(p3.instruction).toContain('豚バラ肉');
    expect(p3.instruction).toContain('照りが出るまで煮絡めて完成');
  });

  it('enforces cutting board hygiene sequence (veggies -> tofu -> meat)', () => {
    const dishesWithoutMicrowave: DishScheduleInput[] = [
      {
        name: '豚の生姜焼き',
        role: 'main',
        ingredients: [
          { name: '豚ロース薄切り', amount: '350g' },
          { name: '玉ねぎ', amount: '1個' },
        ],
        steps: ['玉ねぎをスライスし、豚肉を焼く。'],
      },
      {
        name: '小松菜のおひたし',
        role: 'side',
        ingredients: [
          { name: '小松菜', amount: '1束' },
          { name: '油揚げ', amount: '1枚' },
        ],
        steps: ['小松菜と油揚げを切って茹でる。'],
      },
    ];

    const result = scheduleParallelCookingTimeline(dishesWithoutMicrowave, 3);
    const p1 = result.steps[0];
    expect(p1.instruction).toContain('まな板の衛生順');
    expect(p1.instruction).toContain('野菜');
    expect(p1.instruction).toContain('肉・魚');
  });

  it('handles empty dish input without throwing', () => {
    const result = scheduleParallelCookingTimeline([], 3);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.steps).toEqual([]);
  });
});

describe('Gemini AI Engine & Offline Fallback', () => {
  it('detects unconfigured or placeholder API keys correctly', () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = 'placeholder';
    expect(isGeminiConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('generates deterministic timeline fallback when API key is missing', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const dishes: DishScheduleInput[] = [
      {
        name: '豚バラと大根のこっくり照り煮',
        role: 'main',
        steps: ['大根をレンジ加熱', '豚バラを炒める'],
      },
    ];

    const result = await generateCookingTimelineWithGemini(dishes, 3);
    expect(result).toBeDefined();
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].phase).toBe('下ごしらえ（まとめて切る・レンジ）');

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('returns deterministic OCR fallback recipe when offline', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const ocrResult = await ocrRecipePhoto('fake_base64_data');
    expect(ocrResult.name).toBe('ハッシュドポーク');
    expect(ocrResult.category).toBe('main');
    expect(ocrResult.baseServings).toBe(2);
    expect(ocrResult.ingredients.length).toBeGreaterThan(0);
    expect(ocrResult.steps.length).toBeGreaterThan(0);

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('enforces trusted recipe domain whitelist', () => {
    expect(isAllowedRecipeUrl('https://www.sirogohan.com/recipe/komatuna/')).toBe(true);
    expect(isAllowedRecipeUrl('https://www.kurashiru.com/recipes/tomato-tuna')).toBe(true);
    expect(isAllowedRecipeUrl('https://ameblo.jp/syunkon/entry-1234.html')).toBe(true);
    expect(isAllowedRecipeUrl('https://spammy-blog.com/recipe')).toBe(false);
  });

  it('returns deterministic recipe for trusted URL import when offline', async () => {
    const res = await extractRecipeFromUrl('https://www.sirogohan.com/recipe/komatuna/');
    expect(res.name).toBe('小松菜と油揚げのさっと煮びたし');
    expect(res.category).toBe('side');
    expect(res.ingredients.some((i) => i.name === '小松菜')).toBe(true);
  });
});
