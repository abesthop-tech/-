# Project Plan: kazoku-kondate (Cooking Assistant Web App)

## Overview
Build a high-craft Japanese family cooking assistant web application ("kazoku-kondate" / 家族献立) satisfying requirements R1-R5:
- R1: Multi-person taste & allergy profile management (family members, likes/dislikes, allergies, spice tolerance, portion scale)
- R2: Menu planning engine (balance nutrition, variety, main/side/soup, seasonal ingredients, leftover usage)
- R3: Smart recipe scaling & shopping list aggregator (auto-consolidate ingredients by supermarket section, checklist with strike-through)
- R4: Step-by-step cooking mode (parallel timeline/flow for multiple dishes, timers, large readable step cards)
- R5: High-craft responsive UI adhering to human-crafted-ui principles (warm kitchen aesthetic, no AI slop, mobile & desktop optimized, Japanese typography)

## Execution Phases
1. **Phase 0: Survey & Specification Extraction**
   - Survey agent 1 (spec_miner): Deep dive into design_spec.md and ui_mock.html (UI requirements, typography, color palette, state, transitions)
   - Survey agent 2 (spec_miner): Deep dive into implementation_plan.md and ORIGINAL_REQUEST.md (architectural components, data models, algorithm specs)
   - Survey agent 3 (explorer): Workspace investigation (detect project root layout, dependencies, package managers, tools available)
2. **Phase 1: Architecture & Decomposition (PROJECT.md)**
   - Synthesize feature inventory (every requirement mapped)
   - Define milestones M1-M5 + E2E Testing track
   - Define code layout, tech stack (e.g. Next.js / Vite React + Tailwind / TS), interface contracts
3. **Phase 2: Execution of Milestones**
   - Milestone 1: Core Foundation & Data Store (Family profiles, recipe database, localStorage persistence)
   - Milestone 2: Menu Planning Engine & Variety Balancer
   - Milestone 3: Shopping List Aggregator & Ingredient Scaling
   - Milestone 4: Cooking Mode & Multi-dish Timeline Runner
   - Milestone 5: UI/UX Craft Polish & Responsive Shell (Human-crafted aesthetic, warm palette, animations)
   - E2E Testing Track: Comprehensive test suite (Tiers 1-4)
4. **Phase 3: Final Verification & Adversarial Hardening**
   - 100% E2E test pass (Tiers 1-4)
   - Tier 5 adversarial stress testing & coverage hardening
   - Forensic Integrity Audit
5. **Phase 4: Synthesis & Sentinel Handoff**
