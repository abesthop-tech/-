// ============================================================================
// Kazoku-Kondate API: src/app/api/history/route.ts
// Handles: GET (list recent dailyMenus history sorted by date DESC)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import { dailyMenus, parseDailyMenu } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 30)) : 30;

    const rows = await db
      .select()
      .from(dailyMenus)
      .orderBy(desc(dailyMenus.date))
      .limit(limit);

    return NextResponse.json({
      success: true,
      history: rows.map(parseDailyMenu),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}
