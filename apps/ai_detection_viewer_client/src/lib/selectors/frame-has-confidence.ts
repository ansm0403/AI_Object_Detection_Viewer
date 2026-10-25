import type { Frame } from '@/lib/types';

/**
 * Whether a frame's `confidence` values are real model scores worth showing.
 *
 * Pure function — no React / Zustand / Three.js imports.
 *
 * COCO frames carry YOLOv8n prediction scores (Step 11), so confidence is
 * meaningful. nuScenes frames are human-labelled ground-truth annotations:
 * there is no model score, and the parser fills a constant 1.0 only because
 * the `Detection` type requires a number (see `lib/nuscenes/parser.ts`).
 * Rendering that placeholder as "1.000" / "100%" would present measured
 * annotations as a maximally confident AI detection (Immutable Rule #6), so
 * every surface that shows confidence consults this first and renders "—"
 * (or omits the value) when it returns false.
 *
 * Keyed on `Frame.source` (provenance — the same flag that drives the
 * Estimated/Measured badge), not on the dataset id, so it stays correct for
 * any future measured dataset that sets the same flag. Absent `source`
 * (legacy COCO frames) → true, preserving the pre-F2 behaviour.
 */
export function frameHasConfidence(frame: Pick<Frame, 'source'>): boolean {
  return frame.source !== 'nuscenes-measured';
}
