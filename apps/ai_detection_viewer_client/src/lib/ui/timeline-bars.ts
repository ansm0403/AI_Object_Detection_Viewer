/**
 * (F7) What the scrubber timeline draws for each frame: one bar per frame.
 *
 * A scene has ~40 frames, so the timeline no longer shows a photo per frame (12
 * of 41 fitted). Each frame is a narrow cell with a bar, and the bars together
 * show WHERE in the scene there is work: many boxes, unreviewed boxes, missed
 * labels. This turns the per-frame numbers the page already has into bar
 * heights — pure, so it can be tested without rendering anything.
 */

/** What a bar means, which decides its colour. */
export type TimelineBarTone =
  /** Box count; `fill` is the share already reviewed. */
  | 'boxes'
  /** Something that needs attention (e.g. missed labels). */
  | 'alert'
  /** Nothing wrong (e.g. zero missed). */
  | 'good'
  /** The frame matches the search (F7 Explore). */
  | 'match'
  /** No data for this frame. */
  | 'muted';

export type TimelineBar = {
  /** Bar height as a share of the tallest bar in the scene, 0–1. */
  height: number;
  /** Share of the bar drawn in the "done" colour, 0–1 (review progress). */
  fill: number;
  tone: TimelineBarTone;
  /** One line for the hover preview and the accessible name, e.g. "12/40 reviewed". */
  text: string;
};

/** The input the page already builds for evaluate mode (see `TimelineBadge`). */
type BadgeLike = { text: string; tone: 'alert' | 'good' | 'match' | 'muted'; value?: number };

type FrameLike = { id: string; boxCount: number };

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * One bar per frame, in frame order.
 *
 *  - With `badges` (evaluate mode): the bar is the badge's `value` (e.g. missed
 *    labels) relative to the largest value in the scene, in the badge's tone. A
 *    frame without a badge falls back to its box count, like the old timeline.
 *  - Otherwise: the bar is the frame's box count relative to the largest count,
 *    and — when `reviewCounts` is given — `fill` is reviewed / total.
 *
 * Heights are relative WITHIN the scene (the tallest bar is always full
 * height), so a quiet scene still shows its shape. A scene where every value is
 * 0 has all bars at 0.
 */
export function timelineBars(
  frames: readonly FrameLike[],
  options: {
    reviewCounts?: ReadonlyMap<string, { reviewed: number; total: number }>;
    badges?: ReadonlyMap<string, BadgeLike>;
  } = {},
): TimelineBar[] {
  const { reviewCounts, badges } = options;
  const valueOf = (frame: FrameLike): number => {
    const badge = badges?.get(frame.id);
    if (badge) return Math.max(0, Number.isFinite(badge.value) ? (badge.value as number) : 0);
    return Math.max(0, frame.boxCount);
  };
  // Badged and unbadged frames measure different things; each kind is scaled
  // against its own largest value.
  let maxBadge = 0;
  let maxBoxes = 0;
  for (const frame of frames) {
    if (badges?.has(frame.id)) maxBadge = Math.max(maxBadge, valueOf(frame));
    else maxBoxes = Math.max(maxBoxes, valueOf(frame));
  }

  return frames.map((frame) => {
    const badge = badges?.get(frame.id);
    if (badge) {
      return {
        height: maxBadge > 0 ? clamp01(valueOf(frame) / maxBadge) : 0,
        fill: 0,
        tone: badge.tone,
        text: badge.text,
      };
    }
    const total = Math.max(0, frame.boxCount);
    const review = reviewCounts?.get(frame.id);
    const height = maxBoxes > 0 ? clamp01(total / maxBoxes) : 0;
    if (!review) {
      return { height, fill: 0, tone: 'boxes', text: `${total} ${total === 1 ? 'box' : 'boxes'}` };
    }
    return {
      height,
      fill: review.total > 0 ? clamp01(review.reviewed / review.total) : 0,
      tone: 'boxes',
      text: `${review.reviewed}/${review.total} reviewed`,
    };
  });
}

/**
 * Which cells get a frame number under them: the first frame, every `step`-th,
 * and the active one. Numbers right next to the active frame are left out so
 * the labels do not overlap in narrow cells. Returns 1-based frame numbers.
 */
export function timelineTicks(count: number, activeIndex: number, step = 5): number[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  const every = Number.isInteger(step) && step > 0 ? step : 5;
  const active = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < count ? activeIndex + 1 : null;
  const ticks: number[] = [];
  for (let n = 1; n <= count; n += 1) {
    const regular = n === 1 || n % every === 0;
    if (n === active) ticks.push(n);
    else if (regular && (active === null || Math.abs(n - active) > 1)) ticks.push(n);
  }
  return ticks;
}
