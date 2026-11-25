import { describe, expect, it } from 'vitest';
import {
  bestViewsByObject,
  camerasByBestView,
  pickCamera,
  stepCamera,
  visibleFraction,
} from './pick';
import { cornersOf, det, multiCameraFrame, singleImageFrame, view } from './test-helpers';

describe('visibleFraction', () => {
  it('is 1 when the whole projected box is inside the photo', () => {
    expect(visibleFraction(det({ id: 'a', bbox: [100, 100, 200, 100], corners: cornersOf(100, 100, 200, 100) }))).toBe(1);
  });

  it('is the share of the box the photo contains', () => {
    // Uncut outline 200 wide starting 150 px left of the image: 50 px remain.
    const cut = det({ id: 'a', bbox: [0, 100, 50, 100], corners: cornersOf(-150, 100, 200, 100) });
    expect(visibleFraction(cut)).toBeCloseTo(0.25, 10);
  });

  it('takes a box without corners as fully visible', () => {
    expect(visibleFraction(det({ id: 'a' }))).toBe(1);
  });

  it('never exceeds 1 and is 0 for a degenerate box', () => {
    expect(visibleFraction(det({ id: 'a', bbox: [0, 0, 300, 300], corners: cornersOf(0, 0, 100, 100) }))).toBe(1);
    expect(visibleFraction(det({ id: 'a', bbox: [0, 0, 0, 50], corners: cornersOf(0, 0, 100, 100) }))).toBe(0);
    expect(visibleFraction(det({ id: 'a', bbox: [0, 0, 50, 50], corners: cornersOf(10, 10, 0, 100) }))).toBe(0);
  });
});

describe('pickCamera', () => {
  // "edge": cut off in the front camera (25% inside), whole in front-right.
  const frame = multiCameraFrame([
    view('CAM_FRONT', [
      { id: 'front-only' },
      { id: 'edge', bbox: [1550, 400, 50, 100], corners: cornersOf(1550, 400, 200, 100) },
    ]),
    view('CAM_FRONT_RIGHT', [{ id: 'edge', bbox: [100, 400, 200, 100], corners: cornersOf(100, 400, 200, 100) }]),
    view('CAM_BACK', [{ id: 'back-only' }]),
  ], 'frame-1', ['front-only', 'edge', 'back-only', 'unseen']);

  it('switches to the camera that sees the object', () => {
    expect(pickCamera(frame, 'back-only', 'CAM_FRONT')).toBe('CAM_BACK');
    expect(pickCamera(frame, 'front-only', 'CAM_BACK')).toBe('CAM_FRONT');
  });

  it('stays on the current camera when it already sees the object — even if a neighbour shows more', () => {
    expect(pickCamera(frame, 'edge', 'CAM_FRONT')).toBe('CAM_FRONT');
    expect(pickCamera(frame, 'edge', 'CAM_FRONT_RIGHT')).toBe('CAM_FRONT_RIGHT');
  });

  it('coming from elsewhere, picks the camera that shows more of the box', () => {
    expect(pickCamera(frame, 'edge', 'CAM_BACK')).toBe('CAM_FRONT_RIGHT');
    expect(pickCamera(frame, 'edge', null)).toBe('CAM_FRONT_RIGHT');
  });

  it('keeps the current camera when nothing is selected', () => {
    expect(pickCamera(frame, null, 'CAM_BACK')).toBe('CAM_BACK');
    expect(pickCamera(frame, undefined, 'CAM_BACK')).toBe('CAM_BACK');
    expect(pickCamera(frame, '', 'CAM_BACK')).toBe('CAM_BACK');
    expect(pickCamera(frame, null, null)).toBeNull();
  });

  it('keeps the current camera when no camera sees the object', () => {
    expect(pickCamera(frame, 'unseen', 'CAM_BACK')).toBe('CAM_BACK');
    expect(pickCamera(frame, 'not-in-this-frame', 'CAM_FRONT_RIGHT')).toBe('CAM_FRONT_RIGHT');
    // e.g. a false alarm's prediction id: not an object of any view.
    expect(pickCamera(frame, 'pred:frame-1:CAM_BACK:3', 'CAM_BACK')).toBe('CAM_BACK');
  });

  it('a current camera the frame does not have is replaced when the object is seen', () => {
    expect(pickCamera(frame, 'back-only', 'CAM_ROOF')).toBe('CAM_BACK');
    expect(pickCamera(frame, 'unseen', 'CAM_ROOF')).toBe('CAM_ROOF'); // caller decides the fallback
  });

  it('between equally complete views, prefers the one where the object is larger, then camera order', () => {
    const whole = (w: number, h: number) => ({ id: 'x', bbox: [10, 10, w, h] as [number, number, number, number], corners: cornersOf(10, 10, w, h) });
    const bigger = multiCameraFrame([view('A', []), view('B', [whole(100, 100)]), view('C', [whole(200, 100)])]);
    expect(pickCamera(bigger, 'x', 'A')).toBe('C');
    const equal = multiCameraFrame([view('A', []), view('B', [whole(100, 100)]), view('C', [whole(100, 100)])]);
    expect(pickCamera(equal, 'x', 'A')).toBe('B');
  });

  it('a mostly-cut large box loses to a whole small one', () => {
    const f = multiCameraFrame([
      view('A', []),
      view('B', [{ id: 'x', bbox: [0, 0, 400, 300], corners: cornersOf(-1200, 0, 1600, 300) }]), // 25% inside
      view('C', [{ id: 'x', bbox: [10, 10, 60, 40], corners: cornersOf(10, 10, 60, 40) }]),
    ]);
    expect(pickCamera(f, 'x', 'A')).toBe('C');
  });

  it('works on a frame without cameras', () => {
    const coco = singleImageFrame([{ id: 'x' }]);
    expect(pickCamera(coco, 'x', null)).toBe('');
    expect(pickCamera(coco, 'y', null)).toBeNull();
  });
});

describe('camerasByBestView / bestViewsByObject', () => {
  const frame = multiCameraFrame([
    view('CAM_FRONT', [
      { id: 'front-only' },
      { id: 'edge', bbox: [1550, 400, 50, 100], corners: cornersOf(1550, 400, 200, 100) },
    ]),
    view('CAM_FRONT_RIGHT', [{ id: 'edge', bbox: [100, 400, 200, 100], corners: cornersOf(100, 400, 200, 100) }]),
  ], 'frame-1', ['front-only', 'edge', 'unseen']);

  it('lists the cameras seeing an object, the more complete view first', () => {
    expect(camerasByBestView(frame, 'edge')).toEqual(['CAM_FRONT_RIGHT', 'CAM_FRONT']);
    expect(camerasByBestView(frame, 'front-only')).toEqual(['CAM_FRONT']);
    expect(camerasByBestView(frame, 'unseen')).toEqual([]);
  });

  it('its first entry is what pickCamera chooses from a camera that does not see the object', () => {
    for (const id of ['edge', 'front-only']) {
      expect(pickCamera(frame, id, 'CAM_BACK')).toBe(camerasByBestView(frame, id)[0]);
    }
  });

  it('the per-frame map agrees with the per-object answer and omits unseen objects', () => {
    const map = bestViewsByObject(frame);
    expect(map.get('edge')).toEqual(camerasByBestView(frame, 'edge'));
    expect(map.get('front-only')).toEqual(['CAM_FRONT']);
    expect(map.has('unseen')).toBe(false);
  });
});

describe('stepCamera', () => {
  const row = ['BL', 'FL', 'F', 'FR', 'BR', 'B'];

  it('moves to the neighbour', () => {
    expect(stepCamera(row, 'F', 1)).toBe('FR');
    expect(stepCamera(row, 'F', -1)).toBe('FL');
  });

  it('wraps: the cameras stand in a ring around the car', () => {
    expect(stepCamera(row, 'B', 1)).toBe('BL');
    expect(stepCamera(row, 'BL', -1)).toBe('B');
  });

  it('enters at the first / last camera when the current one is not in the row', () => {
    expect(stepCamera(row, null, 1)).toBe('BL');
    expect(stepCamera(row, 'ROOF', -1)).toBe('B');
  });

  it('a single camera stays; an empty row gives null', () => {
    expect(stepCamera(['F'], 'F', 1)).toBe('F');
    expect(stepCamera([], 'F', 1)).toBeNull();
  });
});
