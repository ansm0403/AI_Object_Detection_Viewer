/**
 * (F4) The part of the camera image to show when zooming in on one box.
 *
 * In the full camera view a distant object is a few pixels wide — too small to
 * judge whether its box fits. Zooming crops the image around the selected box.
 * Pure geometry (Immutable Rule #3): the viewer only applies the returned
 * rectangle as its SVG `viewBox`.
 */

export type ImageRegion = { x: number; y: number; width: number; height: number };

/** The box takes about 1/2.4 of the region's height: room to see what is around it. */
const HEIGHT_FACTOR = 2.4;
/** A wide box (a car seen from the side) still gets space on both sides. */
const WIDTH_FACTOR = 1.8;
/**
 * Never crop tighter than this many source pixels in height. Below it the
 * photo is only being magnified (blurrier, not more informative) and tiny
 * boxes would jump to a wildly different scale than their neighbours.
 */
const MIN_REGION_HEIGHT = 140;

/**
 * The region to show for `bbox` (the box's bounding rectangle in image pixels).
 *
 * The region always has the IMAGE's aspect ratio, so the picture is not
 * distorted and fills the same cell as the full view. It is centred on the box,
 * then shifted to stay inside the image; it never exceeds the image (a box that
 * already fills the frame returns the whole image).
 */
export function zoomRegion(
  bbox: ImageRegion,
  imageWidth: number,
  imageHeight: number,
): ImageRegion {
  const whole: ImageRegion = { x: 0, y: 0, width: imageWidth, height: imageHeight };
  if (!(imageWidth > 0) || !(imageHeight > 0)) return whole;
  const values = [bbox.x, bbox.y, bbox.width, bbox.height];
  if (!values.every(Number.isFinite) || bbox.width <= 0 || bbox.height <= 0) return whole;

  const aspect = imageWidth / imageHeight;
  let height = Math.max(bbox.height * HEIGHT_FACTOR, MIN_REGION_HEIGHT);
  let width = height * aspect;
  if (width < bbox.width * WIDTH_FACTOR) {
    width = bbox.width * WIDTH_FACTOR;
    height = width / aspect;
  }
  if (width >= imageWidth || height >= imageHeight) return whole;

  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;
  const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);
  return {
    x: clamp(centerX - width / 2, imageWidth - width),
    y: clamp(centerY - height / 2, imageHeight - height),
    width,
    height,
  };
}
