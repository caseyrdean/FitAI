# UX Rollout Checklist

## Goal
Ship the UX refresh with no changes to core app behavior (APIs, scoring, memory semantics, Atlas tools).

## Phase 1: Navigation + Home
- [x] Group sidebar into `Today`, `Review`, `Configure`.
- [x] Add Home primary action card with clear next steps.
- [x] Add ownership links from summary cards to destination pages.
- [x] Verify dashboard page returns 200 and renders without console errors.

## Phase 2: Task-First Page Flows
- [x] Meals: task tabs (`Today Log`, `Weekly Plan`, `Shopping`).
- [x] Workouts: action-first top section.
- [x] Progress: action-first framing + simplified copy.
- [x] Analytics: weekly review framing + top actions.
- [x] Memory: non-technical form UX.
- [x] Nutrients/Supplements/Bloodwork: action-first intro cards.

## Phase 3: Atlas Entry Points + Context
- [x] Keep mode selector always visible in Atlas chat.
- [x] Add contextual "Ask Atlas" buttons on core pages.
- [x] Wire page-level Atlas launch events without backend changes.
- [x] Keep refresh events and scope dispatch behavior intact.

## Phase 4: Mobile + Polish
- [x] Improve mobile stacking in Home cards and Meals tabs.
- [x] Improve Atlas panel mobile sizing and positioning.
- [x] Harmonize primary action language across pages.
- [x] Standardize empty-state wording and follow-up links.

## Verification
- [x] Lint touched files (no new linter errors).
- [x] Route smoke test for all dashboard pages.
- [x] API health checks for core dashboard dependencies.
- [ ] Manual click-through QA by user.

## Acceptance Criteria
- Next action is visible above fold on every major page.
- Users can navigate from summary to owner page in one click.
- Atlas can be launched contextually from key pages.
- No regressions in data writes/reads, scoring, or refresh behavior.
