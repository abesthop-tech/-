# 家族の献立・料理支援アプリ (`kazoku-kondate`) 実装ウォークスルー

プロジェクトを `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate` に構築し、本番ビルド（`npm run build`）および単体テスト（230件以上）の通過を確認しました。また、現在 `http://localhost:3000` で開発サーバーを起動しています。

---

## 1. 実装した機能とファイル構成

### ① 画面・UI（Human-Crafted UI 準拠）
- [page.tsx](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/app/page.tsx) / [globals.css](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/app/globals.css)
  - **ライト／ダークモード切替**: Warm Editorial（`#FAF9F6` ベース＋テラコッタ `#C2410C` アクセント）と Atmospheric Dark（`#151821` スモーキーチャコール）を右上ボタンで即座に切り替え可能。
  - **スマホ・PC共通シングルコラム（3段階の優先度配置）**:
    - **Tier 1（最上部・毎日使う主役）**: 日付ナビゲーション（`◀ 10.26 月 ▶`）・人数ステッパー（`1〜8人分`）・3タブ切替（`献立` ｜ `買い物` ｜ `調理工程`）。
    - **Tier 2（下部サブ導線）**: `レシピ帳・追加`（本の写真OCR・信頼サイトURL/検索・手入力）と `カレンダー履歴`（過去の献立一覧とワンタップ修正）。
    - **Tier 3（最下部フッターリンク）**: `Googleカレンダー(.ics)取込・常備品リスト・初期設定`。

### ② コアエンジン＆データベース
- **DBスキーマ & 自動シード**: [schema.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/db/schema.ts) / [index.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/db/index.ts) / [seed.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/db/seed.ts)
  - 初回起動時に自動でSQLiteテーブル（`dishes`, `daily_menus`, `app_settings`）を作成し、定番レシピ・作ってみたいリスト・常備品17種・直近14日分の履歴データを初期投入します。
- **Googleカレンダー（`.ics`）解析・名寄せエンジン**: [ics-parser.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/lib/ics-parser.ts) & [ics-import/route.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/app/api/ics-import/route.ts)
  - 「歯医者」「美容院」等の非料理予定を自動除外し、「豚の生姜焼き、味噌汁」のような複数品目タイトルを分割。
  - 表記ゆれ（「生姜焼き」「しょうが焼き」「豚生姜焼き」等）を名寄せして作成回数を集計し、**5回以上**は「我が家の定番（写真/手入力待ち）」、**1〜4回**は「AI仮レシピ」に自動分類します（設定モーダル内の「サンプル.icsで名寄せ取込を試す」ボタンですぐに体験できます）。
- **献立提案・1品固定＆シャッフルエンジン**: [menu-planner.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/lib/menu-planner.ts) & [menu/route.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/app/api/menu/route.ts)
  - 使いたい食材（例: `大根、豚バラ`）の最優先マッチング、直近14日間の被り回避、前日との肉/魚ローテーションを計算。
  - お祖父様が作ったメイン料理やリクエストがある時は「固定」ボタンを押すことで、残りの副菜・汁物だけを提案・シャッフル（「変更」ボタン）したり、「選択」から直接レシピ帳の料理に差し替えられます。
- **2段構え買い物リスト＆LINE共有**: [shopping-aggregator.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/lib/shopping-aggregator.ts)
  - 人数変更に応じて分量（分数・範囲表記 `2〜3個` 等も対応）を自動換算・合算。
  - 上段「買うもの」と下段「家にあるかも（常備野菜・調味料の残量確認）」に自動分離し、下段のチップ（`＋ 玉ねぎ` 等）をタップすると1タップで上段「買うもの」へ移動します。
  - 「LINE用にコピー」ボタンでLINE共有用の箇条書きテキストを生成・コピー（およびLINEアプリ直接起動リンクを表示）します。
- **複数品の「まとめ工程（並行調理）」スケジューラ & Gemini連携**: [timeline-scheduler.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/lib/timeline-scheduler.ts) / [gemini.ts](file:///C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate/src/lib/gemini.ts)
  - 主菜・副菜・汁物の3品を「①下ごしらえ（まとめて切る・レンジ） → ②副菜と汁物の火入れ → ③主菜の仕上げ」に再構成したまとめ工程と、料理別の個別手順表示をワンタップで切り替えられます。
  - `GEMINI_API_KEY` 未設定時でもオフラインの決定論的エンジンで全機能がそのまま動作し、APIキーを設定すれば Gemini 2.5 Flash による実画像OCR・AI生成に切り替わります。

---

## 2. 起動方法・環境変数（オプション）

現在バックグラウンドで開発サーバーが起動しているため、ブラウザで **`http://localhost:3000`** を開くとすぐに操作できます。

手動で起動する場合：
```powershell
cd C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate
npm run dev
```

実物のレシピ本写真OCRやGemini AI連携・合言葉ロックを有効にする場合は、`C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.env.local` に以下を設定してください：
```env
# Google AI Studio で取得した Gemini API キー（未設定でもフォールバック動作します）
GEMINI_API_KEY=your_gemini_api_key_here

# 家族共通の合言葉（未設定時はパスコード入力なしで開きます）
APP_PASSCODE=your_family_passcode

# クラウドDB (Turso) を使う場合（未設定時はローカルの local.db ファイルに保存されます）
DATABASE_URL=file:local.db
# TURSO_AUTH_TOKEN=...
```
