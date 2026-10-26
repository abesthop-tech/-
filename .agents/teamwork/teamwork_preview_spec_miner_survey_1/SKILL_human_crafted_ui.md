# Human-Crafted UI Design Skill (`human-crafted-ui`) - Local Copy for Spec Miner

This is a local reference copy of `C:\Users\HCP4\.gemini\config\skills\human-crafted-ui\SKILL.md`.

## Core Methodology Summary
1. Eliminates AI Slop:
   - No purple/indigo neon gradients
   - No nested rounded cards with heavy drop shadows (use 1px dividers `divide-y`, whitespace, subtle border `border-stone-200/80`)
   - No over-explaining or bilingual slop (`THU / 木`, `COST ¥1500 (材料代)` - eliminate obvious labels, keep concise)
   - No sterile voids (use Warm Editorial palette, watermark typography, soft ambient glow, subtle textures)
2. Warm Editorial Tone:
   - Canvas: `#FAF9F6`
   - Surface: `#FFFFFF`
   - Border: `#E6E4DD`
   - Text Primary: `#1C1917` (Stone-900)
   - Text Muted: `#78716C`
   - Accent Primary: `#0F766E` / Warm Terracotta / Forest Green (single accent)
3. Japanese Typography & Spatial Discipline:
   - Font stack: Inter, -apple-system, BlinkMacSystemFont, Hiragino Kaku Gothic ProN, Hiragino Sans, BIZ UDPGothic, Noto Sans JP, sans-serif
   - Leading: H1 (1.35 snug), Body (1.75 relaxed)
   - Max width: 60-65ch
   - Tabular numerals: `tabular-nums`
   - `font-feature-settings: "palt" 1` for headings/labels
4. Shadcn/ui & Tailwind batching, DRY array loops, single-pass implementation.
