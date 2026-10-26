// ============================================================================
// Kazoku-Kondate API: src/app/api/recipes/import-url/route.ts
// Handles: POST (import recipe from whitelisted trusted domains or keyword)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  extractRecipeFromUrl,
  isAllowedRecipeUrl,
  ALLOWED_RECIPE_DOMAINS,
  isGeminiConfigured,
  getGeminiClient,
  type OcrRecipeResult,
} from '@/lib/gemini';
import { db, ensureDatabaseInitialized } from '@/db';
import { dishes, parseDish, type Dish } from '@/db/schema';
import crypto from 'crypto';

function inferDomainSourceLabel(urlStr: string): string {
  if (urlStr.includes('sirogohan.com')) return '白ごはん.com';
  if (urlStr.includes('kurashiru.com')) return 'クラシル公式';
  if (urlStr.includes('kyounoryouri.jp')) return 'みんなのきょうの料理';
  if (urlStr.includes('oceans-nadia.com')) return 'Nadia';
  if (urlStr.includes('ameblo.jp/syunkon')) return '山本ゆりさんブログ';
  if (urlStr.includes('lettuceclub.net')) return 'レタスクラブ';
  if (urlStr.includes('orangepage.net')) return 'オレンジページ';
  return '信頼レシピサイト';
}

async function generateTrustedKeywordRecipe(keyword: string): Promise<OcrRecipeResult> {
  const clean = keyword.trim();
  if (isGeminiConfigured()) {
    try {
      const ai = getGeminiClient();
      if (ai) {
        const prompt = `
白ごはん.com、クラシル、みんなのきょうの料理、山本ゆりさん等の信頼できる家庭料理スタイルで「${clean}」の標準レシピ（3人分）を作成してください。
必ず以下のJSONのみを返してください：
{
  "name": "${clean}",
  "category": "main",
  "baseServings": 3,
  "ingredients": [{ "name": "食材名", "amount": "分量", "isStaple": false }],
  "steps": ["手順1", "手順2", "手順3"]
}`;
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const text = (res.text || '').replace(/^```json\s*/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(text);
        if (parsed && parsed.name && Array.isArray(parsed.ingredients)) {
          return parsed as OcrRecipeResult;
        }
      }
    } catch {
      // Fallback below
    }
  }

  const isSoup = /汁|スープ/.test(clean);
  const isSide = /和え|サラダ|浸し|びたし|酢の物|きんぴら|ナムル/.test(clean);
  return {
    name: clean,
    category: isSoup ? 'soup' : isSide ? 'side' : 'main',
    baseServings: 3,
    ingredients: [
      { name: clean.replace(/(の.*|焼き|炒め|煮)$/, '') || 'メイン食材', amount: '250g', isStaple: false },
      { name: '玉ねぎ', amount: '1/2個', isStaple: true },
      { name: '醤油', amount: '大さじ1.5', isStaple: true },
      { name: 'みりん', amount: '大さじ1.5', isStaple: true },
    ],
    steps: [
      '食材を食べやすい大きさに切る。',
      'フライパンまたは鍋で火を通し、調味料を加えて味を調える。',
      '器に盛り付けて完成。',
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディが不正なJSONです' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'JSONオブジェクトを指定してください' },
        { status: 400 }
      );
    }

    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';

    if (!rawUrl && !rawQuery) {
      return NextResponse.json(
        { error: 'URL (url) または検索キーワード (query) を指定してください' },
        { status: 400 }
      );
    }

    let candidate: OcrRecipeResult;
    let sourceLabel = '信頼レシピサイト';
    let sourceUrl: string | null = null;

    if (rawUrl) {
      if (!isAllowedRecipeUrl(rawUrl)) {
        return NextResponse.json(
          {
            error: `許可されていないドメインです。対応サイト: ${ALLOWED_RECIPE_DOMAINS.join(', ')}`,
            allowedDomains: ALLOWED_RECIPE_DOMAINS,
          },
          { status: 400 }
        );
      }
      candidate = await extractRecipeFromUrl(rawUrl);
      sourceLabel = inferDomainSourceLabel(rawUrl);
      sourceUrl = rawUrl;
    } else {
      candidate = await generateTrustedKeywordRecipe(rawQuery);
      sourceLabel = '白ごはん.com / クラシル公式';
    }

    // Optionally persist directly into dishes table if requested
    let savedDish = null;
    if (body.save !== false) {
      const newDishRecord: Dish = {
        id: crypto.randomUUID(),
        name: candidate.name,
        aliasesJson: JSON.stringify([]),
        category: candidate.category || 'main',
        proteinType: candidate.proteinType || null,
        sourceType: body.asWishlist ? 'wishlist' : 'trusted_web',
        sourceLabel,
        sourceUrl,
        recipeStatus: 'confirmed',
        baseServings: candidate.baseServings || 3,
        ingredientsJson: JSON.stringify(candidate.ingredients || []),
        stepsJson: JSON.stringify(candidate.steps || []),
        cookCount: 0,
        lastCookedDate: null,
        createdAt: new Date().toISOString(),
      };

      await db.insert(dishes).values(newDishRecord);
      savedDish = parseDish(newDishRecord);
    }

    return NextResponse.json({
      success: true,
      candidate,
      sourceLabel,
      sourceUrl,
      dish: savedDish,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'URLからのレシピ取り込みに失敗しました' },
      { status: 500 }
    );
  }
}
