import { IOU_THRESHOLD } from './match';

/**
 * (F7.5) The overlap thresholds the evaluate mode offers.
 *
 * IoU ("intersection over union") says how much two rectangles overlap: 0 =
 * not at all, 1 = identical. A model box "finds" a label when their IoU reaches
 * the threshold.
 *
 * Two values, not a slider: the point is to put THIS tool's threshold next to
 * the one benchmarks usually report, so the reader can see how much of the
 * result is the choice of threshold.
 *  - 0.3 — the default here (`IOU_THRESHOLD`). The labels are 3D boxes
 *    projected into the photo and are looser than the object, so a correct
 *    detection often overlaps its label by only about half.
 *  - 0.5 — the usual benchmark value (PASCAL VOC; the loosest COCO threshold).
 *    With projected labels it counts a number of correct detections as a miss
 *    plus a false alarm.
 * Whatever is chosen, the matching procedure itself is the same (`match.ts`).
 */
export const BENCHMARK_IOU = 0.5;

export const IOU_CHOICES: readonly number[] = [IOU_THRESHOLD, BENCHMARK_IOU];

/** Whether `value` is one of the offered thresholds. */
export function isIouChoice(value: number): boolean {
  return IOU_CHOICES.includes(value);
}

/** A short note for the threshold in use — shown next to the control. */
export function describeIouChoice(value: number): { note: string; isDefault: boolean } {
  if (value === IOU_THRESHOLD) return { note: 'this tool’s default', isDefault: true };
  if (value === BENCHMARK_IOU) {
    // Kept short: the note sits in the one-line filter bar. Why 0.5 is strict
    // for projected labels is said in the control's tooltip and in the panel.
    return { note: 'benchmark value', isDefault: false };
  }
  return { note: '', isDefault: false };
}
