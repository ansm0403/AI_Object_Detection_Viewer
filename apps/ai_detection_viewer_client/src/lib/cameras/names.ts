/**
 * (F6) Camera names: how the six nuScenes cameras are called, shortened and
 * ordered on screen.
 *
 * Picture the car from above with six cameras on its roof, facing outward in a
 * ring. Each has a channel name in the dataset; the UI shortens it.
 */

/**
 * The frame's base camera: the one whose photo and ego pose the top-level
 * fields of a prepped nuScenes frame describe, and the only camera of sample
 * files prepped before F6 (which do not name it).
 */
export const DEFAULT_CAMERA = 'CAM_FRONT';

/**
 * Display order: a look around the car, left to right as if turning your head —
 * rear-left, front-left, front, front-right, rear-right, rear. Neighbours in
 * this row are neighbouring cameras, so an object that leaves one photo at its
 * edge enters the photo next to it. (Only the two ends, rear-left and rear,
 * are neighbours on the car but not in the row.)
 */
export const CAMERA_DISPLAY_ORDER: readonly string[] = [
  'CAM_BACK_LEFT',
  'CAM_FRONT_LEFT',
  'CAM_FRONT',
  'CAM_FRONT_RIGHT',
  'CAM_BACK_RIGHT',
  'CAM_BACK',
];

const SHORT_NAMES = new Map<string, string>([
  ['CAM_FRONT', 'F'],
  ['CAM_FRONT_LEFT', 'FL'],
  ['CAM_FRONT_RIGHT', 'FR'],
  ['CAM_BACK', 'B'],
  ['CAM_BACK_LEFT', 'BL'],
  ['CAM_BACK_RIGHT', 'BR'],
]);

/**
 * Short label of a camera: "CAM_FRONT_LEFT" → "FL". A name this table does not
 * know is shown as it is, minus a leading "CAM_" — an unknown camera must stay
 * recognisable rather than collapse into a wrong abbreviation.
 */
export function cameraShortName(name: string): string {
  const known = SHORT_NAMES.get(name);
  if (known) return known;
  return name.startsWith('CAM_') && name.length > 4 ? name.slice(4) : name;
}

/**
 * Sort things that have a camera name into `CAMERA_DISPLAY_ORDER`. Names the
 * order does not list keep their given order and come last. Stable; returns a
 * new array.
 */
export function inDisplayOrder<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  const rank = (name: string) => {
    const index = CAMERA_DISPLAY_ORDER.indexOf(name);
    return index === -1 ? CAMERA_DISPLAY_ORDER.length : index;
  };
  return items
    .map((item, index) => ({ item, index, rank: rank(nameOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
