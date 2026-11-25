import { describe, expect, it } from 'vitest';
import { multiCameraFrame, singleImageFrame, view } from './test-helpers';
import {
  SINGLE_VIEW,
  cameraViews,
  camerasByObject,
  camerasSeeing,
  defaultCameraName,
  detectionInCamera,
  frameAsCamera,
  hasCamera,
} from './views';

// "a" is only in front, "b" in front + front-right (overlap), "c" only behind,
// "d" exists in 3D but no camera sees it.
const frame = multiCameraFrame(
  [
    view('CAM_FRONT', [{ id: 'a' }, { id: 'b', bbox: [1500, 400, 100, 80] }]),
    view('CAM_FRONT_RIGHT', [{ id: 'b', bbox: [0, 400, 40, 80] }]),
    view('CAM_BACK', [{ id: 'c' }]),
  ],
  'frame-1',
  ['a', 'b', 'c', 'd'],
);

describe('cameraViews', () => {
  it('returns the frame cameras, default first', () => {
    expect(cameraViews(frame).map((v) => v.name)).toEqual(['CAM_FRONT', 'CAM_FRONT_RIGHT', 'CAM_BACK']);
    expect(defaultCameraName(frame)).toBe('CAM_FRONT');
  });

  it('treats a frame without cameras (COCO) as one unnamed view of its image', () => {
    const coco = singleImageFrame([{ id: 'x' }]);
    const views = cameraViews(coco);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ name: SINGLE_VIEW, imageUrl: coco.imageUrl, imageWidth: 640, imageHeight: 480 });
    expect(views[0].detections2D).toBe(coco.detections2D);
    expect(defaultCameraName(coco)).toBe(SINGLE_VIEW);
  });

  it('treats an empty cameras list like no list', () => {
    const empty = { ...singleImageFrame([{ id: 'x' }]), cameras: [] };
    expect(cameraViews(empty)).toHaveLength(1);
  });
});

describe('hasCamera', () => {
  it('knows the frame cameras and nothing else', () => {
    expect(hasCamera(frame, 'CAM_BACK')).toBe(true);
    expect(hasCamera(frame, 'CAM_BACK_LEFT')).toBe(false);
    expect(hasCamera(frame, null)).toBe(false);
    expect(hasCamera(frame, undefined)).toBe(false);
  });
});

describe('frameAsCamera', () => {
  it('swaps in the photo and the 2D boxes of the named camera', () => {
    const back = frameAsCamera(frame, 'CAM_BACK');
    expect(back.imageUrl).toBe('/img/CAM_BACK.jpg');
    expect(back.detections2D.map((d) => d.id)).toEqual(['c']);
    expect(back.detections2D).toBe(frame.cameras?.[2].detections2D);
  });

  it('shares everything that is not about the photo: same moment, same objects', () => {
    const back = frameAsCamera(frame, 'CAM_BACK');
    expect(back.id).toBe(frame.id);
    expect(back.detections3D).toBe(frame.detections3D);
    expect(back.pointCloud).toBe(frame.pointCloud);
    expect(back.source).toBe(frame.source);
    expect(back.cameras).toBe(frame.cameras);
  });

  it('keeps the object id across cameras (Rule #1)', () => {
    const front = frameAsCamera(frame, 'CAM_FRONT').detections2D.find((d) => d.id === 'b');
    const right = frameAsCamera(frame, 'CAM_FRONT_RIGHT').detections2D.find((d) => d.id === 'b');
    expect(front?.id).toBe('b');
    expect(right?.id).toBe('b');
    expect(front?.bbox).not.toEqual(right?.bbox); // one object, two different views
  });

  it('returns the SAME frame object for the default camera, an unknown name, or no name', () => {
    expect(frameAsCamera(frame, 'CAM_FRONT')).toBe(frame);
    expect(frameAsCamera(frame, 'CAM_ROOF')).toBe(frame);
    expect(frameAsCamera(frame, null)).toBe(frame);
    expect(frameAsCamera(frame, undefined)).toBe(frame);
  });

  it('leaves a frame without cameras untouched', () => {
    const coco = singleImageFrame([{ id: 'x' }]);
    expect(frameAsCamera(coco, 'CAM_FRONT')).toBe(coco);
    expect(frameAsCamera(coco, SINGLE_VIEW)).toBe(coco);
  });

  it('does not modify the original frame', () => {
    const before = JSON.stringify(frame);
    frameAsCamera(frame, 'CAM_BACK');
    expect(JSON.stringify(frame)).toBe(before);
  });
});

describe('camerasSeeing', () => {
  it('lists every camera that has a 2D box of the object, in camera order', () => {
    expect(camerasSeeing(frame, 'a')).toEqual(['CAM_FRONT']);
    expect(camerasSeeing(frame, 'b')).toEqual(['CAM_FRONT', 'CAM_FRONT_RIGHT']);
    expect(camerasSeeing(frame, 'c')).toEqual(['CAM_BACK']);
  });

  it('is empty for a 3D box no camera sees, and for an unknown object', () => {
    expect(camerasSeeing(frame, 'd')).toEqual([]);
    expect(camerasSeeing(frame, 'nope')).toEqual([]);
  });

  it('answers for the DEFAULT camera only if the caller reads frame.detections2D — which is the trap this function exists for', () => {
    const inDefault = new Set(frame.detections2D.map((d) => d.id));
    expect(inDefault.has('c')).toBe(false); // "not in camera" by the old, one-camera reading
    expect(camerasSeeing(frame, 'c')).toHaveLength(1); // seen, by the rear camera
  });

  it('works on a frame without cameras', () => {
    const coco = singleImageFrame([{ id: 'x' }]);
    expect(camerasSeeing(coco, 'x')).toEqual([SINGLE_VIEW]);
    expect(camerasSeeing(coco, 'y')).toEqual([]);
  });
});

describe('camerasByObject', () => {
  it('agrees with camerasSeeing for every object of the frame', () => {
    const byObject = camerasByObject(frame);
    for (const box of frame.detections3D) {
      expect(byObject.get(box.id) ?? []).toEqual(camerasSeeing(frame, box.id));
    }
  });

  it('has no entry for an object no camera sees', () => {
    expect(camerasByObject(frame).has('d')).toBe(false);
  });
});

describe('detectionInCamera', () => {
  it('finds the object in the named photo', () => {
    expect(detectionInCamera(frame, 'b', 'CAM_FRONT_RIGHT')?.bbox).toEqual({ x: 0, y: 400, width: 40, height: 80 });
  });

  it('is undefined when that camera does not see it or does not exist', () => {
    expect(detectionInCamera(frame, 'a', 'CAM_BACK')).toBeUndefined();
    expect(detectionInCamera(frame, 'a', 'CAM_ROOF')).toBeUndefined();
  });
});
