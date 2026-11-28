import { describe, expect, it } from 'vitest';
import { cameraViews } from '@/lib/cameras';
import { parseNuScenes, parseSceneCatalog } from '@/lib/nuscenes';
import type { NuScenesPrepped } from '@/lib/nuscenes';
import { readPublicJson } from '@/lib/nuscenes/test-helpers';
import type { Frame } from '@/lib/types';
import { boxValuesOf, type BoxValues } from './box';
import { applyEdits, canEditFrame, replaceBoxes } from './overlay';
import { withEdit, type EditMap } from './records';

/**
 * The SHIPPED boxes (all of nuScenes-mini: 10 scenes, 404 frames, 18,538 boxes).
 *
 * Box editing rests on two facts about this data, which were measured before
 * the feature was designed (F8 design doc §2.2, §2.3) and are locked here:
 *  1. a nuScenes box is turned about the vertical axis only, so seven numbers
 *     describe it completely;
 *  2. taking a parsed box back to those seven numbers and rebuilding it — the
 *     3D box and its rectangle in all six photos — gives the parser's own box.
 * If the data is regenerated differently, or the conversion drifts from the
 * parser, this fails.
 */
const catalog = parseSceneCatalog(readPublicJson('/sample-data/nuscenes/scenes.json'));
if (!catalog) throw new Error('scenes.json did not parse');

type Loaded = { name: string; raw: NuScenesPrepped; frames: Frame[] };
const scenes: Loaded[] = catalog.scenes.map((scene) => {
  const raw = readPublicJson(scene.framesUrl) as NuScenesPrepped;
  return { name: scene.name, raw, frames: parseNuScenes(raw) };
});

describe('shipped boxes: what the seven numbers rest on', () => {
  it('every frame can be edited (it carries its ego pose and six calibrated cameras)', () => {
    const frames = scenes.flatMap((scene) => scene.frames);
    expect(frames).toHaveLength(404);
    expect(frames.every(canEditFrame)).toBe(true);
    expect(frames.every((frame) => frame.cameras?.length === 6)).toBe(true);
  });

  it('no box is tipped: the rotation in the file is about the vertical axis only', () => {
    let boxes = 0;
    let worst = 0;
    for (const scene of scenes) {
      for (const frame of scene.raw.frames) {
        for (const annotation of frame.annotations) {
          boxes += 1;
          // [w, x, y, z]: x and y are zero for a rotation about z.
          worst = Math.max(worst, Math.hypot(annotation.rotation[1], annotation.rotation[2]));
        }
      }
    }
    expect(boxes).toBe(18538);
    expect(worst).toBeLessThan(1e-7);
  });

  it('the seven numbers of every parsed box are the numbers in the file', () => {
    let boxes = 0;
    let worstCentre = 0;
    let worstYaw = 0;
    for (const scene of scenes) {
      scene.raw.frames.forEach((rawFrame, index) => {
        const frame = scene.frames[index];
        const byId = new Map(rawFrame.annotations.map((a) => [a.instanceToken, a]));
        for (const detection of frame.detections3D) {
          const annotation = byId.get(detection.id);
          if (!annotation || !frame.egoPose) throw new Error('box without its annotation');
          const values = boxValuesOf(detection.bbox3D, frame.egoPose);
          boxes += 1;
          for (let i = 0; i < 3; i += 1) {
            worstCentre = Math.max(worstCentre, Math.abs(values.translation[i] - annotation.translation[i]));
          }
          expect(values.size).toEqual(annotation.size); // exact
          const [w, , , z] = annotation.rotation;
          const fileYaw = 2 * Math.atan2(z, w);
          worstYaw = Math.max(worstYaw, Math.abs(Math.sin((values.yaw - fileYaw) / 2)));
        }
      });
    }
    expect(boxes).toBe(18538);
    expect(worstCentre).toBeLessThan(1e-9); // measured: 2.3e-13 m
    expect(worstYaw).toBeLessThan(1e-9);
  });
});

describe('shipped boxes: an edit rebuilds a box exactly as the parser built it', () => {
  it('rebuilding EVERY box from its own seven numbers gives the parsed frames back', () => {
    let boxes = 0;
    let rectangles = 0;
    let worstCentre = 0;
    let worstPixel = 0;
    for (const scene of scenes) {
      for (const frame of scene.frames) {
        if (!frame.egoPose) throw new Error('frame without ego pose');
        const egoPose = frame.egoPose;
        const all = new Map<string, BoxValues>(
          frame.detections3D.map((d) => [d.id, boxValuesOf(d.bbox3D, egoPose)]),
        );
        const rebuilt = replaceBoxes(frame, all);
        rebuilt.detections3D.forEach((detection, i) => {
          const original = frame.detections3D[i];
          boxes += 1;
          expect(detection.id).toBe(original.id);
          expect(detection.bbox3D.size).toEqual(original.bbox3D.size);
          for (let k = 0; k < 3; k += 1) {
            worstCentre = Math.max(worstCentre, Math.abs(detection.bbox3D.center[k] - original.bbox3D.center[k]));
          }
        });
        cameraViews(rebuilt).forEach((view, v) => {
          const original = cameraViews(frame)[v].detections2D;
          // the same boxes, in the same order, in every photo
          expect(view.detections2D.map((d) => d.id)).toEqual(original.map((d) => d.id));
          view.detections2D.forEach((detection, i) => {
            rectangles += 1;
            const a = detection.bbox;
            const b = original[i].bbox;
            worstPixel = Math.max(
              worstPixel,
              Math.abs(a.x - b.x),
              Math.abs(a.y - b.y),
              Math.abs(a.width - b.width),
              Math.abs(a.height - b.height),
            );
          });
        });
      }
    }
    expect(boxes).toBe(18538);
    expect(rectangles).toBe(22081);
    expect(worstCentre).toBeLessThan(1e-9); // measured: 3.4e-13 m
    expect(worstPixel).toBeLessThan(1e-6); // measured: 5.3e-12 px
  });

  it('works on the frame with the most boxes (scene-0061, frame 20: 156)', () => {
    const scene = scenes.find((s) => s.name === 'scene-0061');
    const frame = scene?.frames[19];
    if (!frame || !frame.egoPose) throw new Error('frame not found');
    expect(frame.detections3D).toHaveLength(156);
    const egoPose = frame.egoPose;
    let edits: EditMap = {};
    for (const detection of frame.detections3D) {
      const values = boxValuesOf(detection.bbox3D, egoPose);
      edits = withEdit(edits, frame.id, detection.id, { ...values, yaw: values.yaw + 0.1 }, '');
    }
    const edited = applyEdits(frame, edits);
    expect(edited.detections3D).toHaveLength(156);
    expect(edited.detections3D.every((d, i) => d.id === frame.detections3D[i].id)).toBe(true);
  });
});
