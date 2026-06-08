/**
 * Sequence autoplay logic (F2-C).
 *
 * Pure frame-advance math, kept out of the React timer that drives it
 * (Immutable Rule #3 spirit: logic outside components, unit-tested). The page
 * owns a `setInterval` that, each tick, asks this function which frame to show
 * next; the function never touches React, the store, or Three.js.
 *
 * Why a sequence at all: nuScenes keyframes are a time-ordered sequence of the
 * SAME scene (~0.5 s apart), and objects keep their `instance` id across frames
 * (the track id). Stepping the index on a timer therefore shows real motion —
 * unlike COCO's independent frames, where autoplay would be a meaningless
 * slideshow. Autoplay is wired for nuScenes only.
 */

/** Real nuScenes keyframe cadence: ~2 Hz → 500 ms per frame ("0.5 s/frame"). */
export const AUTOPLAY_INTERVAL_MS = 500;

type AdvanceOptions = {
  /** At the last frame: loop back to 0 (true) or stop, signalled by `null`. */
  loop: boolean;
};

/**
 * The next frame index to show, or `null` to stop (only when `loop` is false and
 * we are at/past the last frame).
 *
 * - `count <= 0` → `null` (nothing to play).
 * - `index < 0` (unknown / not-found current frame) → `0` (start from the top).
 * - a middle frame → `index + 1`.
 * - the last frame (or any stale `index >= count - 1`) → `0` when looping, else `null`.
 *
 * Defensive against a stale `index` (e.g. the current frame was just replaced by
 * a dataset swap) so the timer can never index out of bounds.
 */
export function nextFrameIndex(
  index: number,
  count: number,
  { loop }: AdvanceOptions,
): number | null {
  if (count <= 0) return null;
  if (index < 0) return 0;
  if (index < count - 1) return index + 1;
  // At or past the last frame.
  return loop ? 0 : null;
}
