// ============================================================================
// Kazoku-Kondate API: src/app/api/ics-import/route.ts
// Handles: POST (parse Google Calendar .ics file, classify frequencies, and persist)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import {
  dishes,
  dailyMenus,
  appSettings,
  parseDish,
  dishToInsert,
  dailyMenuToInsert,
  safeJsonParse,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { parseIcsCalendar } from '@/lib/ics-parser';

async function getClassicThreshold(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'classic_threshold'));
    if (rows.length > 0) {
      const val = safeJsonParse<number>(rows[0].valueJson, 5);
      if (typeof val === 'number' && val >= 1) return val;
    }
  } catch {
    // fallback
  }
  return 5;
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    const contentType = request.headers.get('content-type') || '';
    let icsContent = '';
    let customThreshold: number | undefined;

    if (contentType.includes('multipart/form-data')) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { error: 'フォームデータの解析に失敗しました' },
          { status: 400 }
        );
      }

      const fileEntry = formData.get('file') || formData.get('icsFile');
      if (fileEntry && typeof (fileEntry as any).text === 'function') {
        icsContent = await (fileEntry as File).text();
      } else {
        const rawText = formData.get('icsContent');
        if (typeof rawText === 'string') {
          icsContent = rawText;
        }
      }

      const thParam = formData.get('classicThreshold');
      if (thParam !== null && thParam !== '') {
        const parsedTh = Number(thParam);
        if (!isNaN(parsedTh) && parsedTh >= 1) {
          customThreshold = Math.round(parsedTh);
        }
      }
    } else {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'リクエストボディが不正なJSONです' },
          { status: 400 }
        );
      }

      if (body && typeof body === 'object') {
        if (typeof body.icsContent === 'string') {
          icsContent = body.icsContent;
        }
        if (body.classicThreshold !== undefined) {
          const parsedTh = Number(body.classicThreshold);
          if (!isNaN(parsedTh) && parsedTh >= 1) {
            customThreshold = Math.round(parsedTh);
          }
        }
      }
    }

    if (!icsContent || !icsContent.trim()) {
      return NextResponse.json(
        { error: 'ICSデータ (icsContent または .ics ファイル) が空です' },
        { status: 400 }
      );
    }

    if (!icsContent.includes('BEGIN:VCALENDAR') && !icsContent.includes('BEGIN:VEVENT')) {
      return NextResponse.json(
        { error: '有効な iCalendar (.ics) 形式ではありません' },
        { status: 400 }
      );
    }

    const classicThreshold = customThreshold ?? (await getClassicThreshold());

    // Fetch existing dishes to harmonize canonical names
    const existingRows = await db.select().from(dishes);
    const knownDishes = existingRows.map(parseDish);

    // Run RFC 5545 parsing, non-meal filtering, splitting, alias normalization & frequency classification
    const importResult = parseIcsCalendar(icsContent, {
      classicThreshold,
      knownDishes,
      defaultServings: 3,
    });

    // Upsert dishes into database
    for (const d of importResult.dishes) {
      const insertObj = dishToInsert(d);
      await db
        .insert(dishes)
        .values(insertObj)
        .onConflictDoUpdate({
          target: dishes.id,
          set: {
            aliasesJson: insertObj.aliasesJson,
            cookCount: insertObj.cookCount,
            lastCookedDate: insertObj.lastCookedDate,
            sourceType: insertObj.sourceType,
            recipeStatus: insertObj.recipeStatus,
          },
        });
    }

    // Upsert dailyMenus history into database
    for (const m of importResult.dailyMenus) {
      const menuObj = dailyMenuToInsert(m);
      await db
        .insert(dailyMenus)
        .values(menuObj)
        .onConflictDoUpdate({
          target: dailyMenus.date,
          set: {
            slotsJson: menuObj.slotsJson,
            updatedAt: menuObj.updatedAt,
          },
        });
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalEvents: importResult.totalEvents,
        mealEventsFound: importResult.mealEventsFound,
        nonMealCount: importResult.nonMealCount,
        uniqueDishes: importResult.uniqueDishes,
        classicsCount: importResult.classicsCount,
        aiProvisionalCount: importResult.aiProvisionalCount,
        dateRange: importResult.dateRange,
        classicThreshold,
      },
      dishes: importResult.dishes,
      dailyMenus: importResult.dailyMenus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ICSカレンダーの取り込み中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
