import type { CameraView, Detection2D, Detection3D, Frame } from '@/lib/types';
import { boxInCamera, boxInFrame, type ProjectionCamera } from '@/lib/nuscenes/box-views';
import { boxValuesOf, toGlobalGeometry, type BoxValues } from './box';
import { getEdit, valuesOfEdit, type EditMap } from './records';

/**
 * Laying edits over a frame (F8).
 *
 * The data is never changed. These functions return a NEW frame in which the
 * edited boxes are rebuilt from their new values — the 3D box and its rectangle
 * in every camera's photo — by the same two functions the parser used for the
 * originals (`lib/nuscenes/box-views`). Ids are untouched, so the 3D box and
 * its 2D boxes still share one id (Immutable Rule #1), and a box the edit does
 * not touch is the very same object as before.
 *
 * Pure (Immutable Rule #3): no React, no store.
 */

/**
 * Whether the boxes of this frame can be edited: the frame must carry what is
 * needed to take a box back to the dataset's terms and project it again. True
 * for nuScenes frames; false for COCO (its 3D is estimated — there is no
 * measured box to edit, Rule #6) and for data without calibration.
 */
export function canEditFrame(frame: Frame): boolean {
  return (
    frame.egoPose !== undefined &&
    frame.cameras !== undefined &&
    frame.cameras.length > 0 &&
    frame.cameras.every((view) => view.calibration !== undefined)
  );
}

/** The dataset's values of a box of this frame, or `null` when it cannot be edited / is not there. */
export function labelValuesOf(frame: Frame, objectId: string): BoxValues | null {
  if (!frame.egoPose) return null;
  const box = frame.detections3D.find((d) => d.id === objectId);
  return box ? boxValuesOf(box.bbox3D, frame.egoPose) : null;
}

function cameraOf(view: CameraView): ProjectionCamera | null {
  if (!view.calibration) return null;
  return {
    egoPose: view.calibration.egoPose,
    sensor: view.calibration.sensor,
    intrinsic: view.calibration.intrinsic,
    imageWidth: view.imageWidth,
    imageHeight: view.imageHeight,
  };
}

/**
 * The frame with the given boxes replaced. `changes` maps object id → new
 * values. Returns the SAME frame when no listed object is in it or the frame
 * cannot be edited, so callers can keep memoised results.
 *
 * In each photo the boxes keep the order of the frame's 3D boxes (the order
 * the parser produces), also when an edit makes a box appear in a photo it
 * was not in before, or leave one it was in.
 */
export function replaceBoxes(frame: Frame, changes: ReadonlyMap<string, BoxValues>): Frame {
  if (changes.size === 0 || !canEditFrame(frame) || !frame.egoPose || !frame.cameras) return frame;
  if (!frame.detections3D.some((d) => changes.has(d.id))) return frame;
  const egoPose = frame.egoPose;

  const detections3D: Detection3D[] = frame.detections3D.map((detection) => {
    const values = changes.get(detection.id);
    return values
      ? { ...detection, bbox3D: boxInFrame(toGlobalGeometry(values), egoPose) }
      : detection;
  });

  const cameras: CameraView[] = frame.cameras.map((view) => {
    const camera = cameraOf(view);
    if (!camera) return view;
    const existing = new Map(view.detections2D.map((d) => [d.id, d]));
    const detections2D: Detection2D[] = [];
    for (const detection of frame.detections3D) {
      const values = changes.get(detection.id);
      if (!values) {
        const kept = existing.get(detection.id);
        if (kept) detections2D.push(kept);
        continue;
      }
      const projected = boxInCamera(toGlobalGeometry(values), camera);
      if (projected) {
        detections2D.push({
          id: detection.id,
          class: detection.class,
          confidence: detection.confidence,
          ...projected,
        });
      }
    }
    return { ...view, detections2D };
  });

  // The top-level image fields are the default camera's view — the same array
  // (the invariant of `Frame.cameras`).
  return { ...frame, detections3D, detections2D: cameras[0].detections2D, cameras };
}

/** The ids of this frame's boxes that have an edit record. */
export function editedIdsOf(frame: Frame, edits: EditMap): Set<string> {
  const ids = new Set<string>();
  for (const detection of frame.detections3D) {
    if (getEdit(edits, frame.id, detection.id)) ids.add(detection.id);
  }
  return ids;
}

/**
 * The frame with every stored edit of it laid over. The same frame object when
 * none applies. An edit whose box is not in the frame is ignored (it stays in
 * the store; it is simply not about anything on screen).
 */
export function applyEdits(frame: Frame, edits: EditMap): Frame {
  let changes: Map<string, BoxValues> | null = null;
  for (const detection of frame.detections3D) {
    const edit = getEdit(edits, frame.id, detection.id);
    if (!edit) continue;
    changes ??= new Map();
    changes.set(detection.id, valuesOfEdit(edit));
  }
  return changes ? replaceBoxes(frame, changes) : frame;
}

/**
 * How many boxes of these frames have an edit record.
 *
 * Counted from the RECORDS (a handful) rather than by visiting every box, and
 * a record whose frame or box is not among `frames` is not counted: a stale
 * record (the data changed, the storage was hand-edited) is laid over nothing
 * and is in no export, so it must not be in a count either.
 */
export function countEdited(frames: Iterable<Frame>, edits: EditMap): number {
  const records = Object.values(edits);
  if (records.length === 0) return 0;
  const byId = new Map<string, Frame>();
  for (const frame of frames) byId.set(frame.id, frame);
  let count = 0;
  for (const record of records) {
    const frame = byId.get(record.frameId);
    if (frame?.detections3D.some((detection) => detection.id === record.objectId)) count += 1;
  }
  return count;
}
