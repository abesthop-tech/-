# E2E Test Infra: kazoku-kondate (家族献立)

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md`, `design_spec.md`, and `implementation_plan.md`. No dependency on internal module private methods.
- **Methodology**: Systematic 4-Tier Approach (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial Testing, Real-World Workload Scenarios).
- **Offline & CI Resilient**: Automated tests run via `vitest` with zero dependency on external paid API credentials (deterministic mock fallback verified).

## Feature Inventory & Test Mapping

| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Real-World) |
|---|---------|-------------|:-----------------:|:-----------------:|:-----------------:|:-------------------:|
| 1 | Date Navigation & Stepper | R1 | 5 cases | 5 cases | ✓ | ✓ |
| 2 | Servings Stepper [1..8] | R1 | 5 cases | 5 cases | ✓ | ✓ |
| 3 | 3 Main Tabs & Single Column | R1 | 5 cases | 5 cases | ✓ | ✓ |
| 4 | Warm Editorial / Dark Theming | R1 | 5 cases | 5 cases | ✓ | ✓ |
| 5 | `.ics` Calendar Import & Parse | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 6 | Non-meal Event Filtering | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 7 | Multi-dish Title Splitting | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 8 | Frequency-based Classification | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 9 | 3-Slot Menu (Main, Side, Soup)| R3 | 5 cases | 5 cases | ✓ | ✓ |
| 10 | Slot Locking & Unlocked Shuffle | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 11 | Leftover & Context Search | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 12 | 14-Day Recency & Protein Variety | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 13 | New Recipe Challenge Injection | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 14 | Portion Scaling Arithmetic | R4 | 5 cases | 5 cases | ✓ | ✓ |
| 15 | Duplicate Ingredient Consolidation | R4 | 5 cases | 5 cases | ✓ | ✓ |
| 16 | 2-Stage Shopping Aggregator | R4 | 5 cases | 5 cases | ✓ | ✓ |
| 17 | 1-Tap Staple Promotion | R4 | 5 cases | 5 cases | ✓ | ✓ |
| 18 | LINE Shopping Memo Export | R4 | 5 cases | 5 cases | ✓ | ✓ |
| 19 | Parallel Timeline DAG Scheduler | R5 | 5 cases | 5 cases | ✓ | ✓ |
| 20 | Cooking Mode Switcher & Checks | R5 | 5 cases | 5 cases | ✓ | ✓ |
| 21 | Deterministic Offline Fallback | R5 | 5 cases | 5 cases | ✓ | ✓ |
| 22 | Passcode Lock Protection | R1/Auth | 5 cases | 5 cases | ✓ | ✓ |

## Test Architecture
- **Runner**: `vitest run`
- **Unit & Algorithmic Suites**: `tests/unit/*.test.ts`
  - `ics-parser.test.ts`: RFC 5545 stream parsing, event cleaning, title splitting, aliases, frequency count.
  - `shopping-aggregator.test.ts`: Servings scaling, fractions, consolidation, 2-stage partitioning, LINE memo format.
  - `menu-planner.test.ts`: Scoring balance, leftover matching, recency cooldown, protein alternation, slot lock preservation.
  - `timeline-scheduler.test.ts`: Cutting board hygiene, microwave queue, stove concurrency, multi-dish parallel flow.
- **E2E & Integration Suites**: `tests/e2e/*.test.ts`
  - `tier1-feature-coverage.test.ts`: Category-partition tests verifying every feature in isolation.
  - `tier2-boundary-corner.test.ts`: Boundary tests (servings 1 & 8, empty/large .ics, zero pantry, all locked).
  - `tier3-cross-feature.test.ts`: Pairwise interaction tests (e.g. scale servings + lock slot + staple promote + LINE export).
  - `tier4-real-world-scenarios.test.ts`: Full realistic kitchen workloads.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Mother plans dinner with fridge leftover Daikon & Pork | Context search, recency check, slot locking, shopping checklist, LINE memo export | High |
| 2 | Grandfather cooks main dish; user fills side & soup | Main slot locked, unlocked shuffle, portion scaling for 3 servings, 2-stage cart | Medium |
| 3 | Calendar migration: import 3 years of Google Calendar .ics | Stream parser, event filter, spelling normalization, frequency thresholding (classics vs provisional) | High |
| 4 | Supermarket run with smartphone in hand | 2-stage checklist, 1-tap staple promotion, strikethrough updates, badge decrement, LINE copy | Medium |
| 5 | Evening rush: 3-dish simultaneous parallel cooking | DAG timeline schedule, cutting board hygiene, microwave pre-cook, phase step checkoffs | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: $\ge 5$ test cases per feature ($\ge 110$ tests).
- **Tier 2 (Boundary & Corner)**: $\ge 5$ test cases per feature ($\ge 110$ tests).
- **Tier 3 (Cross-Feature Combinations)**: $\ge 22$ pairwise integration tests.
- **Tier 4 (Real-World Workloads)**: $\ge 5$ end-to-end workflow scenarios.
- **Total Minimum Target**: $\ge 247$ test cases passing with exit code 0.
