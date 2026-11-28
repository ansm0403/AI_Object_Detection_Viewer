import { describe, expect, it } from 'vitest';
import { cameraViews } from '@/lib/cameras';
import type { Frame } from '@/lib/types';
import { makeBevProjector } from './bev';
import { type BoxValues } from './box';
import { dragBox, nudgeBox } from './gestures';
import {
  applyEdits,
  canEditFrame,
  countEdited,
  editedIdsOf,
  labelValuesOf,
  replaceBoxes,
} from './overlay';
import { withEdit, type EditMap } from './records';
import { must, referenceFrames } from './test-helpers';

const box3D = (frame: Frame, id: string) => must(frame.detections3D.find((d) => d.id === id), '3D box');
const box2D = (view: { detections2D: Frame['detections2D'] }, id: string) =>
  must(view.detections2D.find((d) => d.id === id), '2D box');

const AT = '2026-11-27T08:00:00.000Z';

/** A box of the frame that at least one camera shows, with its label values. */
function seenBox(frame: Frame): { id: string; label: BoxValues } {
  const seen = new Set(cameraViews(frame).flatMap((view) => view.detections2D.map((d) => d.id)));
  const box = frame.detections3D.find((d) => seen.has(d.id));
  if (!box) throw new Error('no box seen by a camera');
  const label = labelValuesOf(frame, box.id);
  if (!label) throw new Error('no label values');
  return { id: box.id, label };
}

describe('canEditFrame / labelValuesOf', () => {
  it('a parsed nuScenes frame can be edited', () => {
    expect(canEditFrame(referenceFrames()[0])).toBe(true);
  });

  it('a frame without the ego pose or a camera calibration cannot', () => {
    const frame = referenceFrames()[0];
    expect(canEditFrame({ ...frame, egoPose: undefined })).toBe(false);
    expect(canEditFrame({ ...frame, cameras: undefined })).toBe(false);
    const oneWithout = must(frame.cameras).map((view, i) => (i === 2 ? { ...view, calibration: undefined } : view));
    expect(canEditFrame({ ...frame, cameras: oneWithout })).toBe(false);
  });

  it('labelValuesOf is null for an object that is not in the frame', () => {
    expect(labelValuesOf(referenceFrames()[0], 'no-such-object')).toBeNull();
  });
});

describe('replaceBoxes', () => {
  const frame = referenceFrames()[0];
  const { id, label } = seenBox(frame);
  const moved = nudgeBox(label, [0.6, -0.4], makeBevProjector(must(frame.egoPose)));

  it('returns the same frame when there is nothing to replace', () => {
    expect(replaceBoxes(frame, new Map())).toBe(frame);
    expect(replaceBoxes(frame, new Map([['no-such-object', moved]]))).toBe(frame);
  });

  it('returns the same frame when the frame cannot be edited', () => {
    const plain = { ...frame, egoPose: undefined };
    expect(replaceBoxes(plain, new Map([[id, moved]]))).toBe(plain);
  });

  it('never changes the frame it was given', () => {
    const before = JSON.stringify(frame);
    replaceBoxes(frame, new Map([[id, moved]]));
    expect(JSON.stringify(frame)).toBe(before);
  });

  it('rebuilds only the listed box; every other box is the very same object', () => {
    const next = replaceBoxes(frame, new Map([[id, moved]]));
    expect(next).not.toBe(frame);
    next.detections3D.forEach((detection, i) => {
      if (detection.id === id) expect(detection).not.toBe(frame.detections3D[i]);
      else expect(detection).toBe(frame.detections3D[i]);
    });
    cameraViews(next).forEach((view, v) => {
      const original = new Map(cameraViews(frame)[v].detections2D.map((d) => [d.id, d]));
      for (const detection of view.detections2D) {
        if (detection.id !== id) expect(detection).toBe(original.get(detection.id));
      }
    });
  });

  it('keeps the ids, the class and the annotation facts of the edited box (Rule #1)', () => {
    const next = replaceBoxes(frame, new Map([[id, moved]]));
    const before = box3D(frame, id);
    const after = box3D(next, id);
    expect(after.id).toBe(before.id);
    expect(after.class).toBe(before.class);
    expect(after.annotation).toBe(before.annotation);
    for (const view of cameraViews(next)) {
      const d2 = view.detections2D.find((d) => d.id === id);
      if (d2) expect(d2.class).toBe(before.class);
    }
  });

  it('moves the 3D box and its rectangle in the photos that show it', () => {
    const next = replaceBoxes(frame, new Map([[id, moved]]));
    const before = box3D(frame, id).bbox3D.center;
    const after = box3D(next, id).bbox3D.center;
    // 0.6 m right and 0.4 m forward in the top view = render x +0.6, z -0.4.
    expect(after[0] - before[0]).toBeCloseTo(0.6, 6);
    expect(after[2] - before[2]).toBeCloseTo(-0.4, 6);
    let changed = 0;
    cameraViews(frame).forEach((view, v) => {
      const a = view.detections2D.find((d) => d.id === id);
      const b = cameraViews(next)[v].detections2D.find((d) => d.id === id);
      if (a && b && a.bbox.x !== b.bbox.x) changed += 1;
    });
    expect(changed).toBeGreaterThan(0);
  });

  it('keeps the invariant: the top-level 2D boxes ARE the first camera view', () => {
    const next = replaceBoxes(frame, new Map([[id, moved]]));
    expect(next.detections2D).toBe(must(next.cameras)[0].detections2D);
  });

  it('keeps each photo in the order of the frame boxes', () => {
    const next = replaceBoxes(frame, new Map([[id, moved]]));
    const order = new Map(next.detections3D.map((d, i) => [d.id, i]));
    for (const view of cameraViews(next)) {
      const positions = view.detections2D.map((d) => must(order.get(d.id)));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('drops the box from a photo it leaves, and adds it to one it enters', () => {
    // A box the FRONT camera shows, moved to the same distance BEHIND the car.
    const front = must(frame.cameras)[0];
    expect(front.name).toBe('CAM_FRONT');
    const frontId = front.detections2D[0].id;
    const frontLabel = must(labelValuesOf(frame, frontId));
    const projector = makeBevProjector(must(frame.egoPose));
    const [, ahead] = projector.toBev(frontLabel.translation); // negative = ahead
    const behind = nudgeBox(frontLabel, [0, -2 * ahead], projector);
    const next = replaceBoxes(frame, new Map([[frontId, behind]]));
    const seenBy = (f: Frame) =>
      cameraViews(f).filter((v) => v.detections2D.some((d) => d.id === frontId)).map((v) => v.name);
    expect(seenBy(frame)).toContain('CAM_FRONT');
    expect(seenBy(next)).not.toContain('CAM_FRONT');
    expect(seenBy(next)).toContain('CAM_BACK');
    // the 3D box is still there, and no box was lost or added
    expect(next.detections3D.some((d) => d.id === frontId)).toBe(true);
    expect(next.detections3D).toHaveLength(frame.detections3D.length);
  });

  it('resizing through a drag changes the projected rectangle too', () => {
    const wider = dragBox(label, 'left', [0, 0, 0], [-Math.sin(label.yaw), Math.cos(label.yaw), 0]);
    expect(wider.size[0]).toBeCloseTo(label.size[0] + 1, 9);
    const next = replaceBoxes(frame, new Map([[id, wider]]));
    const view = must(cameraViews(next).find((v) => v.detections2D.some((d) => d.id === id)));
    const before = box2D(must(cameraViews(frame).find((v) => v.name === view.name)), id);
    const after = box2D(view, id);
    expect(after.bbox.width * after.bbox.height).not.toBeCloseTo(before.bbox.width * before.bbox.height, 3);
  });
});

describe('applyEdits', () => {
  const frames = referenceFrames();
  const frame = frames[0];
  const { id, label } = seenBox(frame);
  const edited: BoxValues = { ...label, size: [label.size[0], label.size[1] + 0.5, label.size[2]] };

  it('returns the same frame when no edit is about it', () => {
    expect(applyEdits(frame, {})).toBe(frame);
    // an edit of the same object in ANOTHER frame is not about this one
    const elsewhere = withEdit({}, frames[1].id, id, edited, AT);
    expect(applyEdits(frame, elsewhere)).toBe(frame);
  });

  it('lays a stored edit over the frame', () => {
    const edits = withEdit({}, frame.id, id, edited, AT);
    const next = applyEdits(frame, edits);
    // render-frame size is [length, width, height]
    expect(box3D(next, id).bbox3D.size[0]).toBeCloseTo(label.size[1] + 0.5, 12);
    expect(must(labelValuesOf(next, id)).size[1]).toBeCloseTo(label.size[1] + 0.5, 9);
  });

  it('ignores an edit whose box is not in the data', () => {
    const edits = withEdit({}, frame.id, 'gone', edited, AT);
    expect(applyEdits(frame, edits)).toBe(frame);
  });

  it('an edit with the label values draws the label box again (to rounding)', () => {
    const edits = withEdit({}, frame.id, id, label, AT);
    const next = applyEdits(frame, edits);
    const a = box3D(frame, id).bbox3D;
    const b = box3D(next, id).bbox3D;
    b.center.forEach((value, i) => expect(value).toBeCloseTo(a.center[i], 9));
    expect(b.size).toEqual(a.size);
  });

  it('editedIdsOf and countEdited count the boxes that have an edit', () => {
    let edits: EditMap = withEdit({}, frame.id, id, edited, AT);
    edits = withEdit(edits, frames[1].id, frames[1].detections3D[0].id, edited, AT);
    edits = withEdit(edits, frame.id, 'gone', edited, AT); // not in the data: not counted
    expect([...editedIdsOf(frame, edits)]).toEqual([id]);
    expect(countEdited(frames, edits)).toBe(2);
    expect(countEdited(frames, {})).toBe(0);
    // a record whose frame or box is not there (stale storage) is not counted
    const stale = withEdit(
      withEdit(edits, 'no-such-frame', 'x', edited, AT),
      frames[0].id,
      'no-such-box',
      edited,
      AT,
    );
    expect(Object.keys(stale).length).toBe(Object.keys(edits).length + 2);
    expect(countEdited(frames, stale)).toBe(2);
    // only the frames given are counted
    expect(countEdited([], edits)).toBe(0);
  });
});
