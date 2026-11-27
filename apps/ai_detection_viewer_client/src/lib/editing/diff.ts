import type { Vec3 } from '@/lib/geometry/transforms';
import { normalizeAngle, type BoxValues } from './box';

/**
 * What an edit changed, compared with the dataset's box (F8).
 *
 * Used for the "Changed from the label" line, the export, and — in practice
 * mode — to say how close an edit came to the box that was there before an
 * error was planted. Pure (Immutable Rule #3).
 */
export type BoxChange = {
  /** Centre shift along each global axis [x, y, z], metres. */
  translationDelta: Vec3;
  /** How far the centre moved on the ground (level distance), metres. */
  moved: number;
  /** How far the BOTTOM of the box moved up (+) or down (−), metres. */
  lift: number;
  /** Size change [width, length, height], metres. */
  sizeDelta: Vec3;
  /** Turn about the vertical axis, DEGREES in (−180, 180]; + = counter-clockwise seen from above. */
  turned: number;
};

export function boxChange(label: BoxValues, edited: BoxValues): BoxChange {
  const d: Vec3 = [
    edited.translation[0] - label.translation[0],
    edited.translation[1] - label.translation[1],
    edited.translation[2] - label.translation[2],
  ];
  const sizeDelta: Vec3 = [
    edited.size[0] - label.size[0],
    edited.size[1] - label.size[1],
    edited.size[2] - label.size[2],
  ];
  return {
    translationDelta: d,
    moved: Math.hypot(d[0], d[1]),
    lift: d[2] - sizeDelta[2] / 2,
    sizeDelta,
    turned: (normalizeAngle(edited.yaw - label.yaw) * 180) / Math.PI,
  };
}

/** Below these a difference is not worth a word (half of what the text would round to). */
const METRES_SHOWN = 0.005;
const DEGREES_SHOWN = 0.05;

const signed = (value: number, digits: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;

/**
 * The change in words, one short phrase per thing that changed:
 * `["moved 0.54 m", "length +0.35 m", "turned 6.0°"]`. Empty when nothing
 * changed by more than the text can show.
 *
 * "edited" wording only — never "corrected" or "fixed": an edit is one
 * reviewer's judgement, not the truth (Rule #6).
 */
export function describeChange(change: BoxChange): string[] {
  const parts: string[] = [];
  if (change.moved >= METRES_SHOWN) parts.push(`moved ${change.moved.toFixed(2)} m`);
  if (Math.abs(change.lift) >= METRES_SHOWN) {
    parts.push(`${change.lift > 0 ? 'raised' : 'lowered'} ${Math.abs(change.lift).toFixed(2)} m`);
  }
  const [width, length, height] = change.sizeDelta;
  if (Math.abs(length) >= METRES_SHOWN) parts.push(`length ${signed(length, 2)} m`);
  if (Math.abs(width) >= METRES_SHOWN) parts.push(`width ${signed(width, 2)} m`);
  if (Math.abs(height) >= METRES_SHOWN) parts.push(`height ${signed(height, 2)} m`);
  if (Math.abs(change.turned) >= DEGREES_SHOWN) parts.push(`turned ${signed(change.turned, 1)}°`);
  return parts;
}

/** How far apart two boxes are, in the three ways a box can be wrong. */
export type BoxDistance = {
  /** Distance between the centres (3D), metres. */
  centre: number;
  /** The largest difference of width, length or height, metres. */
  size: number;
  /** Difference in heading, degrees, 0 … 180. */
  heading: number;
};

export function boxDistance(a: BoxValues, b: BoxValues): BoxDistance {
  return {
    centre: Math.hypot(
      a.translation[0] - b.translation[0],
      a.translation[1] - b.translation[1],
      a.translation[2] - b.translation[2],
    ),
    size: Math.max(
      Math.abs(a.size[0] - b.size[0]),
      Math.abs(a.size[1] - b.size[1]),
      Math.abs(a.size[2] - b.size[2]),
    ),
    heading: Math.abs((normalizeAngle(a.yaw - b.yaw) * 180) / Math.PI),
  };
}
