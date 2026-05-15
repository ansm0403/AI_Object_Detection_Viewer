# CLAUDE.md

## Project

AI Object Detection Viewer

This is a portfolio project for demonstrating:

- 3D visualization
- AI object detection data parsing
- 2D and 3D multi-view synchronization
- TypeScript-based frontend architecture

The goal is not to build a production AI system.
The goal is to prove 3D visualization and data processing ability through a portfolio project.

## User Context

The user is experienced with React, Next.js, TypeScript, frontend state management, API integration, frontend performance optimization, and basic Nest.js backend development.

The user is new to Three.js, WebGL, React Three Fiber, 3D visualization, AI data domain concepts, Object Detection, Bounding Box, Point Cloud, Annotation, and Zustand.

When explaining 3D or AI data concepts, use beginner-friendly explanations.

## Tech Stack

Use:

- Next.js
- TypeScript
- Tailwind CSS
- Zustand
- Three.js
- React Three Fiber
- @react-three/drei
- SVG overlay for 2D bounding boxes
- Recharts only for optional statistics after the MVP
- Vercel for deployment

Do not add TanStack Query in the MVP.

## MVP Scope

Implement the MVP first:

1. COCO annotation JSON parsing
2. Internal TypeScript data conversion
3. Frame list and frame selection
4. 2D image viewer with SVG bounding boxes
5. 3D viewer with point cloud, 3D bounding boxes, and OrbitControls
6. 2D ↔ 3D object selection synchronization
7. Object list panel
8. Confidence threshold filter
9. Class filter
10. Frame timeline

## Non-goals for MVP

Do not implement these in the MVP:

- login or signup
- database
- backend API
- real-time streaming
- real-time AI inference
- AI model training
- ROS integration
- LiDAR raw binary parsing
- GPS / IMU data
- sensor timestamp synchronization
- fake annotation editing UI
- JSON inspector
- KITTI dataset integration

## Core Data Rules

Use COCO annotation JSON as the data source.

Convert COCO data into an internal `Frame` structure before rendering.

The internal model must include:

- `Frame`
- `Detection2D`
- `Detection3D`
- `Point3D`

`Detection2D.id` and `Detection3D.id` must be identical for the same object.

This shared id is the key for 2D ↔ 3D synchronization.

Keep COCO parsing and coordinate conversion logic outside React components.

Do not put COCO parsing logic inside the Zustand store.

## Core State Rules

Use Zustand for global viewer UI state.

The store should include:

- `selectedFrameId`
- `selectedObjectId`
- `confidenceThreshold`
- `visibleClasses`

`selectedObjectId` must be the single source of truth for object selection.

When `selectedObjectId` changes:

- the 2D bounding box highlight should update
- the 3D bounding box highlight should update
- the object list selection should update

Do not create separate selected states such as `selected2DObjectId` or `selected3DObjectId`.

## 3D Data Rules

The MVP does not use real LiDAR depth data.

Estimate 3D coordinates from 2D bounding box position and size.

Generate estimated point cloud data and render it using Three.js `BufferGeometry`.

The estimated 3D data should be treated as a visualization approximation, not real-world depth.

## 3D Viewer Rules

Use React Three Fiber for 3D rendering.

The 3D viewer should include:

- point cloud rendering
- 3D bounding box rendering
- OrbitControls
- object click selection
- selected object highlight

The 3D viewer is the main view of the application.

The 2D image viewer is a supporting context view.

## Recommended Implementation Order

Prefer this order:

1. Data parsing
2. 2D viewer
3. Zustand store
4. 3D scene
5. 2D ↔ 3D synchronization
6. Filters and timeline
7. UI cleanup
8. README and deployment

## Implementation Rules

- Keep code simple and readable.
- Prefer beginner-friendly TypeScript.
- Do not expand the MVP scope without explicit approval.
- Avoid modifying unrelated files.
- Keep data parsing, UI rendering, 3D rendering, and state management separated.
- Before large multi-file or architectural changes, propose a short plan first.
- After implementation, summarize changed files and important logic.
- If package scripts are needed, inspect `package.json` instead of guessing commands.