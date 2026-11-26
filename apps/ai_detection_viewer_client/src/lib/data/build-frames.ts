import { parseCoco } from '@/lib/coco';
import { cameraViews } from '@/lib/cameras';
import { enrichFrame } from '@/lib/geometry';
import { parseNuScenes } from '@/lib/nuscenes';
import { makePracticeSet, type PlantedError } from '@/lib/review';
import type { Frame } from '@/lib/types';

/** The dataset formats the app can open. */
export type DatasetKind = 'coco' | 'nuscenes';

/**
 * Frames ready to render, plus what they ARE:
 *  - `planted === null` → the dataset's own annotations;
 *  - an array → the practice set (F4-F), with its answer key.
 * The two travel together so nothing can show practice data and call it the
 * real annotations (or the reverse) for even one render.
 */
export type BuiltDataset = {
  frames: Frame[];
  planted: PlantedError[] | null;
};

/**
 * Turn a fetched dataset file into the frames the app renders.
 *
 * No React, no store, no network. It only decides WHICH parser runs and in what
 * order — all parsing and coordinate math stay in `lib/coco`, `lib/nuscenes`
 * and `lib/geometry` (Immutable Rule #3). For nuScenes the same input always
 * gives the same frames; COCO's generated point cloud is random per call (it is
 * a visual stand-in made by `enrichFrame`, not data), its boxes are not.
 *
 *  - COCO: parse, then estimate 3D (`enrichFrame`). Estimated, never measured
 *    (Rule #6).
 *  - nuScenes: `parseNuScenes` already returns measured, complete frames — they
 *    must NOT be estimated again.
 *  - nuScenes + `practice`: a few boxes are modified in the RAW data, then the
 *    result is parsed as usual, so the 3D boxes, the camera projections and the
 *    ids all follow from the same modified values. The input is not mutated.
 *
 * Invalid input does not throw: the parsers report it and return no frames
 * (Error Defaults), so the caller renders the empty state.
 */
export function buildFrames(
  kind: DatasetKind,
  raw: unknown,
  options: { practice?: boolean } = {},
): BuiltDataset {
  if (kind === 'coco') {
    return { frames: parseCoco(raw).map((frame) => enrichFrame(frame)), planted: null };
  }
  if (!options.practice) {
    return { frames: parseNuScenes(raw), planted: null };
  }

  // Which boxes a camera sees decides where an error is FAIR (a wrong class can
  // only be recognised in the photo). That needs one plain parse of the
  // original data first; the practice set is parsed after.
  // (F6) "A camera sees it" = ANY of the frame's cameras does.
  const seen = new Set(
    parseNuScenes(raw).flatMap((frame) =>
      cameraViews(frame).flatMap((view) => view.detections2D.map((d) => `${frame.id}/${d.id}`)),
    ),
  );
  const set = makePracticeSet(raw, {
    inCamera: (frameToken, instanceToken) => seen.has(`${frameToken}/${instanceToken}`),
  });
  return { frames: parseNuScenes(set.prepped), planted: set.planted };
}
