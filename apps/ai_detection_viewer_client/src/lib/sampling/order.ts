import { makeRng } from '@/lib/geometry/pointcloud-generator';

/**
 * (F7.5) Drawing a reproducible random sample.
 *
 * A SAMPLE is a randomly chosen part of a larger set (the POPULATION), looked
 * at instead of the whole set. Here: 100 of the 1,452 false alarms that have no
 * label nearby. For the share seen in the sample to say something about the
 * whole set, every item must have had the same chance of being picked — a
 * person choosing "interesting" boxes would not do.
 *
 * How it is drawn: the population, in its fixed order, is shuffled ONCE with a
 * seeded generator; the sample of size N is the first N of that shuffled order.
 *  - Same population + same seed → the same order, every time, on every
 *    machine. Reopening the app shows the same sample.
 *  - The first N of a random order are a simple random sample of size N. So a
 *    sample of 200 STARTS WITH the sample of 100: extending the sample keeps
 *    every verdict already given.
 */

/** The one seed the app uses. Part of the sample's definition; written into the export. */
export const SAMPLE_SEED = 20261127;

/**
 * `items` in a seeded random order (Fisher–Yates shuffle). Does not modify the
 * input. Deterministic: the result depends only on the items' order and `seed`.
 */
export function drawOrder<T>(items: readonly T[], seed: number = SAMPLE_SEED): T[] {
  const order = [...items];
  const random = makeRng(seed);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The sample of `size`: the first `size` items of a drawn order (all of them if there are fewer). */
export function sampleOf<T>(order: readonly T[], size: number): T[] {
  const n = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0;
  return order.slice(0, n);
}
