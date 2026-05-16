# CLAUDE.md

## 필수조건

해당 파일을 읽었다는 것을 검증하기 위해 답변하기 전에 "지침에 의거하여 답변할게" 라고 말해줘.

## Project

AI Object Detection Viewer — a portfolio project to demonstrate 3D visualization,
AI detection data parsing, and 2D/3D multi-view synchronization.
Not a production AI system.

## User Context

- Experienced: React, Next.js, TypeScript, state management, API integration, frontend performance
- New to: Three.js, WebGL, React Three Fiber, 3D visualization, AI data domain (Object Detection,
  Bounding Box, Point Cloud, Annotation), Zustand
- When explaining any topic listed under "New to", including 3D-related technologies, AI data domain concepts, and Zustand, provide beginner-friendly explanations.
- For AI domain and 3D implementation: this is an unfamiliar area, but apply 
  the same engineering standards as the rest of the project — proper error 
  handling, appropriate abstraction, and performance awareness. Avoid 
  over-engineering (e.g. adding unnecessary layers or speculative generalization), 
  but do not simplify below production quality either.

## Tech Stack (core)

Next.js, TypeScript, Tailwind CSS, Zustand, Three.js, React Three Fiber, @react-three/drei,
SVG overlay for 2D bounding boxes, Vercel for deployment.

Do NOT add TanStack Query, Recharts (until post-MVP), database, backend, or auth in the MVP.

## Reference Documents

- `.claude/docs/architecture.md` — data model, folder structure, data flow
- `.claude/docs/domain-glossary.md` — 3D/AI term definitions
- `.claude/docs/mvp-checklist.md` — MVP step list and completion criteria
- `docs/PROJECT_DESIGN.md` — original project intent and background.
  Read this ONLY when (a) clarifying user intent, (b) resolving conflicts
  between docs, or (c) deciding whether a feature fits the project goal.
  Do NOT read for routine implementation tasks.

When unsure about a 3D/AI term, read `domain-glossary.md` before answering.
When making structural or multi-file changes, read `architecture.md` first.
When the user references "step N", read `mvp-checklist.md`.

## Immutable Rules

These rules must never be broken. If a request conflicts with them, propose an alternative.

1. `Detection2D.id` and `Detection3D.id` MUST be identical for the same object.
2. `selectedObjectId` is the single source of truth for object selection.
   Do NOT create `selected2DObjectId` or `selected3DObjectId`.
3. COCO parsing and coordinate conversion logic MUST live outside React components
   AND outside the Zustand store.
4. Do NOT expand MVP scope without explicit user approval.
5. The 3D viewer is the main view; the 2D viewer is a supporting context view.
6. 3D coordinates are ESTIMATED from 2D bbox data. They are visualization approximations,
   not real-world depth. Never claim otherwise in code comments or UI.
7. COCO is a 2D-only dataset format. Do NOT attempt to read 3D fields from COCO JSON.

## Workflow Rules

- Before any multi-file or architectural change, propose a short plan and wait for approval.
- After implementation, summarize: changed files, key logic, and any rule conflicts encountered.
- If a package script is needed, inspect `package.json` instead of guessing commands.
- Avoid editing unrelated files. Stay within the scope of the current step.
- If installing a new library, verify the latest stable version is compatible
  with the existing Three.js / R3F versions before installing.

## Error & Edge Case Defaults

- Invalid or empty COCO JSON → render a clear empty/error state, never crash.
- Missing detection fields → skip that detection with a console.warn, do not throw.
- Frame with zero detections → render the image/point cloud with no overlays.
- Confidence threshold filtering happens at the selector level, not at parse time.


## Testing Policy

- Unit tests only until Step 5. Integration tests begin at Step 5 (2D↔3D sync).
- Test only: `lib/coco/` parsing, `lib/geometry/` conversion, `store/` selectors/actions.
  Do NOT test UI rendering or React component structure.
- Test files live next to the module they test: `parser.ts` → `parser.test.ts`.
- Tool: **Vitest**. Introduce at end of Step 1. No `@testing-library/react` in MVP.
- Step-by-step test scope: see `mvp-checklist.md` Tests sub-items.
- Writing rules and layer boundaries: see `architecture.md` Testing Boundaries section.

## Commit Convention

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
Keep commits scoped to one MVP step when possible.