# CLAUDE.md

## Project

AI Object Detection Viewer — a portfolio project to demonstrate 3D visualization,
AI detection data parsing, and 2D/3D multi-view synchronization.
Not a production AI system.

## User Context

- Experienced: React, Next.js, TypeScript, state management, API integration, frontend performance
- New to: Three.js, WebGL, React Three Fiber, 3D visualization, AI data domain (Object Detection,
  Bounding Box, Point Cloud, Annotation), Zustand
- Use beginner-friendly explanations when 3D or AI domain concepts appear.

## Tech Stack (core)

Next.js, TypeScript, Tailwind CSS, Zustand, Three.js, React Three Fiber, @react-three/drei,
SVG overlay for 2D bounding boxes, Vercel for deployment.

Do NOT add TanStack Query, Recharts (until post-MVP), database, backend, or auth in the MVP.

## Reference Documents

Read these on demand. Do not load all of them every time.

- `.claude/docs/architecture.md` — data model, folder structure, data flow, 2D↔3D mapping
- `.claude/docs/domain-glossary.md` — definitions for 3D/AI terms (Point Cloud, COCO, etc.)
- `.claude/docs/mvp-checklist.md` — MVP step list and completion criteria

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
- Prefer beginner-friendly TypeScript. Avoid clever generics or advanced patterns
  unless the user asks.
- Avoid editing unrelated files. Stay within the scope of the current step.
- If installing a new library, verify the latest stable version is compatible
  with the existing Three.js / R3F versions before installing.

## Error & Edge Case Defaults

- Invalid or empty COCO JSON → render a clear empty/error state, never crash.
- Missing detection fields → skip that detection with a console.warn, do not throw.
- Frame with zero detections → render the image/point cloud with no overlays.
- Confidence threshold filtering happens at the selector level, not at parse time.

## Testing Policy (MVP)

No unit tests in the MVP. Focus on working features and clean structure.
Post-MVP testing decisions are deferred.

## Commit Convention

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
Keep commits scoped to one MVP step when possible.