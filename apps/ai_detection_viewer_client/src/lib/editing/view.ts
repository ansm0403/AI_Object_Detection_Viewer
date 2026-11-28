import type { BevPoint, Footprint } from './bev';

/**
 * What part of the top view is on screen (F8): which top-view point is in the
 * middle of the element, and how many metres one pixel covers. Zooming and
 * panning are changes of these two; the SVG's viewBox and the canvas that
 * draws the points are both derived from them here, so the two layers cannot
 * disagree. Pure math (Immutable Rule #3).
 */
export type BevView = {
  centre: BevPoint;
  metresPerPixel: number;
};

/** Size of the element the view is drawn in, in CSS pixels. */
export type PixelSize = { width: number; height: number };

/** Closest zoom: 5 mm per pixel. */
export const MIN_METRES_PER_PIXEL = 0.005;
/** Farthest zoom: half a metre per pixel (a 500 px view shows 250 m). */
export const MAX_METRES_PER_PIXEL = 0.5;

const clampScale = (value: number) =>
  Math.min(MAX_METRES_PER_PIXEL, Math.max(MIN_METRES_PER_PIXEL, value));

/**
 * Metres kept free around the box when the view is fitted to it: twice the
 * box's own reach, but never less than 1.2 m (a pedestrian is not left as a
 * dot) nor more than 4 m (a bus still shows its neighbours, not the whole lot).
 */
const FIT_MARGIN_MIN_METRES = 1.2;
const FIT_MARGIN_MAX_METRES = 4;

/**
 * A view centred on a box, close enough to work on it and wide enough to see
 * its neighbours: the box's longer side plus a margin fits the SHORTER side of
 * the element.
 */
export function fitViewTo(footprint: Footprint, size: PixelSize): BevView {
  let reach = 0;
  for (const corner of footprint.corners) {
    reach = Math.max(
      reach,
      Math.hypot(corner[0] - footprint.center[0], corner[1] - footprint.center[1]),
    );
  }
  const shorter = Math.max(1, Math.min(size.width, size.height));
  const margin = Math.min(FIT_MARGIN_MAX_METRES, Math.max(FIT_MARGIN_MIN_METRES, 2 * reach));
  return {
    centre: footprint.center,
    metresPerPixel: clampScale((2 * (reach + margin)) / shorter),
  };
}

/** The SVG viewBox (in metres) that shows this view in an element of this size. */
export function viewBoxOf(view: BevView, size: PixelSize) {
  const width = size.width * view.metresPerPixel;
  const height = size.height * view.metresPerPixel;
  return { x: view.centre[0] - width / 2, y: view.centre[1] - height / 2, width, height };
}

/** A pixel of the element (from its top-left corner) → the top-view point shown there. */
export function pixelToBev(view: BevView, size: PixelSize, pixel: readonly [number, number]): BevPoint {
  return [
    view.centre[0] + (pixel[0] - size.width / 2) * view.metresPerPixel,
    view.centre[1] + (pixel[1] - size.height / 2) * view.metresPerPixel,
  ];
}

/** A top-view point → the pixel of the element where it is shown. */
export function bevToPixel(view: BevView, size: PixelSize, point: BevPoint): [number, number] {
  return [
    (point[0] - view.centre[0]) / view.metresPerPixel + size.width / 2,
    (point[1] - view.centre[1]) / view.metresPerPixel + size.height / 2,
  ];
}

/**
 * Zoom by `factor` (> 1 = out, < 1 = in) so that the point under `anchor`
 * (a pixel, usually the pointer) stays under it.
 */
export function zoomView(
  view: BevView,
  size: PixelSize,
  factor: number,
  anchor: readonly [number, number],
): BevView {
  const metresPerPixel = clampScale(view.metresPerPixel * factor);
  if (metresPerPixel === view.metresPerPixel) return view;
  const fixed = pixelToBev(view, size, anchor);
  return {
    centre: [
      fixed[0] - (anchor[0] - size.width / 2) * metresPerPixel,
      fixed[1] - (anchor[1] - size.height / 2) * metresPerPixel,
    ],
    metresPerPixel,
  };
}

/** Move the view so that what was under the pointer follows it by `deltaPixels`. */
export function panView(view: BevView, deltaPixels: readonly [number, number]): BevView {
  if (deltaPixels[0] === 0 && deltaPixels[1] === 0) return view;
  return {
    centre: [
      view.centre[0] - deltaPixels[0] * view.metresPerPixel,
      view.centre[1] - deltaPixels[1] * view.metresPerPixel,
    ],
    metresPerPixel: view.metresPerPixel,
  };
}

/** A round length (1, 2, 5, 10, … metres) that is about `targetPixels` wide — for the scale bar. */
export function scaleBarMetres(view: BevView, targetPixels = 80): number {
  const metres = targetPixels * view.metresPerPixel;
  const power = 10 ** Math.floor(Math.log10(metres));
  const lead = metres / power;
  const step = lead >= 5 ? 5 : lead >= 2 ? 2 : 1;
  return step * power;
}
