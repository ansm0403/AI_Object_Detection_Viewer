/**
 * Rectangles to draw over a camera image, described as plain data (F5).
 *
 * The camera viewer draws these without knowing what they mean; whoever builds
 * the list decides colour, line style and emphasis. This keeps the viewer free
 * of evaluation concepts and lets the "what to draw" logic be unit-tested.
 */

/** Rectangle in image pixels, origin at the top-left. */
export type ImageBox = { x: number; y: number; width: number; height: number };

export type ImageRect = {
  /** Unique within one overlay (React key). */
  key: string;
  bbox: ImageBox;
  /** Stroke colour (CSS). */
  color: string;
  /** Dashed outline instead of a solid one. */
  dashed: boolean;
  /**
   * `selected` = the thing being looked at (thick, on top), `dim` = everything
   * else while something is selected, `normal` = nothing is selected.
   */
  emphasis: 'selected' | 'normal' | 'dim';
  /** Short text drawn next to the rectangle. */
  caption?: string;
  /** What a click on the rectangle selects. Omitted → not clickable. */
  selectId?: string;
};

export type ImageOverlay = {
  /** In drawing order: later rectangles are painted (and hit) on top. */
  rects: ImageRect[];
  /** The area the zoom should keep in view (image pixels), or `null` for the whole image. */
  focus: ImageBox | null;
};
