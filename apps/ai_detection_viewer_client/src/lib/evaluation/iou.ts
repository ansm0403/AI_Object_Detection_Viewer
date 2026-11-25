import type { Box2D } from './types';

/**
 * Intersection over Union of two axis-aligned rectangles: the area they share
 * divided by the area they cover together. 0 = no overlap, 1 = identical.
 *
 * Picture two sheets of paper lying on each other: IoU is "the doubly covered
 * part / everything covered". It is the standard measure of how well a
 * predicted box matches a label box.
 *
 * Degenerate input (zero or negative size, non-finite numbers) yields 0 rather
 * than NaN, so a broken box can never match anything.
 */
export function iou(a: Box2D, b: Box2D): number {
  const areaA = area(a);
  const areaB = area(b);
  if (areaA <= 0 || areaB <= 0) return 0;

  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (!(overlapWidth > 0) || !(overlapHeight > 0)) return 0;

  const intersection = overlapWidth * overlapHeight;
  return intersection / (areaA + areaB - intersection);
}

function area(box: Box2D): number {
  const values = [box.x, box.y, box.width, box.height];
  if (!values.every(Number.isFinite)) return 0;
  if (box.width <= 0 || box.height <= 0) return 0;
  return box.width * box.height;
}
