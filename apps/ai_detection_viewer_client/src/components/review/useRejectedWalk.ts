'use client';

import { useMemo } from 'react';
import {
  positionOf,
  rejectedBoxes,
  rejectedIndexAt,
  stepRejected,
  type RejectedBox,
  type ReviewMap,
  type SceneFrames,
} from '@/lib/review';
import type { Frame } from '@/lib/types';

type Options = {
  /** Only worked out where it is shown: on the review screen and in the box editor. */
  on: boolean;
  /** Every scene whose boxes are in memory, in catalog order. */
  scenes: readonly SceneFrames[];
  reviews: ReviewMap;
  /** The page's filter rule: the ids of a frame's boxes that are not hidden. */
  visibleIdsOf: (frame: Frame) => ReadonlySet<string>;
  /** Where the reviewer is. */
  frameId: string | null;
  objectId: string | null;
  /** True while stepping must wait (a box is being dragged). */
  blocked: boolean;
  /** Go to a box: its frame, in whatever scene it is, with the box selected. */
  open: (target: { scene: string; frameId: string; objectId: string }) => void;
};

export type RejectedWalk = {
  /** Rejected boxes that can be worked on (not hidden by the filters). */
  count: number;
  /** 0-based place of the box on screen among them; `null` when it is not one of them. */
  index: number | null;
  /** Absent when there is no other rejected box to go to (or stepping is blocked). */
  onNext?: () => void;
  onPrev?: () => void;
};

/**
 * (F8) The second pass over the rejected boxes: where the reviewer is among
 * them, and the way to the next / previous one — across frames and scenes.
 *
 * WHICH box comes next is the pure `lib/review/rejected` (unit-tested); this
 * hook connects it to what is on screen. It selects through `open`, so the
 * selection stays the page's one `selectedObjectId` (Rule #2).
 */
export function useRejectedWalk({
  on,
  scenes,
  reviews,
  visibleIdsOf,
  frameId,
  objectId,
  blocked,
  open,
}: Options): RejectedWalk {
  const boxes = useMemo<RejectedBox[]>(
    () => (on ? rejectedBoxes(scenes, reviews, visibleIdsOf) : []),
    [on, scenes, reviews, visibleIdsOf],
  );
  const position = useMemo(
    () => (on ? positionOf(scenes, frameId, objectId) : null),
    [on, scenes, frameId, objectId],
  );
  return useMemo(() => {
    const index = rejectedIndexAt(boxes, position);
    const next = blocked ? null : stepRejected(boxes, position, 1);
    const prev = blocked ? null : stepRejected(boxes, position, -1);
    return {
      count: boxes.length,
      index: index === -1 ? null : index,
      onNext: next ? () => open(next) : undefined,
      onPrev: prev ? () => open(prev) : undefined,
    };
  }, [boxes, position, blocked, open]);
}
