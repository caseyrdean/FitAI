# Design Tool Workflow (Penpot-First)

## Tool Choice
- Primary: `Penpot` (open-source, dev-friendly, strong handoff support).
- Fallback: `Figma` (if collaborators require it).

## Workspace Structure
- Project: `FitAI UX System`.
- Files:
  - `00-Foundations` (tokens, spacing rhythm, typography, icon scale).
  - `01-Navigation-Shell`.
  - `02-Today-Flows` (Home, Meals, Workouts, Progress).
  - `03-Review-Flows` (Analytics, Nutrients, Bloodwork).
  - `04-Configure-Flows` (Supplements, Memory).
  - `05-Atlas-Entry-Moments`.

## Screen Frame Contract
Each screen frame must include:
- Primary job statement (one sentence).
- Primary action zone (top of frame).
- Source-of-truth callouts (what is summary vs owner data).
- Cross-link targets (where user goes next).
- Atlas entry point and default mode.

## Anti-Template Quality Gates
- Do not reuse generic dashboard kits directly.
- Require explicit data ownership labels on each major card.
- Include mobile and desktop variants for every page.
- Include at least one "decision state" and one "empty state" per flow.

## Handoff Artifacts
- Exportable component list matching app primitives (`Card`, `Table`, `Tabs`, `Badge`, `Button`).
- Copy spec for headings, descriptions, and button labels.
- Interaction notes for:
  - Navigation transitions.
  - Atlas launch triggers.
  - Notification dismissal behavior.

## Agent Reuse Process
1. Start from the page design brief.
2. Build wireframe flow in Penpot.
3. Apply quality gates.
4. Produce implementation notes in markdown.
5. Validate against no-core-logic-change constraint before code edits.
