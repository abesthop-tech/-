'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  ParsedDailyMenu,
  ParsedDish,
  MealSlot,
  ShoppingState,
  ParallelTimelineStep,
} from '@/db/schema';
import {
  promoteStapleToMain,
  demotePromotedStaple,
  toggleShoppingItemChecked,
  formatLineShoppingMemo,
} from '@/lib/shopping-aggregator';

type MainTab = 'menu' | 'shopping' | 'cooking';
type CookingMode = 'timeline' | 'individual';
type DrawerType = null | 'recipes' | 'history' | 'settings';
type RecipeAddTab = 'ocr' | 'url' | 'manual';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateDisplay(yyyyMmDd: string): { shortDate: string; dow: string } {
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return { shortDate: yyyyMmDd, dow: '' };
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(y, m - 1, d);
  const dow = DOW_LABELS[dateObj.getDay()] || '';
  return {
    shortDate: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    dow,
  };
}

function addDaysToDateStr(yyyyMmDd: string, delta: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function getTodayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

const SAMPLE_ICS_DEMO = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260901
SUMMARY:豚の生姜焼き、豆腐の味噌汁
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260905
SUMMARY:しょうが焼き、小松菜の煮浸し
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260910
SUMMARY:歯医者 15:00
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260912
SUMMARY:生姜焼き、ポテサラ
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260918
SUMMARY:豚生姜焼き・なめこの味噌汁
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260925
SUMMARY:ショウガ焼き
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260928
SUMMARY:鮭のちゃんちゃん焼き、ほうれん草のごま和え
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261002
SUMMARY:美容院 カット
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261004
SUMMARY:ロールキャベツ、コーンスープ
END:VEVENT
END:VCALENDAR`;

export default function HomePage() {
  const [todayStr] = useState<string>(() => getTodayStr());
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayStr());
  const [mainTab, setMainTab] = useState<MainTab>('menu');
  const [cookingMode, setCookingMode] = useState<CookingMode>('timeline');
  const [isDark, setIsDark] = useState<boolean>(false);

  // Menu & Catalog State
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [menu, setMenu] = useState<ParsedDailyMenu | null>(null);
  const [servings, setServings] = useState<number>(3);
  const [contextInput, setContextInput] = useState<string>('');
  const [allDishes, setAllDishes] = useState<ParsedDish[]>([]);
  const [selectingSlotRole, setSelectingSlotRole] = useState<'main' | 'side' | 'soup' | null>(null);

  // Shopping & LINE Toast
  const [linePreviewText, setLinePreviewText] = useState<string | null>(null);

  // Drawers (Tier 2 & Tier 3)
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'classic_book' | 'wishlist' | 'ai_generated'>('all');
  const [recipeAddTab, setRecipeAddTab] = useState<RecipeAddTab>('ocr');

  // OCR / URL / Manual Recipe Form States
  const [ocrCandidate, setOcrCandidate] = useState<any | null>(null);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [urlOrQueryInput, setUrlOrQueryInput] = useState<string>('');
  const [asWishlistCheck, setAsWishlistCheck] = useState<boolean>(true);
  const [urlImportLoading, setUrlImportLoading] = useState<boolean>(false);
  const [urlImportMessage, setUrlImportMessage] = useState<string | null>(null);

  const [manualName, setManualName] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<'main' | 'side' | 'soup'>('main');
  const [manualSourceLabel, setManualSourceLabel] = useState<string>('山本ゆりさんレシピ本');
  const [manualIngredientsText, setManualIngredientsText] = useState<string>('豚バラ薄切り 300g\n大根 1/2本');
  const [manualStepsText, setManualStepsText] = useState<string>('材料を切って下ごしらえする。\nフライパンで炒めて調味料で煮絡める。');

  // History & Settings State
  const [historyList, setHistoryList] = useState<ParsedDailyMenu[]>([]);
  const [stapleItemsText, setStapleItemsText] = useState<string>('');
  const [classicThreshold, setClassicThreshold] = useState<number>(5);
  const [icsImportSummary, setIcsImportSummary] = useState<any | null>(null);
  const [icsLoading, setIcsLoading] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Theme Toggle
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextDark);
    }
  };

  // Load All Dishes Catalog
  const fetchDishesCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/recipes?limit=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.dishes)) {
        setAllDishes(data.dishes);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load Menu for Selected Date (auto-propose if not planned yet)
  const fetchMenuForDate = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/menu?date=${encodeURIComponent(targetDate)}&propose=true`);
      const data = await res.json();
      if (data.success && data.menu) {
        setMenu(data.menu);
        setServings(data.menu.servings || 3);
        setContextInput(data.menu.contextMemo || '');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDishesCatalog();
  }, [fetchDishesCatalog]);

  useEffect(() => {
    fetchMenuForDate(selectedDate);
  }, [selectedDate, fetchMenuForDate]);

  // Propose / Re-propose Unlocked Slots
  const handleProposeMenu = async (options?: {
    forceNew?: boolean;
    shuffleRole?: 'main' | 'side' | 'soup';
    overrideDish?: { role: 'main' | 'side' | 'soup'; dishId: string };
    newServings?: number;
  }) => {
    if (!menu) return;
    setSaving(true);
    try {
      const lockedSlots = menu.slots
        .filter((s) => s.locked)
        .map((s) => ({
          role: s.role,
          dishId: s.dishId,
          lockReason: s.lockReason || '固定中',
        }));

      const dishOverrides: Record<string, string> = {};
      if (options?.overrideDish) {
        if (options.overrideDish.role === 'main') dishOverrides.mainId = options.overrideDish.dishId;
        if (options.overrideDish.role === 'side') dishOverrides.sideId = options.overrideDish.dishId;
        if (options.overrideDish.role === 'soup') dishOverrides.soupId = options.overrideDish.dishId;
      }

      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          servings: options?.newServings ?? servings,
          contextMemo: contextInput,
          lockedSlots,
          forceNew: Boolean(options?.forceNew),
          shuffleRole: options?.shuffleRole,
          dishOverrides: Object.keys(dishOverrides).length > 0 ? dishOverrides : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.menu) {
        setMenu(data.menu);
        setServings(data.menu.servings);
        setSelectingSlotRole(null);
      }
    } finally {
      setSaving(false);
    }
  };

  // Toggle Lock on a Single Slot
  const handleToggleLock = async (role: 'main' | 'side' | 'soup') => {
    if (!menu) return;
    const nextSlots: MealSlot[] = menu.slots.map((s) =>
      s.role === role
        ? {
            ...s,
            locked: !s.locked,
            lockReason: !s.locked ? '固定中' : undefined,
          }
        : s
    );
    const optimistic = { ...menu, slots: nextSlots };
    setMenu(optimistic);

    await fetch('/api/menu', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate,
        slots: nextSlots,
      }),
    });
  };

  // Change Servings
  const handleChangeServings = async (delta: number) => {
    const nextServings = Math.max(1, Math.min(8, servings + delta));
    if (nextServings === servings) return;
    setServings(nextServings);
    await handleProposeMenu({ newServings: nextServings });
  };

  // Shopping List Actions
  const updateShoppingState = async (nextShopping: ShoppingState) => {
    if (!menu) return;
    setMenu({ ...menu, shoppingState: nextShopping });
    await fetch('/api/menu', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate,
        shoppingState: nextShopping,
      }),
    });
  };

  const handleToggleShopItem = (itemId: number) => {
    if (!menu?.shoppingState) return;
    const next = toggleShoppingItemChecked(menu.shoppingState, itemId);
    updateShoppingState(next);
  };

  const handlePromoteStaple = (stapleId: number) => {
    if (!menu?.shoppingState) return;
    const next = promoteStapleToMain(menu.shoppingState, stapleId);
    updateShoppingState(next);
  };

  const handleDemoteStaple = (mainItemId: number) => {
    if (!menu?.shoppingState) return;
    const next = demotePromotedStaple(menu.shoppingState, mainItemId);
    updateShoppingState(next);
  };

  const handleCopyForLine = async () => {
    const items = menu?.shoppingState?.mainItems || [];
    const text = formatLineShoppingMemo(items, selectedDate);
    setLinePreviewText(text);
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Fallback preview box is shown regardless
    }
  };

  // Toggle Cooking Timeline Step
  const handleToggleTimelineStep = (stepNumber: number) => {
    if (!menu?.parallelSteps) return;
    const nextSteps: ParallelTimelineStep[] = menu.parallelSteps.map((st) =>
      st.stepNumber === stepNumber ? { ...st, done: !st.done } : st
    );
    setMenu({ ...menu, parallelSteps: nextSteps });
  };

  // Open Drawers
  const handleOpenDrawer = async (drawer: DrawerType) => {
    setActiveDrawer(drawer);
    setStatusNotice(null);
    if (drawer === 'recipes') {
      await fetchDishesCatalog();
    } else if (drawer === 'history') {
      try {
        const res = await fetch('/api/history?limit=30');
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setHistoryList(data.history);
        }
      } catch {
        // ignore
      }
    } else if (drawer === 'settings') {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
          setStapleItemsText((data.stapleItems || []).join('、'));
          setClassicThreshold(data.classicThreshold || 5);
        }
      } catch {
        // ignore
      }
    }
  };

  // Recipe Addition 1: Photo OCR
  const handlePhotoUpload = async (file?: File) => {
    setOcrLoading(true);
    setStatusNotice(null);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        res = await fetch('/api/recipes/ocr', { method: 'POST', body: fd });
      } else {
        // Sample photo OCR test
        res = await fetch('/api/recipes/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: 'c2FtcGxlX3JlY2lwZV9ib29rX2ltYWdl' }),
        });
      }
      const data = await res.json();
      if (data.success && data.candidate) {
        setOcrCandidate(data.candidate);
      }
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSaveOcrCandidate = async () => {
    if (!ocrCandidate) return;
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ocrCandidate.name,
        category: ocrCandidate.category || 'main',
        proteinType: ocrCandidate.proteinType || 'pork',
        sourceType: 'classic_book',
        sourceLabel: '山本ゆりさんレシピ本 (写真OCR)',
        recipeStatus: 'confirmed',
        baseServings: ocrCandidate.baseServings || 3,
        ingredients: ocrCandidate.ingredients,
        steps: ocrCandidate.steps,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setOcrCandidate(null);
      setStatusNotice(`「${data.dish.name}」をレシピ帳に登録しました`);
      await fetchDishesCatalog();
    }
  };

  // Recipe Addition 2: Trusted URL or Keyword
  const handleImportUrlOrQuery = async () => {
    if (!urlOrQueryInput.trim()) return;
    setUrlImportLoading(true);
    setUrlImportMessage(null);
    try {
      const trimmed = urlOrQueryInput.trim();
      const isUrl = /^https?:\/\//i.test(trimmed);
      const res = await fetch('/api/recipes/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: isUrl ? trimmed : undefined,
          query: !isUrl ? trimmed : undefined,
          asWishlist: asWishlistCheck,
          save: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.dish) {
        setUrlOrQueryInput('');
        setUrlImportMessage(`「${data.dish.name}」（${data.sourceLabel}）を追加しました`);
        await fetchDishesCatalog();
      } else {
        setUrlImportMessage(data.error || '取り込みに失敗しました');
      }
    } finally {
      setUrlImportLoading(false);
    }
  };

  // Recipe Addition 3: Manual Entry
  const handleSaveManualRecipe = async () => {
    if (!manualName.trim()) return;
    const ingredients = manualIngredientsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          name: parts[0] || line,
          amount: parts.slice(1).join(' ') || '適量',
          isStaple: false,
        };
      });

    const steps = manualStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manualName.trim(),
        category: manualCategory,
        sourceType: 'classic_book',
        sourceLabel: manualSourceLabel.trim() || '家庭のレシピ',
        recipeStatus: 'confirmed',
        baseServings: 3,
        ingredients: ingredients.length > 0 ? ingredients : [{ name: manualName.trim(), amount: '適量', isStaple: false }],
        steps: steps.length > 0 ? steps : ['材料を切って調理する。'],
      }),
    });
    const data = await res.json();
    if (data.success) {
      setManualName('');
      setStatusNotice(`「${data.dish.name}」を手入力登録しました`);
      await fetchDishesCatalog();
    }
  };

  // ICS Import Action
  const handleIcsImport = async (icsText: string) => {
    setIcsLoading(true);
    setIcsImportSummary(null);
    try {
      const res = await fetch('/api/ics-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          icsContent: icsText,
          classicThreshold,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIcsImportSummary(data.summary);
        await fetchDishesCatalog();
      } else {
        setStatusNotice(data.error || 'ICS取り込みに失敗しました');
      }
    } finally {
      setIcsLoading(false);
    }
  };

  // Save Settings Action
  const handleSaveSettings = async () => {
    const list = stapleItemsText
      .split(/[、,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stapleItems: list,
        classicThreshold,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setStatusNotice('常備品リストと定番判定しきい値を保存しました');
    }
  };

  const { shortDate, dow } = formatDateDisplay(selectedDate);
  const isToday = selectedDate === todayStr;
  const remainingShopCount =
    menu?.shoppingState?.mainItems?.filter((i) => !i.checked).length ?? 0;

  const filteredDishes = allDishes.filter((d) =>
    recipeFilter === 'all' ? true : d.sourceType === recipeFilter
  );

  const classicCount = allDishes.filter((d) => d.sourceType === 'classic_book').length;
  const wishlistCount = allDishes.filter((d) => d.sourceType === 'wishlist').length;

  return (
    <div className="min-h-screen pb-16 relative">
      {/* Watermark Date Typography (Spatial Atmosphere) */}
      <div
        aria-hidden="true"
        className="fixed top-10 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-none select-none z-0 flex justify-end overflow-hidden"
      >
        <span
          className="text-[112px] font-bold tracking-tighter leading-none tabular"
          style={{ color: 'var(--watermark-color)' }}
        >
          {shortDate}
        </span>
      </div>

      {/* Top Subtle Utility Bar (App Title & Theme Toggle) */}
      <div
        className="sticky top-0 z-30 border-b px-4 py-2 text-xs flex items-center justify-between"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            家族の献立帳
          </span>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="px-2 py-0.5 rounded text-xs font-medium subtle-box"
              style={{ color: 'var(--accent-primary)' }}
            >
              今日へ戻る
            </button>
          )}
        </div>
        <button
          onClick={toggleTheme}
          className="px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5"
          style={{
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
            />
          </svg>
          <span>{isDark ? 'ライト表示' : 'ダーク表示'}</span>
        </button>
      </div>

      {/* Single-Column Container (Consistent across Smartphone and PC) */}
      <main className="relative z-10 mx-auto w-full max-w-xl px-3.5 pt-5">
        {/* TIER 1 HEADER: Date Navigation & Servings Stepper */}
        <header className="flex items-baseline justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedDate((prev) => addDaysToDateStr(prev, -1))}
              className="p-1.5 rounded-md btn-ghost"
              aria-label="前日"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold tracking-tight tabular palt">{shortDate}</h1>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {dow}
              </span>
              {isToday && (
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  今日
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedDate((prev) => addDaysToDateStr(prev, 1))}
              className="p-1.5 rounded-md btn-ghost"
              aria-label="翌日"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleChangeServings(-1)}
              className="w-7 h-7 rounded-md btn-secondary flex items-center justify-center text-sm font-medium"
              aria-label="人数を減らす"
            >
              −
            </button>
            <span className="text-sm font-semibold tabular px-1">{servings}人分</span>
            <button
              onClick={() => handleChangeServings(1)}
              className="w-7 h-7 rounded-md btn-secondary flex items-center justify-center text-sm font-medium"
              aria-label="人数を増やす"
            >
              ＋
            </button>
          </div>
        </header>

        {/* TIER 1 PRIMARY NAVIGATION: 献立 | 買い物 | 調理工程 */}
        <nav
          className="p-1 rounded-lg subtle-box grid grid-cols-3 gap-1 mb-4"
          style={{ border: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={() => setMainTab('menu')}
            className={`py-2 text-sm rounded-md transition-all ${
              mainTab === 'menu' ? 'surface-sheet font-semibold' : 'font-medium'
            }`}
            style={{
              color: mainTab === 'menu' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            献立
          </button>
          <button
            onClick={() => setMainTab('shopping')}
            className={`py-2 text-sm rounded-md transition-all tabular ${
              mainTab === 'shopping' ? 'surface-sheet font-semibold' : 'font-medium'
            }`}
            style={{
              color: mainTab === 'shopping' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            買い物 <span className="ml-0.5 text-xs">({remainingShopCount})</span>
          </button>
          <button
            onClick={() => setMainTab('cooking')}
            className={`py-2 text-sm rounded-md transition-all ${
              mainTab === 'cooking' ? 'surface-sheet font-semibold' : 'font-medium'
            }`}
            style={{
              color: mainTab === 'cooking' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            調理工程
          </button>
        </nav>

        {/* ============================================================
            VIEW 1: 献立 (MENU VIEW)
            ============================================================ */}
        {mainTab === 'menu' && (
          <section className="space-y-4">
            {/* Context Input Bar (Leftover Ingredients / Requests) */}
            <div className="surface-sheet rounded-lg p-3.5 space-y-3">
              <div>
                <label
                  htmlFor="context-input"
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  使いたい食材・今日の要望
                </label>
                <div className="flex gap-2">
                  <input
                    id="context-input"
                    type="text"
                    value={contextInput}
                    onChange={(e) => setContextInput(e.target.value)}
                    placeholder="例：大根、豚バラ、さっぱり、魚"
                    className="input-field w-full rounded-md px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => handleProposeMenu()}
                    disabled={saving}
                    className="btn-primary shrink-0 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    {saving ? '計算中' : '提案する'}
                  </button>
                </div>
              </div>
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>直近14日の履歴と前日の主菜バランスを考慮</span>
                <button
                  onClick={() => handleProposeMenu({ forceNew: true })}
                  className="font-medium underline underline-offset-2 hover:opacity-80"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  ＋ 新レシピを1品混ぜる
                </button>
              </div>
            </div>

            {/* 3-Slot Dish List (1px Divider List - No Nested Cards) */}
            <div className="surface-sheet rounded-lg divider-y overflow-hidden">
              {loading || !menu ? (
                <div className="p-6 space-y-3">
                  <div className="h-4 w-1/3 subtle-box rounded animate-pulse" />
                  <div className="h-5 w-2/3 subtle-box rounded animate-pulse" />
                  <div className="h-4 w-1/2 subtle-box rounded animate-pulse" />
                </div>
              ) : (
                menu.slots.map((slot) => {
                  const roleLabel =
                    slot.role === 'main' ? '主菜' : slot.role === 'side' ? '副菜' : '汁物';
                  const isNewChallenge = slot.badge === '新レシピ挑戦';
                  const isSelectingThis = selectingSlotRole === slot.role;

                  return (
                    <div key={slot.role} className="p-4 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div
                            className="flex flex-wrap items-center gap-1.5 text-xs tabular"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <span
                              className="font-semibold"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {roleLabel}
                            </span>
                            <span>·</span>
                            <span>{slot.sourceLabel || '家庭の定番'}</span>
                            {slot.badge && (
                              <>
                                <span>·</span>
                                <span
                                  style={
                                    isNewChallenge
                                      ? { color: 'var(--accent-primary)', fontWeight: 600 }
                                      : undefined
                                  }
                                >
                                  {slot.badge}
                                </span>
                              </>
                            )}
                          </div>

                          <h3 className="text-base font-semibold leading-snug palt">
                            {slot.dishName}
                          </h3>

                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            主な材料: {(slot.ingredients || []).join('、')}
                          </p>
                        </div>

                        {/* Slot Controls: Lock, Shuffle, Manual Swap */}
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <button
                            onClick={() => handleToggleLock(slot.role)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                              slot.locked ? '' : 'btn-secondary'
                            }`}
                            style={
                              slot.locked
                                ? {
                                    backgroundColor: 'var(--accent-subtle)',
                                    color: 'var(--accent-primary)',
                                    border: '1px solid var(--accent-primary)',
                                  }
                                : undefined
                            }
                            title="お祖父様の担当やリクエスト時に固定"
                          >
                            {slot.locked ? '固定中' : '固定'}
                          </button>

                          <button
                            onClick={() => handleProposeMenu({ shuffleRole: slot.role })}
                            disabled={slot.locked || saving}
                            className="px-2.5 py-1 rounded-md text-xs font-medium btn-secondary flex items-center gap-1 disabled:opacity-40"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                              />
                            </svg>
                            <span>変更</span>
                          </button>

                          <button
                            onClick={() =>
                              setSelectingSlotRole(isSelectingThis ? null : slot.role)
                            }
                            className="px-2 py-1 rounded-md text-xs btn-ghost"
                            title="レシピ帳から直接選ぶ"
                          >
                            選択
                          </button>
                        </div>
                      </div>

                      {/* Manual Dish Selector Dropdown for Grandfather / Family Request */}
                      {isSelectingThis && (
                        <div
                          className="mt-3 pt-3 flex items-center gap-2"
                          style={{ borderTop: '1px solid var(--border-subtle)' }}
                        >
                          <select
                            className="input-field text-xs rounded-md px-2.5 py-1.5 flex-1"
                            defaultValue={slot.dishId}
                            onChange={(e) => {
                              if (e.target.value) {
                                handleProposeMenu({
                                  overrideDish: { role: slot.role, dishId: e.target.value },
                                });
                              }
                            }}
                          >
                            <option value="">差し替える料理を選択...</option>
                            {allDishes
                              .filter((d) => d.category === slot.role || d.category === 'other')
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}（{d.sourceLabel || '定番'}）
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() => setSelectingSlotRole(null)}
                            className="text-xs px-2 py-1 btn-ghost rounded"
                          >
                            閉じる
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                献立の変更は自動でカレンダー履歴に記録されます
              </span>
              <button
                onClick={() => setMainTab('shopping')}
                className="btn-secondary px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1"
              >
                <span>買い物リストへ</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </section>
        )}

        {/* ============================================================
            VIEW 2: 買い物 (2-STAGE SHOPPING LIST)
            ============================================================ */}
        {mainTab === 'shopping' && (
          <section className="space-y-4">
            {/* Stage 1: Main Shopping List (買うもの) */}
            <div className="surface-sheet rounded-lg overflow-hidden">
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold">買うもの</h2>
                  <span className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                    残り {remainingShopCount}点
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyForLine}
                    className="btn-primary px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  >
                    LINE用にコピー
                  </button>
                </div>
              </div>

              <div className="divider-y">
                {!menu?.shoppingState?.mainItems?.length ? (
                  <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    買うものはありません
                  </div>
                ) : (
                  menu.shoppingState.mainItems.map((item) => (
                    <div
                      key={item.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => handleToggleShopItem(item.id)}
                          className="w-4 h-4 rounded accent-[#C2410C]"
                        />
                        <span
                          className={`text-sm font-medium ${
                            item.checked ? 'line-through opacity-45' : ''
                          }`}
                        >
                          {item.name}
                        </span>
                      </label>
                      <div
                        className="flex items-center gap-2 shrink-0 text-xs tabular"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span
                          className="font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {item.amount}
                        </span>
                        <span>·</span>
                        <span>{item.dishRole}</span>
                        {item.promotedFromStaple && (
                          <button
                            onClick={() => handleDemoteStaple(item.id)}
                            className="underline ml-1"
                            title="確認枠へ戻す"
                          >
                            戻す
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Stage 2: Household Staples Check (家にあるかも？確認枠) */}
            <div className="surface-sheet rounded-lg overflow-hidden">
              <div
                className="px-4 py-2.5 subtle-box flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <h3
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  家にあるかも（常備野菜・調味料の残量確認）
                </h3>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  タップで「買うもの」へ追加
                </span>
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {!menu?.shoppingState?.stapleItems?.length ? (
                  <span className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>
                    確認対象の常備品はすべて追加済みです
                  </span>
                ) : (
                  menu.shoppingState.stapleItems.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => handlePromoteStaple(st.id)}
                      className="btn-secondary px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>＋ {st.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* LINE Copy Preview Box */}
            {linePreviewText && (
              <div
                className="surface-sheet rounded-lg p-3.5 text-xs space-y-2"
                style={{ borderColor: 'var(--accent-primary)' }}
              >
                <div
                  className="flex items-center justify-between font-semibold"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <span>クリップボードにコピーしました（LINE共有テキスト）</span>
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://line.me/R/share?text=${encodeURIComponent(linePreviewText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      LINEアプリで開く
                    </a>
                    <button
                      onClick={() => setLinePreviewText(null)}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      閉じる
                    </button>
                  </div>
                </div>
                <pre
                  className="whitespace-pre-wrap font-sans leading-relaxed pt-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {linePreviewText}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* ============================================================
            VIEW 3: 調理工程 (PARALLEL TIMELINE & INDIVIDUAL RECIPES)
            ============================================================ */}
        {mainTab === 'cooking' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div
                className="inline-flex rounded-md p-0.5 subtle-box"
                style={{ border: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={() => setCookingMode('timeline')}
                  className={`px-3 py-1 text-xs rounded ${
                    cookingMode === 'timeline' ? 'surface-sheet font-semibold' : 'font-medium'
                  }`}
                  style={{
                    color:
                      cookingMode === 'timeline'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                  }}
                >
                  まとめ工程（3品並行）
                </button>
                <button
                  onClick={() => setCookingMode('individual')}
                  className={`px-3 py-1 text-xs rounded ${
                    cookingMode === 'individual' ? 'surface-sheet font-semibold' : 'font-medium'
                  }`}
                  style={{
                    color:
                      cookingMode === 'individual'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                  }}
                >
                  料理別に見る
                </button>
              </div>
              <span className="text-xs font-medium tabular" style={{ color: 'var(--text-secondary)' }}>
                {servings}人分
              </span>
            </div>

            {cookingMode === 'timeline' ? (
              <div className="surface-sheet rounded-lg divider-y overflow-hidden">
                {(menu?.parallelSteps || []).map((step) => (
                  <div
                    key={step.stepNumber}
                    onClick={() => handleToggleTimelineStep(step.stepNumber)}
                    className="p-4 flex items-start gap-3.5 cursor-pointer select-none"
                  >
                    <div
                      className="mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-xs font-bold tabular"
                      style={
                        step.done
                          ? {
                              backgroundColor: 'var(--accent-primary)',
                              borderColor: 'var(--accent-primary)',
                              color: '#FFFFFF',
                            }
                          : {
                              borderColor: 'var(--border-strong)',
                              color: 'var(--text-secondary)',
                            }
                      }
                    >
                      {step.done ? '✓' : step.stepNumber}
                    </div>
                    <div
                      className={`space-y-1 flex-1 min-w-0 ${
                        step.done ? 'opacity-45 line-through' : ''
                      }`}
                    >
                      <div
                        className="flex items-center justify-between gap-2 text-xs tabular"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {step.phase}
                        </span>
                        <span>
                          {step.timeWindow} · {step.dishTag}
                        </span>
                      </div>
                      <p
                        className="text-sm leading-relaxed max-w-[65ch]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {step.instruction}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="surface-sheet rounded-lg divider-y overflow-hidden">
                {(menu?.slots || []).map((slot) => {
                  const roleLabel =
                    slot.role === 'main' ? '主菜' : slot.role === 'side' ? '副菜' : '汁物';
                  return (
                    <div key={slot.role} className="p-4 space-y-2.5">
                      <div className="flex items-baseline justify-between">
                        <h3 className="text-sm font-semibold">
                          {roleLabel}：{slot.dishName}
                        </h3>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {slot.sourceLabel || '家庭の定番'}
                        </span>
                      </div>
                      <div
                        className="text-xs px-3 py-2 rounded-md subtle-box"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        材料（{servings}人分）：{(slot.ingredients || []).join(' ／ ')}
                      </div>
                      <ol
                        className="space-y-1.5 text-sm leading-relaxed list-decimal list-inside max-w-[65ch]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {(slot.steps || []).map((st, idx) => (
                          <li key={idx}>{st}</li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================
            TIER 2: SUBDUED SECONDARY NAVIGATION
            (レシピ帳・追加 / カレンダー履歴)
            ============================================================ */}
        <section
          className="mt-8 pt-5"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => handleOpenDrawer('recipes')}
              className="btn-secondary rounded-lg p-3 text-left transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-semibold">レシピ帳・追加</div>
                <div className="text-xs mt-0.5 tabular" style={{ color: 'var(--text-muted)' }}>
                  定番 {classicCount} · 作ってみたい {wishlistCount}
                </div>
              </div>
              <svg
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            <button
              onClick={() => handleOpenDrawer('history')}
              className="btn-secondary rounded-lg p-3 text-left transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-semibold">カレンダー履歴</div>
                <div className="text-xs mt-0.5 tabular" style={{ color: 'var(--text-muted)' }}>
                  過去の献立を振り返る
                </div>
              </div>
              <svg
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </section>

        {/* ============================================================
            TIER 3: UNOBTRUSIVE FOOTER SETTINGS
            (Googleカレンダー取込 / 常備品設定)
            ============================================================ */}
        <footer className="mt-6 text-center">
          <button
            onClick={() => handleOpenDrawer('settings')}
            className="text-xs underline underline-offset-4 py-2 transition-opacity hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            Googleカレンダー(.ics)取込・常備品リスト・初期設定
          </button>
        </footer>
      </main>

      {/* ============================================================
          MODAL / DRAWER OVERLAY (Tier 2 & Tier 3)
          ============================================================ */}
      {activeDrawer && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="surface-sheet w-full max-w-lg rounded-t-xl sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <h2 className="text-base font-semibold">
                {activeDrawer === 'recipes' && 'レシピ帳・作ってみたいリスト'}
                {activeDrawer === 'history' && 'カレンダー履歴（作成記録）'}
                {activeDrawer === 'settings' && 'Googleカレンダー(.ics)取込・常備品設定'}
              </h2>
              <button
                onClick={() => setActiveDrawer(null)}
                className="px-2.5 py-1 rounded-md btn-ghost text-xs font-medium"
              >
                閉じる
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-sm">
              {statusNotice && (
                <div
                  className="p-3 rounded-md text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {statusNotice}
                </div>
              )}

              {/* DRAWER 1: RECIPES & ADDITION */}
              {activeDrawer === 'recipes' && (
                <div className="space-y-4">
                  {/* 3 Easy Recipe Addition Tabs */}
                  <div className="p-3.5 rounded-lg subtle-box space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        かんたんレシピ追加
                      </span>
                      <div className="flex gap-1">
                        {(
                          [
                            ['ocr', '本の写真OCR'],
                            ['url', '信頼サイトURL/検索'],
                            ['manual', '手入力'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setRecipeAddTab(key)}
                            className={`px-2.5 py-1 rounded text-xs font-medium ${
                              recipeAddTab === key ? 'surface-sheet font-semibold' : ''
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {recipeAddTab === 'ocr' && (
                      <div className="space-y-2.5 text-xs">
                        <p style={{ color: 'var(--text-secondary)' }}>
                          山本ゆりさんのレシピ本などのページを撮影すると、料理名・材料・手順を自動で読み取ります。
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="btn-secondary px-3 py-1.5 rounded-md cursor-pointer font-medium">
                            <span>写真ファイルを選択</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handlePhotoUpload(f);
                              }}
                            />
                          </label>
                          <button
                            onClick={() => handlePhotoUpload()}
                            disabled={ocrLoading}
                            className="btn-primary px-3 py-1.5 rounded-md font-medium"
                          >
                            {ocrLoading ? '読み取り中...' : 'サンプル写真でOCRを試す'}
                          </button>
                        </div>

                        {ocrCandidate && (
                          <div className="surface-sheet rounded-md p-3 space-y-2">
                            <div className="font-semibold text-sm">{ocrCandidate.name}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              材料:{' '}
                              {(ocrCandidate.ingredients || [])
                                .map((i: any) => `${i.name} ${i.amount}`)
                                .join('、')}
                            </div>
                            <button
                              onClick={handleSaveOcrCandidate}
                              className="btn-primary px-3 py-1.5 rounded-md text-xs font-medium"
                            >
                              この内容でレシピ帳に保存
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {recipeAddTab === 'url' && (
                      <div className="space-y-2.5 text-xs">
                        <p style={{ color: 'var(--text-secondary)' }}>
                          白ごはん.com・クラシル・きょうの料理・Nadia・山本ゆりさんブログ等のURLまたは料理名から取り込みます。
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={urlOrQueryInput}
                            onChange={(e) => setUrlOrQueryInput(e.target.value)}
                            placeholder="URL または 料理名（例：肉じゃが）"
                            className="input-field w-full rounded-md px-2.5 py-1.5 text-xs"
                          />
                          <button
                            onClick={handleImportUrlOrQuery}
                            disabled={urlImportLoading}
                            className="btn-primary shrink-0 px-3 py-1.5 rounded-md font-medium"
                          >
                            {urlImportLoading ? '取得中' : '取り込む'}
                          </button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={asWishlistCheck}
                            onChange={(e) => setAsWishlistCheck(e.target.checked)}
                            className="rounded accent-[#C2410C]"
                          />
                          <span>「作ってみたいリスト」としてストックする</span>
                        </label>
                        {urlImportMessage && (
                          <div className="font-medium" style={{ color: 'var(--accent-primary)' }}>
                            {urlImportMessage}
                          </div>
                        )}
                      </div>
                    )}

                    {recipeAddTab === 'manual' && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            placeholder="料理名"
                            className="input-field col-span-2 rounded-md px-2.5 py-1.5"
                          />
                          <select
                            value={manualCategory}
                            onChange={(e) => setManualCategory(e.target.value as any)}
                            className="input-field rounded-md px-2 py-1.5"
                          >
                            <option value="main">主菜</option>
                            <option value="side">副菜</option>
                            <option value="soup">汁物</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={manualSourceLabel}
                          onChange={(e) => setManualSourceLabel(e.target.value)}
                          placeholder="出典メモ（例：山本ゆりさん本 p.42）"
                          className="input-field w-full rounded-md px-2.5 py-1.5"
                        />
                        <textarea
                          rows={2}
                          value={manualIngredientsText}
                          onChange={(e) => setManualIngredientsText(e.target.value)}
                          placeholder="材料（1行に1つ：豚バラ 300g）"
                          className="input-field w-full rounded-md px-2.5 py-1.5"
                        />
                        <textarea
                          rows={2}
                          value={manualStepsText}
                          onChange={(e) => setManualStepsText(e.target.value)}
                          placeholder="手順（1行に1ステップ）"
                          className="input-field w-full rounded-md px-2.5 py-1.5"
                        />
                        <button
                          onClick={handleSaveManualRecipe}
                          className="btn-primary px-3 py-1.5 rounded-md font-medium"
                        >
                          レシピを登録する
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filter Tabs for Recipe Catalog */}
                  <div className="flex items-center gap-1.5 text-xs">
                    {(
                      [
                        ['all', `すべて (${allDishes.length})`],
                        ['classic_book', `我が家の定番 (${classicCount})`],
                        ['wishlist', `作ってみたい (${wishlistCount})`],
                        ['ai_generated', 'AI仮レシピ'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setRecipeFilter(key)}
                        className={`px-2.5 py-1 rounded-md font-medium ${
                          recipeFilter === key ? 'btn-primary' : 'btn-secondary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Recipe Catalog List */}
                  <div className="surface-sheet rounded-lg divider-y">
                    {filteredDishes.map((d) => {
                      const roleSlot: 'main' | 'side' | 'soup' =
                        d.category === 'side'
                          ? 'side'
                          : d.category === 'soup'
                          ? 'soup'
                          : 'main';
                      const roleName =
                        roleSlot === 'main' ? '主菜' : roleSlot === 'side' ? '副菜' : '汁物';
                      return (
                        <div
                          key={d.id}
                          className="p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{d.name}</div>
                            <div
                              className="text-xs tabular"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {roleName} · {d.sourceLabel || '定番'} · 累計{d.cookCount}回
                              {d.recipeStatus === 'needs_registration' && ' · 写真/手入力待ち'}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await handleProposeMenu({
                                overrideDish: { role: roleSlot, dishId: d.id },
                              });
                              setActiveDrawer(null);
                            }}
                            className="btn-secondary shrink-0 px-2.5 py-1 rounded text-xs font-medium"
                          >
                            今日の{roleName}にする
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DRAWER 2: CALENDAR HISTORY */}
              {activeDrawer === 'history' && (
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    確定した献立は自動的に記録されます。日付を選んでいつでも確認・差し替えができます。
                  </p>
                  <div className="surface-sheet rounded-lg divider-y tabular">
                    {historyList.map((item) => {
                      const { shortDate: sd, dow: dw } = formatDateDisplay(item.date);
                      return (
                        <div
                          key={item.date}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {item.date} ({sd} {dw})
                            </div>
                            <div className="text-sm font-medium truncate">
                              {(item.slots || []).map((s) => s.dishName).join(' · ')}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedDate(item.date);
                              setMainTab('menu');
                              setActiveDrawer(null);
                            }}
                            className="btn-secondary shrink-0 px-2.5 py-1 rounded text-xs font-medium"
                          >
                            開く・修正
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DRAWER 3: ICS IMPORT & SETTINGS */}
              {activeDrawer === 'settings' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg subtle-box space-y-2.5">
                    <div className="text-xs font-semibold">
                      1. お母様のGoogleカレンダー (.ics) 初回インポート
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      書き出した .ics ファイルを選択すると、「歯医者・美容院」等の非料理予定を除外し、表記ゆれ（「生姜焼き」「しょうが焼き」等）を名寄せして作成回数を集計します。
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="btn-secondary px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer">
                        <span>.ics ファイルを選択</span>
                        <input
                          type="file"
                          accept=".ics,text/calendar"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const text = await f.text();
                              handleIcsImport(text);
                            }
                          }}
                        />
                      </label>
                      <button
                        onClick={() => handleIcsImport(SAMPLE_ICS_DEMO)}
                        disabled={icsLoading}
                        className="btn-primary px-3 py-1.5 rounded-md text-xs font-medium"
                      >
                        {icsLoading ? '解析中...' : 'サンプル.icsで名寄せ取込を試す'}
                      </button>
                    </div>

                    {icsImportSummary && (
                      <div className="surface-sheet rounded-md p-3 text-xs space-y-1 tabular">
                        <div className="font-semibold" style={{ color: 'var(--accent-primary)' }}>
                          カレンダー取り込み・名寄せ完了
                        </div>
                        <div>
                          全予定 {icsImportSummary.totalEvents}件 → 料理イベント{' '}
                          {icsImportSummary.mealEventsFound}件（非料理除外{' '}
                          {icsImportSummary.nonMealCount}件）
                        </div>
                        <div>
                          名寄せ後のユニーク料理数: {icsImportSummary.uniqueDishes}品（定番{' '}
                          {icsImportSummary.classicsCount}品 ／ AI仮レシピ{' '}
                          {icsImportSummary.aiProvisionalCount}品）
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="surface-sheet rounded-lg p-3.5 space-y-2.5 text-xs">
                    <div className="font-semibold">
                      2. 定番判定の回数しきい値（現在: {classicThreshold}回以上）
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={classicThreshold}
                        onChange={(e) => setClassicThreshold(Number(e.target.value) || 5)}
                        className="input-field w-20 rounded-md px-2.5 py-1 tabular"
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        回以上作った料理を「我が家の定番（本の写真・手入力枠）」に分類
                      </span>
                    </div>
                  </div>

                  <div className="surface-sheet rounded-lg p-3.5 space-y-2.5 text-xs">
                    <div className="font-semibold">
                      3. 「家にあるかも（常備品確認枠）」対象アイテム
                    </div>
                    <textarea
                      rows={3}
                      value={stapleItemsText}
                      onChange={(e) => setStapleItemsText(e.target.value)}
                      className="input-field w-full rounded-md px-2.5 py-1.5 leading-relaxed"
                    />
                    <button
                      onClick={handleSaveSettings}
                      className="btn-primary px-3 py-1.5 rounded-md font-medium"
                    >
                      設定を保存する
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
