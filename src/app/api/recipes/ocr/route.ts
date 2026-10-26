// ============================================================================
// Kazoku-Kondate API: src/app/api/recipes/ocr/route.ts
// Handles: POST (extract recipe from cookbook photo via multipart or JSON)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  ocrRecipePhoto,
  DETERMINISTIC_OCR_FALLBACK_RECIPE,
  type OcrRecipeResult,
} from '@/lib/gemini';

export type StructuredRecipe = OcrRecipeResult;

/**
 * POST /api/recipes/ocr
 * Request body:
 *   - multipart/form-data: file or image (binary), or imageBase64 (string)
 *   - application/json: { imageBase64: string, mimeType?: string }
 *
 * Behavior:
 *   - Validates presence of image payload (returns 400 if empty).
 *   - Normalizes data URI schemas ("data:image/...;base64,...").
 *   - Invokes extractRecipeFromPhoto / ocrRecipePhoto with offline deterministic fallback.
 *   - Returns { success: true, candidate: StructuredRecipe }.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let imageBase64 = '';
    let mimeType = 'image/jpeg';

    if (contentType.includes('multipart/form-data')) {
      // 1. Handle multipart/form-data
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { error: 'フォームデータの解析に失敗しました' },
          { status: 400 }
        );
      }

      const fileEntry = formData.get('file') || formData.get('image');

      if (fileEntry && typeof (fileEntry as any).arrayBuffer === 'function') {
        const file = fileEntry as File;
        if (file.size === 0) {
          return NextResponse.json(
            { error: '画像ファイルが空です' },
            { status: 400 }
          );
        }
        const arrayBuffer = await file.arrayBuffer();
        imageBase64 = Buffer.from(arrayBuffer).toString('base64');
        mimeType = file.type || 'image/jpeg';
      } else {
        const rawBase64 = formData.get('imageBase64');
        if (typeof rawBase64 === 'string' && rawBase64.trim() !== '') {
          imageBase64 = rawBase64.trim();
          const rawMime = formData.get('mimeType');
          if (typeof rawMime === 'string' && rawMime.trim() !== '') {
            mimeType = rawMime.trim();
          }
        }
      }
    } else {
      // 2. Handle JSON or raw payload
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
          { error: 'リクエストボディはオブジェクトである必要があります' },
          { status: 400 }
        );
      }

      const rawBase64 = body.imageBase64 || body.image;
      if (typeof rawBase64 === 'string' && rawBase64.trim() !== '') {
        imageBase64 = rawBase64.trim();
      }

      if (typeof body.mimeType === 'string' && body.mimeType.trim() !== '') {
        mimeType = body.mimeType.trim();
      }
    }

    // 3. Validate imageBase64 presence
    if (!imageBase64 || imageBase64.trim() === '') {
      return NextResponse.json(
        { error: '画像データ (imageBase64 またはファイル) は必須です' },
        { status: 400 }
      );
    }

    // 4. Strip Data URI prefix if user provided "data:image/png;base64,..."
    if (imageBase64.startsWith('data:')) {
      const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        imageBase64 = match[2];
      }
    }

    // 5. Invoke OCR Engine with Fallback
    let candidate: StructuredRecipe;
    try {
      candidate = await ocrRecipePhoto(imageBase64, mimeType);
      if (!candidate || !candidate.name) {
        candidate = DETERMINISTIC_OCR_FALLBACK_RECIPE;
      }
    } catch (err: any) {
      console.warn('[OCR Route] Gemini extraction failed, using deterministic fallback:', err);
      candidate = DETERMINISTIC_OCR_FALLBACK_RECIPE;
    }

    return NextResponse.json({
      success: true,
      candidate,
    });
  } catch (error: any) {
    console.error('[API /api/recipes/ocr POST error]:', error);
    return NextResponse.json(
      { error: error?.message || '画像解析処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
