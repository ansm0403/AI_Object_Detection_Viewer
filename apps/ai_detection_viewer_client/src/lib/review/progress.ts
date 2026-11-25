import type { Frame } from '@/lib/types';
import { getReview } from './records';
import type { ReviewMap, Verdict } from './types';

export type ReviewCounts = {
  /** Boxes that exist in the data (the denominator). */
  total: number;
  /** Boxes with any verdict: approved + rejected + unsure. */
  reviewed: number;
  approved: number;
  rejected: number;
  unsure: number;
};

export type ReviewProgress = {
  overall: ReviewCounts;
  /** Per-frame counts, keyed by `Frame.id`, in the order of `frames`. */
  byFrame: Map<string, ReviewCounts>;
};

const emptyCounts = (): ReviewCounts => ({
  total: 0,
  reviewed: 0,
  approved: 0,
  rejected: 0,
  unsure: 0,
});

/**
 * Review progress of one frame.
 *
 * Counted by walking the frame's boxes and looking each one up — NOT by
 * counting stored records. A record whose box is not in the current data (the
 * sample file was regenerated, or it belongs to another dataset) is therefore
 * ignored instead of inflating the numbers.
 */
export function countFrameReviews(frame: Frame, reviews: ReviewMap): ReviewCounts {
  const counts = emptyCounts();
  for (const box of frame.detections3D) {
    counts.total += 1;
    const record = getReview(reviews, frame.id, box.id);
    if (!record) continue;
    counts.reviewed += 1;
    counts[record.verdict] += 1;
  }
  return counts;
}

/**
 * The verdict of each reviewed box of one frame, keyed by object id — what the
 * object list needs to draw a status per row. Unreviewed boxes are absent.
 */
export function verdictsOfFrame(frame: Frame, reviews: ReviewMap): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const box of frame.detections3D) {
    const record = getReview(reviews, frame.id, box.id);
    if (record) verdicts.set(box.id, record.verdict);
  }
  return verdicts;
}

/** Progress across all frames, plus the per-frame breakdown. */
export function summarizeProgress(frames: Frame[], reviews: ReviewMap): ReviewProgress {
  const overall = emptyCounts();
  const byFrame = new Map<string, ReviewCounts>();
  for (const frame of frames) {
    const counts = countFrameReviews(frame, reviews);
    byFrame.set(frame.id, counts);
    overall.total += counts.total;
    overall.reviewed += counts.reviewed;
    overall.approved += counts.approved;
    overall.rejected += counts.rejected;
    overall.unsure += counts.unsure;
  }
  return { overall, byFrame };
}
