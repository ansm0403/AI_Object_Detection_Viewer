import type { Frame } from '@/lib/types';

/**
 * Why a verdict cannot be given right now, or `null` when it can.
 *  - `playing`:      autoplay is running. Frames change every 0.5 s and boxes
 *                    are drawn at INTERPOLATED poses between keyframes (F2-D).
 *                    A verdict must be about a measured pose (Rule #6), and it
 *                    could also land on the wrong frame.
 *  - `no-selection`: nothing is selected.
 *  - `not-in-frame`: the selected object has no box in this frame (on nuScenes
 *                    the selection follows the object across frames).
 *  - `hidden`:       the box is filtered out, so it is not drawn in the 3D view.
 */
export type ReviewBlock = 'playing' | 'no-selection' | 'not-in-frame' | 'hidden';

export function getReviewBlock(input: {
  frame: Frame;
  selectedId: string | null;
  /** Ids passing the current filters; `undefined` = no filter. */
  visibleIds: Set<string> | undefined;
  playing: boolean;
}): ReviewBlock | null {
  const { frame, selectedId, visibleIds, playing } = input;
  if (playing) return 'playing';
  if (selectedId === null) return 'no-selection';
  if (!frame.detections3D.some((box) => box.id === selectedId)) return 'not-in-frame';
  if (visibleIds && !visibleIds.has(selectedId)) return 'hidden';
  return null;
}
