// ============================================================================
// Kazoku-Kondate API: src/app/api/settings/route.ts
// Handles: GET & PUT for household staple_items and classic_threshold
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import { appSettings, safeJsonParse } from '@/db/schema';
import { DEFAULT_STAPLE_ITEMS } from '@/db/seed';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    await ensureDatabaseInitialized();
    const rows = await db.select().from(appSettings);
    const map = new Map(rows.map((r) => [r.key, r.valueJson]));

    const stapleItems = safeJsonParse<string[]>(
      map.get('staple_items'),
      DEFAULT_STAPLE_ITEMS
    );
    const classicThreshold = safeJsonParse<number>(
      map.get('classic_threshold'),
      5
    );

    return NextResponse.json({
      success: true,
      stapleItems,
      classicThreshold,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();
    const body = await request.json();

    if (Array.isArray(body.stapleItems)) {
      const cleaned = body.stapleItems
        .map((s: unknown) => String(s || '').trim())
        .filter(Boolean);
      await db
        .insert(appSettings)
        .values({ key: 'staple_items', valueJson: JSON.stringify(cleaned) })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { valueJson: JSON.stringify(cleaned) },
        });
    }

    if (body.classicThreshold !== undefined) {
      const num = Math.max(1, Math.min(20, Number(body.classicThreshold) || 5));
      await db
        .insert(appSettings)
        .values({ key: 'classic_threshold', valueJson: JSON.stringify(num) })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { valueJson: JSON.stringify(num) },
        });
    }

    return GET();
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '設定の保存に失敗しました' },
      { status: 500 }
    );
  }
}
