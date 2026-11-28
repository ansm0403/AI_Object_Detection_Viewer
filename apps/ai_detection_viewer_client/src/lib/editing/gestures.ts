import type { Vec3 } from '@/lib/geometry/transforms';
import type { BevPoint, BevProjector } from './bev';
import { isValidBoxValues, normalizeAngle, type BoxValues } from './box';

/**
 * How a drag, a key press or a typed number changes a box (F8).
 *
 * Every function takes a box and returns a NEW box; nothing is mutated and
 * nothing here knows about the screen, React or the store (Immutable Rule #3).
 *
 * What the top view may change: x, y, width, length, yaw. It never changes z
 * or the height — those are changed by number only (`setBoxField`).
 */

/** What can be grabbed. Sides and corners are named in the box's own terms (front = where it is heading). */
export type DragHandle =
  | 'move'
  | 'rotate'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'front-left'
  | 'front-right'
  | 'back-left'
  | 'back-right';

export const DRAG_HANDLES: readonly DragHandle[] = [
  'move',
  'rotate',
  'front',
  'back',
  'left',
  'right',
  'front-left',
  'front-right',
  'back-left',
  'back-right',
];

/** No side of a box can be made shorter than this (metres). */
export const MIN_BOX_SIZE = 0.1;
/** Nor longer than this — far beyond any real object (the longest shipped box is 14.5 m). */
export const MAX_BOX_SIZE = 50;

const clampSize = (value: number) => Math.min(MAX_BOX_SIZE, Math.max(MIN_BOX_SIZE, value));

/**
 * The box after dragging `handle` from `from` to `to`.
 *
 * `start` is the box as it was when the drag BEGAN, and both points are global
 * points on the box's level plane (`BevProjector.toGlobal(pointer, start z)`).
 * Computing from the start box each time — not from the previous step — means
 * a long drag cannot accumulate rounding, and dragging back to where it
 * started gives the start box back exactly.
 *
 *  - move:    the centre follows the pointer.
 *  - a side:  that side follows the pointer along the box's own axis; the
 *             OPPOSITE side stays where it is (so the centre moves by half).
 *  - a corner: both of its sides follow; the opposite corner stays.
 *  - rotate:  the box turns about its centre by the angle the pointer swept.
 *
 * The movement is relative (how far the pointer went), so grabbing a handle a
 * few pixels off its middle does not make the box jump.
 */
export function dragBox(start: BoxValues, handle: DragHandle, from: Vec3, to: Vec3): BoxValues {
  const [cx, cy, cz] = start.translation;
  const [width, length, height] = start.size;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];

  if (handle === 'move') {
    return { ...start, translation: [cx + dx, cy + dy, cz] };
  }

  if (handle === 'rotate') {
    const before = Math.atan2(from[1] - cy, from[0] - cx);
    const after = Math.atan2(to[1] - cy, to[0] - cx);
    // A pointer sitting on the centre has no direction; leave the box alone.
    if (Math.hypot(to[0] - cx, to[1] - cy) < 1e-9 || Math.hypot(from[0] - cx, from[1] - cy) < 1e-9) {
      return start;
    }
    return { ...start, yaw: normalizeAngle(start.yaw + after - before) };
  }

  // The box's own axes on the level plane: front and left.
  const ax = Math.cos(start.yaw);
  const ay = Math.sin(start.yaw);
  const alongFront = dx * ax + dy * ay;
  const alongLeft = -dx * ay + dy * ax;

  let newLength = length;
  let newWidth = width;
  // How far the centre shifts along each axis so that the far side stays put.
  let shiftFront = 0;
  let shiftLeft = 0;

  if (handle === 'front' || handle === 'front-left' || handle === 'front-right') {
    newLength = clampSize(length + alongFront);
    shiftFront = (newLength - length) / 2;
  } else if (handle === 'back' || handle === 'back-left' || handle === 'back-right') {
    newLength = clampSize(length - alongFront);
    shiftFront = -(newLength - length) / 2;
  }
  if (handle === 'left' || handle === 'front-left' || handle === 'back-left') {
    newWidth = clampSize(width + alongLeft);
    shiftLeft = (newWidth - width) / 2;
  } else if (handle === 'right' || handle === 'front-right' || handle === 'back-right') {
    newWidth = clampSize(width - alongLeft);
    shiftLeft = -(newWidth - width) / 2;
  }

  return {
    translation: [cx + shiftFront * ax - shiftLeft * ay, cy + shiftFront * ay + shiftLeft * ax, cz],
    size: [newWidth, newLength, height],
    yaw: start.yaw,
  };
}

/**
 * The box moved by `delta` AS SEEN IN THE TOP VIEW (metres; x right, y down),
 * e.g. one arrow-key step. Its height does not change.
 */
export function nudgeBox(values: BoxValues, delta: BevPoint, projector: BevProjector): BoxValues {
  const at = projector.toBev(values.translation);
  const [x, y] = projector.toGlobal([at[0] + delta[0], at[1] + delta[1]], values.translation[2]);
  return { ...values, translation: [x, y, values.translation[2]] };
}

/** The numbers shown (and typed) in the edit panel. */
export type BoxField = 'length' | 'width' | 'height' | 'heading' | 'lift';

export const BOX_FIELDS: readonly BoxField[] = ['length', 'width', 'height', 'heading', 'lift'];

export type BoxFieldContext = {
  projector: BevProjector;
  /** The dataset's own box — what "lift" is measured from. */
  label: BoxValues;
};

const bottomOf = (values: BoxValues) => values.translation[2] - values.size[2] / 2;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The value of one field.
 *  - length / width / height: metres.
 *  - heading: DEGREES, where the front of the box points in the top view,
 *    relative to the front of the car (0° = same way as the car, +90° = to the
 *    car's left), in (−180, 180].
 *  - lift: metres the BOTTOM of the box is above (+) or below (−) the bottom
 *    of the dataset's box. The bottom, not the centre, so changing the height
 *    does not read as lifting the box.
 */
export function readBoxField(values: BoxValues, field: BoxField, context: BoxFieldContext): number {
  switch (field) {
    case 'width':
      return values.size[0];
    case 'length':
      return values.size[1];
    case 'height':
      return values.size[2];
    case 'heading':
      return toDegrees(normalizeAngle(context.projector.headingOfYaw(values.yaw)));
    case 'lift':
      return bottomOf(values) - bottomOf(context.label);
  }
}

/** Largest lift that can be typed (metres, either way). A box further off than this is a typo. */
export const MAX_LIFT = 20;

/**
 * The box with one field set to a typed number. A value that is not a finite
 * number changes nothing (the same box is returned); sizes are kept within
 * `MIN_BOX_SIZE` … `MAX_BOX_SIZE`.
 *
 *  - length / width: the centre stays (the box grows or shrinks on both sides).
 *  - height: the BOTTOM stays — a box that is too tall is not also too low.
 *  - heading: turns about the centre.
 *  - lift: moves the box straight up or down.
 */
export function setBoxField(
  values: BoxValues,
  field: BoxField,
  value: number,
  context: BoxFieldContext,
): BoxValues {
  if (!Number.isFinite(value)) return values;
  const [x, y, z] = values.translation;
  const [width, length, height] = values.size;
  let next: BoxValues;
  switch (field) {
    case 'width':
      next = { ...values, size: [clampSize(value), length, height] };
      break;
    case 'length':
      next = { ...values, size: [width, clampSize(value), height] };
      break;
    case 'height': {
      const newHeight = clampSize(value);
      next = { ...values, translation: [x, y, z + (newHeight - height) / 2], size: [width, length, newHeight] };
      break;
    }
    case 'heading':
      next = { ...values, yaw: normalizeAngle(context.projector.yawOfHeading(toRadians(value))) };
      break;
    case 'lift': {
      const lift = Math.min(MAX_LIFT, Math.max(-MAX_LIFT, value));
      next = { ...values, translation: [x, y, bottomOf(context.label) + lift + height / 2] };
      break;
    }
  }
  return isValidBoxValues(next) ? next : values;
}
