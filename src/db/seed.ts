// ============================================================================
// Kazoku-Kondate Database Seed Engine: src/db/seed.ts
// Seeds: 17 Pantry Staples, Initial Classic Dishes, and 14-day Historical Menus
// ============================================================================
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { dishes, dailyMenus, appSettings } from './schema';

/**
 * 17 Authoritative Pantry Staples (R4 specification & UI Mock)
 */
export const DEFAULT_STAPLE_ITEMS: string[] = [
  '玉ねぎ',
  'にんにく',
  'しょうが',
  '長ねぎ',
  '卵',
  '醤油',
  'みりん',
  '酒',
  '砂糖',
  '味噌',
  '酢',
  'サラダ油',
  'ごま油',
  'オイスターソース',
  '片栗粉',
  'だしの素',
  '鶏ガラスープの素',
];

/**
 * Initial Catalog of 13 Household Classics and Repertoire Dishes
 */
export const SEED_DISHES: schema.ParsedDish[] = [
  // --- MAINS ---
  {
    id: 'dish_butabara_daikon',
    name: '豚バラと大根のこっくり照り煮',
    aliases: ['豚バラ大根', '豚バラと大根の照り煮'],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    sourceLabel: '山本ゆりさんレシピ本 (p.42)',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '豚バラ薄切り', amount: '300g', isStaple: false, category: 'meat' },
      { name: '大根', amount: '1/2本', isStaple: false, category: 'vegetable' },
      { name: 'しょうが', amount: '1片', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: '酒', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '醤油', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'オイスターソース', amount: '小さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '大根は1.5cm厚さのいちょう切りにし、耐熱皿に並べてラップをし電子レンジ(600W)で5分加熱する。',
      '豚バラ肉は4cm幅に切る。フライパンに油をひかず豚バラを炒め、焼き色がついたら大根を加える。',
      '砂糖・酒・みりん・醤油・オイスターソースを加え、強めの中火で照りが出るまで煮絡める。',
    ],
    cookCount: 8,
    lastCookedDate: '2026-09-14',
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'dish_shogayaki',
    name: '豚の生姜焼き',
    aliases: ['しょうが焼き', '生姜焼き', '豚生姜焼き'],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '豚ロース薄切り', amount: '350g', isStaple: false, category: 'meat' },
      { name: '玉ねぎ', amount: '1個', isStaple: true, category: 'vegetable' },
      { name: 'キャベツ', amount: '1/4個', isStaple: false, category: 'vegetable' },
      { name: 'しょうが', amount: '1片', isStaple: true, category: 'seasoning' },
      { name: '醤油', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '酒', amount: '大さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '玉ねぎは1cm幅のくし形に切り、しょうがはすりおろす。キャベツは千切りにする。',
      '醤油、みりん、酒、すりおろししょうがを合わせてタレを作る。',
      'フライパンに油を熱し豚肉を両面焼き、玉ねぎを加え、タレを回し入れて手早く絡める。',
    ],
    cookCount: 12,
    lastCookedDate: '2026-10-10',
    createdAt: '2026-01-05T09:00:00.000Z',
  },
  {
    id: 'dish_chanchan_yaki',
    name: '鮭とキャベツのちゃんちゃん焼き',
    aliases: ['鮭のちゃんちゃん焼き', 'ちゃんちゃん焼き'],
    category: 'main',
    proteinType: 'fish',
    sourceType: 'trusted_web',
    sourceLabel: '白ごはん.com',
    sourceUrl: 'https://www.sirogohan.com/recipe/chanchan/',
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '生鮭', amount: '3切れ', isStaple: false, category: 'fish' },
      { name: 'キャベツ', amount: '1/4個', isStaple: false, category: 'vegetable' },
      { name: 'しめじ', amount: '1パック', isStaple: false, category: 'vegetable' },
      { name: '玉ねぎ', amount: '1/2個', isStaple: true, category: 'vegetable' },
      { name: '味噌', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: 'バター', amount: '15g', isStaple: false, category: 'dairy_tofu' },
    ],
    steps: [
      'キャベツはざく切り、しめじは石づきを取ってほぐす。味噌・みりん・砂糖を混ぜ合わせる。',
      'フライパンに鮭を並べて両面を焼き、周りに野菜を広げて味噌だれを回しかける。',
      '蓋をして弱中火で5分蒸し焼きにし、仕上げにバターを乗せて全体を軽くほぐす。',
    ],
    cookCount: 4,
    lastCookedDate: '2026-10-02',
    createdAt: '2026-02-15T11:00:00.000Z',
  },
  {
    id: 'dish_teriyaki_chicken',
    name: '鶏肉と長ねぎの照り焼き',
    aliases: ['鶏の照り焼き', 'チキン照り焼き'],
    category: 'main',
    proteinType: 'chicken',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '鶏もも肉', amount: '2枚(500g)', isStaple: false, category: 'meat' },
      { name: '長ねぎ', amount: '2本', isStaple: true, category: 'vegetable' },
      { name: '醤油', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '酒', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '鶏肉は一口大に切り、長ねぎは3cm長さに切る。',
      'フライパンで鶏肉の皮目から焼き、焼き色がついたら裏返して長ねぎを加える。',
      '調味料を加えて煮詰め、とろみがついたら絡めて火を止める。',
    ],
    cookCount: 9,
    lastCookedDate: '2026-10-18',
    createdAt: '2026-01-12T12:00:00.000Z',
  },
  {
    id: 'dish_gyudon_special',
    name: '牛丼（お祖父様特製）',
    aliases: ['牛丼', '牛肉と玉ねぎの煮込み'],
    category: 'main',
    proteinType: 'beef',
    sourceType: 'classic_book',
    sourceLabel: 'お祖父様の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '牛こま切れ肉', amount: '300g', isStaple: false, category: 'meat' },
      { name: '玉ねぎ', amount: '1個', isStaple: true, category: 'vegetable' },
      { name: 'しょうが', amount: '1片', isStaple: true, category: 'seasoning' },
      { name: 'だし汁', amount: '200ml', isStaple: true, category: 'seasoning' },
      { name: '醤油', amount: '大さじ3', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1.5', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '玉ねぎは1cm幅にスライスし、しょうがは細切りにする。',
      '鍋にだし汁と調味料、玉ねぎを入れて5分煮る。',
      '牛肉をほぐしながら加え、アクを取りつつ弱火で7分煮込む。',
    ],
    cookCount: 14,
    lastCookedDate: '2026-10-25',
    createdAt: '2026-01-02T08:00:00.000Z',
  },

  // --- SIDES ---
  {
    id: 'dish_komatsuna_nibitashi',
    name: '小松菜と油揚げのさっと煮びたし',
    aliases: ['小松菜の煮浸し', '小松菜と油揚げの煮物'],
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'trusted_web',
    sourceLabel: '白ごはん.com',
    sourceUrl: 'https://www.sirogohan.com/recipe/komatuna/',
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '小松菜', amount: '1束', isStaple: false, category: 'vegetable' },
      { name: '油揚げ', amount: '1枚', isStaple: false, category: 'dairy_tofu' },
      { name: 'だし汁', amount: '200ml', isStaple: true, category: 'seasoning' },
      { name: '薄口醤油', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: 'みりん', amount: '大さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '小松菜は4cm長さに切り、油揚げは短冊切りにする。',
      '小鍋にだし汁・醤油・みりんを沸かし、油揚げと小松菜の茎から入れて2分煮る。',
      '葉を加えてさっと1分煮たら火を止め、粗熱を取りながら味を含ませる。',
    ],
    cookCount: 11,
    lastCookedDate: '2026-10-05',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'dish_tomato_tuna',
    name: 'トマトとツナのポン酢和え',
    aliases: ['トマトとツナの和え物'],
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'wishlist',
    sourceLabel: 'クラシル公式',
    sourceUrl: 'https://www.kurashiru.com/recipes/tomato-tuna',
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: 'トマト', amount: '2個', isStaple: false, category: 'vegetable' },
      { name: 'ツナ缶', amount: '1缶', isStaple: false, category: 'fish' },
      { name: '大葉', amount: '5枚', isStaple: false, category: 'vegetable' },
      { name: 'ポン酢', amount: '大さじ1.5', isStaple: true, category: 'seasoning' },
      { name: 'ごま油', amount: '小さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      'トマトは一口大の乱切りにし、大葉は千切りにする。',
      'ボウルにトマト、油を切ったツナ、大葉を入れてポン酢とごま油で和える。',
    ],
    cookCount: 0,
    lastCookedDate: null,
    createdAt: '2026-10-20T14:00:00.000Z',
  },
  {
    id: 'dish_kyuri_sunomono',
    name: 'きゅうりとわかめの酢の物',
    aliases: ['きゅうりの酢の物'],
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'ai_generated',
    sourceLabel: 'AI標準レシピ（微調整済）',
    sourceUrl: null,
    recipeStatus: 'ai_provisional',
    baseServings: 3,
    ingredients: [
      { name: 'きゅうり', amount: '2本', isStaple: false, category: 'vegetable' },
      { name: '乾燥わかめ', amount: '大さじ2', isStaple: true, category: 'vegetable' },
      { name: '酢', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: '醤油', amount: '小さじ1', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      'きゅうりは薄い輪切りにして塩もみし、水気を絞る。わかめは水で戻す。',
      '酢・砂糖・醤油を混ぜ合わせ、きゅうりとわかめを和える。',
    ],
    cookCount: 2,
    lastCookedDate: '2026-08-19',
    createdAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'dish_hourensou_gomaae',
    name: 'ほうれん草の胡麻和え',
    aliases: ['ほうれん草のごま和え', '胡麻和え'],
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: 'ほうれん草', amount: '1束', isStaple: false, category: 'vegetable' },
      { name: 'すりごま', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: '醤油', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: '砂糖', amount: '大さじ1/2', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      'ほうれん草は熱湯で1分茹でて冷水にとり、水気を絞って4cm長さに切る。',
      'ボウルですりごま・醤油・砂糖を混ぜ合わせ、ほうれん草を加えて和える。',
    ],
    cookCount: 15,
    lastCookedDate: '2026-10-15',
    createdAt: '2026-01-08T09:00:00.000Z',
  },

  // --- SOUPS ---
  {
    id: 'dish_miso_tofu_wakame',
    name: '豆腐とわかめの味噌汁',
    aliases: ['豆腐の味噌汁', '豆腐とワカメのお味噌汁'],
    category: 'soup',
    proteinType: 'egg_tofu',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '絹ごし豆腐', amount: '1丁', isStaple: false, category: 'dairy_tofu' },
      { name: '長ねぎ', amount: '1/2本', isStaple: true, category: 'vegetable' },
      { name: '乾燥わかめ', amount: '大さじ1', isStaple: true, category: 'vegetable' },
      { name: 'だし汁', amount: '600ml', isStaple: true, category: 'seasoning' },
      { name: '味噌', amount: '大さじ2', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '鍋にだし汁を沸かし、さいの目に切った豆腐と小口切りの長ねぎを入れる。',
      '煮立つ直前に弱火にして味噌を溶き入れ、乾燥わかめを加えて火を止める。',
    ],
    cookCount: 34,
    lastCookedDate: '2026-10-21',
    createdAt: '2026-01-01T07:00:00.000Z',
  },
  {
    id: 'dish_kakutama_soup',
    name: 'かきたま中華スープ',
    aliases: ['かきたまスープ', '卵スープ'],
    category: 'soup',
    proteinType: 'egg_tofu',
    sourceType: 'classic_book',
    sourceLabel: '山本ゆりさんブログ',
    sourceUrl: 'https://ameblo.jp/syunkon/entry-12345.html',
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: 'えのき', amount: '1/2袋', isStaple: false, category: 'vegetable' },
      { name: '卵', amount: '1個', isStaple: true, category: 'dairy_tofu' },
      { name: '長ねぎ', amount: '1/3本', isStaple: true, category: 'vegetable' },
      { name: '鶏ガラスープの素', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      { name: '片栗粉', amount: '小さじ1', isStaple: true, category: 'seasoning' },
      { name: 'ごま油', amount: '少々', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '鍋に水600mlと鶏ガラスープの素を沸かし、ほぐしたえのきを入れて2分煮る。',
      '水溶き片栗粉を加えてとろみをつけ、溶き卵を菜箸に伝わせて回し入れ、ごま油を垂らす。',
    ],
    cookCount: 6,
    lastCookedDate: '2026-09-28',
    createdAt: '2026-02-10T12:00:00.000Z',
  },
  {
    id: 'dish_tonjiru',
    name: '具だくさん豚汁',
    aliases: ['豚汁', 'とん汁'],
    category: 'soup',
    proteinType: 'pork',
    sourceType: 'classic_book',
    sourceLabel: '我が家の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: '豚こま切れ肉', amount: '150g', isStaple: false, category: 'meat' },
      { name: '大根', amount: '1/4本', isStaple: false, category: 'vegetable' },
      { name: 'にんじん', amount: '1/2本', isStaple: false, category: 'vegetable' },
      { name: '長ねぎ', amount: '1/2本', isStaple: true, category: 'vegetable' },
      { name: 'ごぼう', amount: '1/2本', isStaple: false, category: 'vegetable' },
      { name: 'だし汁', amount: '700ml', isStaple: true, category: 'seasoning' },
      { name: '味噌', amount: '大さじ3', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      '野菜はいちょう切りや乱切りにし、ごぼうはささがきにして水にさらす。',
      '鍋にごま油を熱して豚肉と野菜を炒め、だし汁を加えてアクを取りながら10分煮る。',
      '野菜が柔らかくなったら火を止め、味噌を溶き入れて小口切りの長ねぎを加える。',
    ],
    cookCount: 18,
    lastCookedDate: '2026-10-12',
    createdAt: '2026-01-03T11:00:00.000Z',
  },
  {
    id: 'dish_nameko_akadaishi',
    name: 'なめこと豆腐の赤だし味噌汁',
    aliases: ['なめこの味噌汁', '赤だし'],
    category: 'soup',
    proteinType: 'egg_tofu',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [
      { name: 'なめこ', amount: '1袋', isStaple: false, category: 'vegetable' },
      { name: '木綿豆腐', amount: '1/2丁', isStaple: false, category: 'dairy_tofu' },
      { name: '三つ葉', amount: '少々', isStaple: false, category: 'vegetable' },
      { name: '赤味噌', amount: '大さじ2', isStaple: true, category: 'seasoning' },
      { name: 'だし汁', amount: '600ml', isStaple: true, category: 'seasoning' },
    ],
    steps: [
      'なめこはザルで水洗いする。豆腐はさいの目に切る。',
      'だし汁を温めてなめこと豆腐を加え、ひと煮立ちしたら赤味噌を溶き入れる。',
    ],
    cookCount: 8,
    lastCookedDate: '2026-10-08',
    createdAt: '2026-01-20T10:00:00.000Z',
  },
];

/**
 * Historical 14-Day Daily Menus Ending at Today (2026-10-26)
 */
export const SEED_MENUS: schema.ParsedDailyMenu[] = [
  // 1. Today (2026-10-26) - Matches ui_mock.html
  {
    date: '2026-10-26',
    servings: 3,
    contextMemo: '大根、豚バラ',
    slots: [
      {
        role: 'main',
        dishId: 'dish_butabara_daikon',
        dishName: '豚バラと大根のこっくり照り煮',
        locked: true,
        lockReason: '祖父が担当・固定中',
        sourceLabel: '山本ゆりさんレシピ本 (p.42)',
        badge: '我が家の定番',
        ingredients: ['豚バラ薄切り 300g', '大根 1/2本'],
        steps: [
          '大根は1.5cm厚さのいちょう切りにし、耐熱皿に並べてラップをし電子レンジ(600W)で5分加熱する。',
          '豚バラ肉は4cm幅に切る。フライパンに油をひかず豚バラを炒め、焼き色がついたら大根を加える。',
          '砂糖・酒・みりん・醤油・オイスターソースを加え、強めの中火で照りが出るまで煮絡める。',
        ],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '我が家の定番',
        ingredients: ['小松菜 1束', '油揚げ 1枚'],
        steps: [
          '小松菜は4cm長さ、油揚げは短冊切りにする。',
          '鍋にだし汁・薄口醤油・みりんを沸かし、油揚げと小松菜の茎から入れて2分煮る。',
        ],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: [
          'だし汁を沸かし、さいの目に切った豆腐と小口切りの長ねぎを入れる。',
          '火を弱めて味噌を溶き入れ、乾燥わかめを加える。',
        ],
      },
    ],
    parallelSteps: [
      {
        stepNumber: 1,
        phase: '下ごしらえ（まとめて切る・レンジ）',
        timeWindow: '0:00〜7:00',
        dishTag: '全品共通',
        instruction:
          '大根(1/2本)をいちょう切りにして耐熱皿に入れ、レンジ600Wで5分加熱開始。加熱中に小松菜・油揚げ・豆腐・長ねぎ・豚バラ肉をすべて切る。',
        done: false,
      },
      {
        stepNumber: 2,
        phase: '副菜と汁物の火入れ',
        timeWindow: '7:00〜13:00',
        dishTag: '副菜・汁物',
        instruction:
          '小鍋2つにだし汁を沸かす。片方で「小松菜と油揚げの煮びたし」を2分煮て火を止め味を含ませる。もう片方に豆腐を入れて味噌汁を作る。',
        done: false,
      },
      {
        stepNumber: 3,
        phase: '主菜の仕上げ（熱々で食卓へ）',
        timeWindow: '13:00〜23:00',
        dishTag: '主菜',
        instruction:
          'フライパンで豚バラ肉を炒め、レンジ加熱済みの大根を投入。調味料を加えて強めの中火で7〜8分照りが出るまで煮絡めて完成。',
        done: false,
      },
    ],
    shoppingState: {
      mainItems: [
        { id: 1, name: '豚バラ薄切り', amount: '300g', dishRole: '主菜', checked: false },
        { id: 2, name: '大根', amount: '1/2本', dishRole: '主菜', checked: false },
        { id: 3, name: '小松菜', amount: '1束', dishRole: '副菜', checked: false },
        { id: 4, name: '油揚げ', amount: '1枚', dishRole: '副菜', checked: false },
        { id: 5, name: '絹ごし豆腐', amount: '1丁', dishRole: '汁物', checked: false },
      ],
      stapleItems: [
        { id: 101, name: '長ねぎ (1/2本)' },
        { id: 102, name: '乾燥わかめ' },
        { id: 103, name: 'しょうが' },
        { id: 104, name: 'オイスターソース' },
        { id: 105, name: '醤油・みりん・酒' },
        { id: 106, name: '味噌・だしの素' },
      ],
    },
    updatedAt: '2026-10-26T03:30:00.000Z',
  },
  // 2. Yesterday (2026-10-25)
  {
    date: '2026-10-25',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_gyudon_special',
        dishName: '牛丼（お祖父様特製）',
        locked: true,
        lockReason: 'お祖父様特製',
        sourceLabel: 'お祖父様の定番',
        badge: '我が家の定番',
        ingredients: ['牛こま切れ肉 300g', '玉ねぎ 1個'],
        steps: ['玉ねぎを炒め...', '牛肉を加えて煮込む...'],
      },
      {
        role: 'side',
        dishId: 'dish_kyuri_sunomono',
        dishName: 'きゅうりとわかめの酢の物',
        locked: false,
        sourceLabel: 'AI標準レシピ',
        badge: 'カレンダー履歴',
        ingredients: ['きゅうり 2本', '乾燥わかめ 大さじ2'],
        steps: ['きゅうりを塩もみし...', '酢の物にする...'],
      },
      {
        role: 'soup',
        dishId: 'dish_nameko_akadaishi',
        dishName: 'なめこと豆腐の赤だし味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['なめこ 1袋', '木綿豆腐 1/2丁'],
        steps: ['だし汁になめこと豆腐を加え...', '赤味噌を溶く...'],
      },
    ],
    updatedAt: '2026-10-25T19:00:00.000Z',
  },
  // 3. 2 days ago (2026-10-24)
  {
    date: '2026-10-24',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_chanchan_yaki',
        dishName: '鮭とキャベツのちゃんちゃん焼き',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '信頼サイト',
        ingredients: ['生鮭 3切れ', 'キャベツ 1/4個'],
        steps: ['鮭を焼き...', '野菜と蒸し焼き...'],
      },
      {
        role: 'side',
        dishId: 'dish_hourensou_gomaae',
        dishName: 'ほうれん草の胡麻和え',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['ほうれん草 1束', 'すりごま 大さじ2'],
        steps: ['茹でて和える...'],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: ['味噌汁を作る...'],
      },
    ],
    updatedAt: '2026-10-24T19:00:00.000Z',
  },
  // 4. 3 days ago (2026-10-23)
  {
    date: '2026-10-23',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_teriyaki_chicken',
        dishName: '鶏肉と長ねぎの照り焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['鶏もも肉 2枚', '長ねぎ 2本'],
        steps: ['鶏肉を焼き照り焼きに...'],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '我が家の定番',
        ingredients: ['小松菜 1束', '油揚げ 1枚'],
        steps: ['煮びたしを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_kakutama_soup',
        dishName: 'かきたま中華スープ',
        locked: false,
        sourceLabel: '山本ゆりさんブログ',
        badge: '我が家の定番',
        ingredients: ['えのき 1/2袋', '卵 1個'],
        steps: ['中華スープを作る...'],
      },
    ],
    updatedAt: '2026-10-23T19:00:00.000Z',
  },
  // 5. 4 days ago (2026-10-22)
  {
    date: '2026-10-22',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_shogayaki',
        dishName: '豚の生姜焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['豚ロース薄切り 350g', '玉ねぎ 1個'],
        steps: ['豚肉を焼きタレを絡める...'],
      },
      {
        role: 'side',
        dishId: 'dish_kyuri_sunomono',
        dishName: 'きゅうりとわかめの酢の物',
        locked: false,
        sourceLabel: 'AI標準レシピ',
        badge: 'カレンダー履歴',
        ingredients: ['きゅうり 2本', '乾燥わかめ 大さじ2'],
        steps: ['酢の物を作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: ['味噌汁を作る...'],
      },
    ],
    updatedAt: '2026-10-22T19:00:00.000Z',
  },
  // 6. 5 days ago (2026-10-21)
  {
    date: '2026-10-21',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_gyudon_special',
        dishName: '牛丼（お祖父様特製）',
        locked: true,
        sourceLabel: 'お祖父様の定番',
        badge: '我が家の定番',
        ingredients: ['牛こま切れ肉 300g', '玉ねぎ 1個'],
        steps: ['牛丼を作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_hourensou_gomaae',
        dishName: 'ほうれん草の胡麻和え',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['ほうれん草 1束', 'すりごま 大さじ2'],
        steps: ['胡麻和えを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: ['味噌汁を作る...'],
      },
    ],
    updatedAt: '2026-10-21T19:00:00.000Z',
  },
  // 7. 6 days ago (2026-10-20)
  {
    date: '2026-10-20',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_chanchan_yaki',
        dishName: '鮭とキャベツのちゃんちゃん焼き',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '信頼サイト',
        ingredients: ['生鮭 3切れ', 'キャベツ 1/4個'],
        steps: ['ちゃんちゃん焼きを作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '我が家の定番',
        ingredients: ['小松菜 1束', '油揚げ 1枚'],
        steps: ['煮びたしを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_kakutama_soup',
        dishName: 'かきたま中華スープ',
        locked: false,
        sourceLabel: '山本ゆりさんブログ',
        badge: '我が家の定番',
        ingredients: ['えのき 1/2袋', '卵 1個'],
        steps: ['中華スープを作る...'],
      },
    ],
    updatedAt: '2026-10-20T19:00:00.000Z',
  },
  // 8. 7 days ago (2026-10-19)
  {
    date: '2026-10-19',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_shogayaki',
        dishName: '豚の生姜焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['豚ロース薄切り 350g', '玉ねぎ 1個'],
        steps: ['生姜焼きを作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_kyuri_sunomono',
        dishName: 'きゅうりとわかめの酢の物',
        locked: false,
        sourceLabel: 'AI標準レシピ',
        badge: 'カレンダー履歴',
        ingredients: ['きゅうり 2本', '乾燥わかめ 大さじ2'],
        steps: ['酢の物を作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_nameko_akadaishi',
        dishName: 'なめこと豆腐の赤だし味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['なめこ 1袋', '木綿豆腐 1/2丁'],
        steps: ['赤だしを作る...'],
      },
    ],
    updatedAt: '2026-10-19T19:00:00.000Z',
  },
  // 9. 8 days ago (2026-10-18)
  {
    date: '2026-10-18',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_teriyaki_chicken',
        dishName: '鶏肉と長ねぎの照り焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['鶏もも肉 2枚', '長ねぎ 2本'],
        steps: ['鶏肉を照り焼きに...'],
      },
      {
        role: 'side',
        dishId: 'dish_hourensou_gomaae',
        dishName: 'ほうれん草の胡麻和え',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['ほうれん草 1束', 'すりごま 大さじ2'],
        steps: ['胡麻和えを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: ['味噌汁を作る...'],
      },
    ],
    updatedAt: '2026-10-18T19:00:00.000Z',
  },
  // 10. 9 days ago (2026-10-17)
  {
    date: '2026-10-17',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_gyudon_special',
        dishName: '牛丼（お祖父様特製）',
        locked: true,
        sourceLabel: 'お祖父様の定番',
        badge: '我が家の定番',
        ingredients: ['牛こま切れ肉 300g', '玉ねぎ 1個'],
        steps: ['牛丼を作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '我が家の定番',
        ingredients: ['小松菜 1束', '油揚げ 1枚'],
        steps: ['煮びたしを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_kakutama_soup',
        dishName: 'かきたま中華スープ',
        locked: false,
        sourceLabel: '山本ゆりさんブログ',
        badge: '我が家の定番',
        ingredients: ['えのき 1/2袋', '卵 1個'],
        steps: ['中華スープを作る...'],
      },
    ],
    updatedAt: '2026-10-17T19:00:00.000Z',
  },
  // 11. 10 days ago (2026-10-16)
  {
    date: '2026-10-16',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_chanchan_yaki',
        dishName: '鮭とキャベツのちゃんちゃん焼き',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '信頼サイト',
        ingredients: ['生鮭 3切れ', 'キャベツ 1/4個'],
        steps: ['ちゃんちゃん焼きを作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_kyuri_sunomono',
        dishName: 'きゅうりとわかめの酢の物',
        locked: false,
        sourceLabel: 'AI標準レシピ',
        badge: 'カレンダー履歴',
        ingredients: ['きゅうり 2本', '乾燥わかめ 大さじ2'],
        steps: ['酢の物を作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_nameko_akadaishi',
        dishName: 'なめこと豆腐の赤だし味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['なめこ 1袋', '木綿豆腐 1/2丁'],
        steps: ['赤だしを作る...'],
      },
    ],
    updatedAt: '2026-10-16T19:00:00.000Z',
  },
  // 12. 11 days ago (2026-10-15)
  {
    date: '2026-10-15',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_shogayaki',
        dishName: '豚の生姜焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['豚ロース薄切り 350g', '玉ねぎ 1個'],
        steps: ['生姜焼きを作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_hourensou_gomaae',
        dishName: 'ほうれん草の胡麻和え',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['ほうれん草 1束', 'すりごま 大さじ2'],
        steps: ['胡麻和えを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['絹ごし豆腐 1丁', '長ねぎ 1/2本'],
        steps: ['味噌汁を作る...'],
      },
    ],
    updatedAt: '2026-10-15T19:00:00.000Z',
  },
  // 13. 12 days ago (2026-10-14)
  {
    date: '2026-10-14',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_teriyaki_chicken',
        dishName: '鶏肉と長ねぎの照り焼き',
        locked: false,
        sourceLabel: '家庭の定番',
        badge: '我が家の定番',
        ingredients: ['鶏もも肉 2枚', '長ねぎ 2本'],
        steps: ['鶏肉照り焼きを作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        sourceLabel: '白ごはん.com',
        badge: '我が家の定番',
        ingredients: ['小松菜 1束', '油揚げ 1枚'],
        steps: ['煮びたしを作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_kakutama_soup',
        dishName: 'かきたま中華スープ',
        locked: false,
        sourceLabel: '山本ゆりさんブログ',
        badge: '我が家の定番',
        ingredients: ['えのき 1/2袋', '卵 1個'],
        steps: ['中華スープを作る...'],
      },
    ],
    updatedAt: '2026-10-14T19:00:00.000Z',
  },
  // 14. 13 days ago (2026-10-13)
  {
    date: '2026-10-13',
    servings: 3,
    contextMemo: null,
    slots: [
      {
        role: 'main',
        dishId: 'dish_gyudon_special',
        dishName: '牛丼（お祖父様特製）',
        locked: true,
        sourceLabel: 'お祖父様の定番',
        badge: '我が家の定番',
        ingredients: ['牛こま切れ肉 300g', '玉ねぎ 1個'],
        steps: ['牛丼を作る...'],
      },
      {
        role: 'side',
        dishId: 'dish_kyuri_sunomono',
        dishName: 'きゅうりとわかめの酢の物',
        locked: false,
        sourceLabel: 'AI標準レシピ',
        badge: 'カレンダー履歴',
        ingredients: ['きゅうり 2本', '乾燥わかめ 大さじ2'],
        steps: ['酢の物を作る...'],
      },
      {
        role: 'soup',
        dishId: 'dish_tonjiru',
        dishName: '具だくさん豚汁',
        locked: false,
        sourceLabel: '我が家の定番',
        badge: '我が家の定番',
        ingredients: ['豚こま切れ肉 150g', '大根 1/4本'],
        steps: ['豚汁を作る...'],
      },
    ],
    updatedAt: '2026-10-13T19:00:00.000Z',
  },
];

/**
 * Seeds Database with Initial Master Records
 */
export async function seedDatabase(targetDb: LibSQLDatabase<typeof schema>): Promise<void> {
  // 1. Seed App Settings
  await targetDb
    .insert(appSettings)
    .values([
      {
        key: 'staple_items',
        valueJson: JSON.stringify(DEFAULT_STAPLE_ITEMS),
      },
      {
        key: 'classic_threshold',
        valueJson: JSON.stringify(5),
      },
      {
        key: 'family_profile',
        valueJson: JSON.stringify({
          familyId: 'kazoku_default',
          defaultServings: 3,
          members: [
            { id: 'mother', name: '母', role: 'cook' },
            { id: 'grandfather', name: '祖父', role: 'member' },
            { id: 'user', name: '自分', role: 'cook' },
          ],
          stapleItems: DEFAULT_STAPLE_ITEMS,
          classicThreshold: 5,
        }),
      },
    ])
    .onConflictDoNothing();

  // 2. Seed Dishes
  for (const dish of SEED_DISHES) {
    await targetDb
      .insert(dishes)
      .values(schema.dishToInsert(dish))
      .onConflictDoNothing();
  }

  // 3. Seed Menus
  for (const menu of SEED_MENUS) {
    await targetDb
      .insert(dailyMenus)
      .values(schema.dailyMenuToInsert(menu))
      .onConflictDoNothing();
  }
}

// Standalone execution support via tsx src/db/seed.ts
if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('src/db/seed.ts')
) {
  (async () => {
    const { db: defaultDb, ensureDatabaseInitialized } = await import('./index');
    console.log('[Seed] Ensuring schema initialized...');
    await ensureDatabaseInitialized();
    console.log('[Seed] Populating seed records...');
    await seedDatabase(defaultDb);
    console.log('[Seed] Seed completed successfully.');
  })().catch((err) => {
    console.error('[Seed] Error during seeding:', err);
    process.exit(1);
  });
}
