import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cameraOfPredictionId,
  frameOfPredictionId,
  isPredictionId,
  parsePredictions,
  predictionId,
} from './parse';

const MODEL = { name: 'yolov8n', library: 'ultralytics 8.4.51', imageSize: 1280, minScore: 0.05 };
/** A file in the F5 format: one camera for the whole file, one list per frame. */
const fileV1 = (frames: unknown, extra: Record<string, unknown> = {}) => ({
  format: 'ai-detection-viewer/predictions@1',
  camera: 'CAM_FRONT',
  model: MODEL,
  frames,
  ...extra,
});
/** A file in the F6 format: one list per camera in every frame. */
const fileV2 = (frames: unknown, extra: Record<string, unknown> = {}) => ({
  format: 'ai-detection-viewer/predictions@2',
  cameras: ['CAM_FRONT', 'CAM_BACK'],
  model: MODEL,
  frames,
  ...extra,
});
const raw = (cls: string, score: number, bbox: unknown = [10, 20, 30, 40]) => ({
  class: cls,
  score,
  bbox,
});

afterEach(() => vi.restoreAllMocks());

describe('parsePredictions — format @2 (one list per camera)', () => {
  it('reads the model info, the cameras and each photo’s predictions', () => {
    const set = parsePredictions(
      fileV2([
        { token: 'f1', cameras: { CAM_FRONT: [raw('person', 0.9)], CAM_BACK: [raw('bus', 0.7)] } },
      ]),
    );
    expect(set?.model).toEqual(MODEL);
    expect(set?.cameras).toEqual(['CAM_FRONT', 'CAM_BACK']);
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')).toEqual([
      { id: 'pred:f1:CAM_FRONT:0', class: 'person', score: 0.9, bbox: { x: 10, y: 20, width: 30, height: 40 } },
    ]);
    expect(set?.byFrame.get('f1')?.get('CAM_BACK')?.[0]).toMatchObject({ id: 'pred:f1:CAM_BACK:0', class: 'bus' });
  });

  it('the same position in two photos of one frame gets two different ids', () => {
    const set = parsePredictions(
      fileV2([{ token: 'f1', cameras: { CAM_FRONT: [raw('car', 0.9)], CAM_BACK: [raw('car', 0.9)] } }]),
    );
    const ids = [...(set?.byFrame.get('f1')?.values() ?? [])].flat().map((p) => p.id);
    expect(ids).toEqual(['pred:f1:CAM_FRONT:0', 'pred:f1:CAM_BACK:0']);
  });

  it('orders each photo by score and keeps the FILE index in the id', () => {
    const set = parsePredictions(
      fileV2([{ token: 'f1', cameras: { CAM_BACK: [raw('car', 0.2), raw('car', 0.8), raw('car', 0.5)] } }]),
    );
    expect(set?.byFrame.get('f1')?.get('CAM_BACK')?.map((p) => [p.id, p.score])).toEqual([
      ['pred:f1:CAM_BACK:1', 0.8],
      ['pred:f1:CAM_BACK:2', 0.5],
      ['pred:f1:CAM_BACK:0', 0.2],
    ]);
  });

  it('keeps "the photo was run and nothing was found" apart from "the photo was not run"', () => {
    const set = parsePredictions(fileV2([{ token: 'f1', cameras: { CAM_FRONT: [] } }]));
    const frame = set?.byFrame.get('f1');
    expect(frame?.get('CAM_FRONT')).toEqual([]); // run, empty
    expect(frame?.has('CAM_BACK')).toBe(false); // not run
  });

  it('a frame entry with no camera at all is kept as an empty entry', () => {
    const set = parsePredictions(fileV2([{ token: 'f1', cameras: {} }]));
    expect(set?.byFrame.get('f1')?.size).toBe(0);
  });

  it('skips a camera entry that is not a list, and counts it in the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = parsePredictions(
      fileV2([{ token: 'f1', cameras: { CAM_FRONT: [raw('car', 0.9)], CAM_BACK: 'oops', '': [] } }]),
    );
    expect([...(set?.byFrame.get('f1')?.keys() ?? [])]).toEqual(['CAM_FRONT']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('2 malformed camera entries');
  });

  it('lists the cameras the file HAS: declared order first, undeclared ones after, absent ones dropped', () => {
    const set = parsePredictions(
      fileV2(
        [{ token: 'f1', cameras: { CAM_SIDE: [], CAM_BACK: [] } }],
        { cameras: ['CAM_FRONT', 'CAM_BACK', 7, 'CAM_BACK'] },
      ),
    );
    expect(set?.cameras).toEqual(['CAM_BACK', 'CAM_SIDE']);
  });

  it('without a declared list, the cameras are in the order they first appear', () => {
    const set = parsePredictions(
      fileV2(
        [
          { token: 'f1', cameras: { CAM_BACK: [] } },
          { token: 'f2', cameras: { CAM_FRONT: [], CAM_BACK: [] } },
        ],
        { cameras: undefined },
      ),
    );
    expect(set?.cameras).toEqual(['CAM_BACK', 'CAM_FRONT']);
  });
});

describe('parsePredictions — format @1 (F5 files stay readable)', () => {
  it('reads a frame’s one list as the file’s one camera', () => {
    const set = parsePredictions(fileV1([{ token: 'f1', predictions: [raw('person', 0.9)] }]));
    expect(set?.model).toEqual(MODEL);
    expect(set?.cameras).toEqual(['CAM_FRONT']);
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')).toEqual([
      { id: 'pred:f1:CAM_FRONT:0', class: 'person', score: 0.9, bbox: { x: 10, y: 20, width: 30, height: 40 } },
    ]);
  });

  it('a file that names no camera is CAM_FRONT (the only camera such files ever had)', () => {
    const set = parsePredictions(fileV1([{ token: 'f1', predictions: [] }], { camera: undefined }));
    expect(set?.cameras).toEqual(['CAM_FRONT']);
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')).toEqual([]);
  });

  it('uses the camera the file names', () => {
    const set = parsePredictions(fileV1([{ token: 'f1', predictions: [] }], { camera: 'CAM_BACK' }));
    expect(set?.cameras).toEqual(['CAM_BACK']);
  });

  it('reads each frame by its own shape, whatever the format string says', () => {
    const set = parsePredictions(
      fileV1(
        [
          { token: 'f1', predictions: [raw('car', 0.5)] },
          { token: 'f2', cameras: { CAM_BACK: [raw('bus', 0.5)] } },
        ],
        { format: 'something-else' },
      ),
    );
    expect([...(set?.byFrame.get('f1')?.keys() ?? [])]).toEqual(['CAM_FRONT']);
    expect([...(set?.byFrame.get('f2')?.keys() ?? [])]).toEqual(['CAM_BACK']);
  });
});

describe('parsePredictions — defensive behaviour (both formats)', () => {
  it('keeps every class and every score: filtering is the selectors’ job', () => {
    const set = parsePredictions(
      fileV1([{ token: 'f1', predictions: [raw('traffic light', 0.05), raw('person', 0)] }]),
    );
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')?.map((p) => p.class)).toEqual(['traffic light', 'person']);
  });

  it('returns null and warns for a root that is not a predictions file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const bad of [null, undefined, 42, 'x', [], {}, { frames: [] }, { model: MODEL }, { model: MODEL, frames: {} }]) {
      expect(parsePredictions(bad)).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(9);
  });

  it('skips malformed predictions with one warning and keeps the ids of the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = parsePredictions(
      fileV2([
        {
          token: 'f1',
          cameras: {
            CAM_FRONT: [
              raw('person', 0.9),
              raw('', 0.9), // no class
              { class: 'person', bbox: [0, 0, 1, 1] }, // no score
              raw('person', 1.2), // score out of range
              raw('person', Number.NaN),
              raw('person', 0.5, [0, 0, 10]), // 3 numbers
              raw('person', 0.5, [0, 0, 0, 10]), // no width
              raw('person', 0.5, [0, 0, 10, -1]), // negative height
              raw('person', 0.5, [0, 0, '10', 10]), // not a number
              null,
              raw('car', 0.4),
            ],
          },
        },
      ]),
    );
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')?.map((p) => p.id)).toEqual([
      'pred:f1:CAM_FRONT:0',
      'pred:f1:CAM_FRONT:10',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('9 malformed prediction(s)');
  });

  it('skips malformed and duplicate frames', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = parsePredictions(
      fileV1([
        { token: 'f1', predictions: [raw('person', 0.9)] },
        { token: 'f1', predictions: [raw('car', 0.9)] }, // duplicate token
        { token: '', predictions: [] },
        { predictions: [] },
        { token: 'f2' }, // neither a list nor cameras
        'nope',
      ]),
    );
    expect([...(set?.byFrame.keys() ?? [])]).toEqual(['f1']);
    expect(set?.byFrame.get('f1')?.get('CAM_FRONT')?.[0].class).toBe('person');
    expect(String(warn.mock.calls[0][0])).toContain('5 malformed frame(s)');
  });

  it('falls back to a named placeholder when the model info is incomplete', () => {
    const set = parsePredictions({ model: { imageSize: 'big' }, frames: [] });
    expect(set?.model).toEqual({ name: 'unknown model' });
    expect(set?.cameras).toEqual([]);
  });
});

describe('prediction ids', () => {
  it('are told apart from label ids', () => {
    expect(isPredictionId(predictionId('abc', 'CAM_FRONT', 3))).toBe(true);
    expect(isPredictionId('5999098c7e5e4a0f8d8f3f2b1c0d9e8f')).toBe(false);
    expect(isPredictionId('')).toBe(false);
    expect(isPredictionId(null)).toBe(false);
    expect(isPredictionId(undefined)).toBe(false);
  });

  it('cannot equal a nuScenes instance token (hex only) or a COCO id (digits and "-")', () => {
    const id = predictionId('b5989651183643369174912bc5641d3b', 'CAM_FRONT', 0);
    expect(/^[0-9a-f]+$/.test(id)).toBe(false);
    expect(/^[0-9-]+$/.test(id)).toBe(false);
  });

  it('differ between frames, and between cameras, for the same position', () => {
    expect(predictionId('f1', 'CAM_FRONT', 0)).not.toBe(predictionId('f2', 'CAM_FRONT', 0));
    expect(predictionId('f1', 'CAM_FRONT', 0)).not.toBe(predictionId('f1', 'CAM_BACK', 0));
  });
});

describe('(F7.5) cameraOfPredictionId', () => {
  it('reads the camera out of a prediction id', () => {
    expect(cameraOfPredictionId(predictionId('abc', 'CAM_BACK_RIGHT', 12))).toBe('CAM_BACK_RIGHT');
    expect(cameraOfPredictionId(predictionId('abc', 'CAM_FRONT', 0))).toBe('CAM_FRONT');
  });

  it('still finds it when the frame id contains a colon', () => {
    expect(cameraOfPredictionId(predictionId('scene:7:frame', 'CAM_BACK', 3))).toBe('CAM_BACK');
  });

  it('is null for anything that is not a prediction id naming a camera', () => {
    expect(cameraOfPredictionId('5999098c7e5e4a0f8d8f3f2b1c0d9e8f')).toBeNull();
    expect(cameraOfPredictionId('pred:abc')).toBeNull();
    expect(cameraOfPredictionId(predictionId('abc', '', 0))).toBeNull(); // a single-camera frame has no name
    expect(cameraOfPredictionId('')).toBeNull();
    expect(cameraOfPredictionId(null)).toBeNull();
    expect(cameraOfPredictionId(undefined)).toBeNull();
  });
});

describe('(F7.5) frameOfPredictionId', () => {
  it('reads the frame out of a prediction id', () => {
    expect(frameOfPredictionId(predictionId('abc', 'CAM_BACK_RIGHT', 12))).toBe('abc');
  });

  it('keeps a frame id that contains colons whole', () => {
    expect(frameOfPredictionId(predictionId('scene:7:frame', 'CAM_BACK', 3))).toBe('scene:7:frame');
  });

  it('names the frame also for a single-camera frame (no camera name)', () => {
    expect(frameOfPredictionId(predictionId('abc', '', 0))).toBe('abc');
  });

  it('is null for anything that is not a prediction id', () => {
    expect(frameOfPredictionId('5999098c7e5e4a0f8d8f3f2b1c0d9e8f')).toBeNull();
    expect(frameOfPredictionId('pred:abc')).toBeNull();
    expect(frameOfPredictionId('')).toBeNull();
    expect(frameOfPredictionId(null)).toBeNull();
    expect(frameOfPredictionId(undefined)).toBeNull();
  });
});

describe('(F7.5) the weights file name', () => {
  it('is kept when the file states it', () => {
    const set = parsePredictions({ model: { name: 'yolov8n', weights: 'yolov8n.pt' }, frames: [] });
    expect(set?.model.weights).toBe('yolov8n.pt');
  });

  it('is absent when the file does not state it, or states something that is not a name', () => {
    expect(parsePredictions({ model: { name: 'yolov8n' }, frames: [] })?.model.weights).toBeUndefined();
    expect(parsePredictions({ model: { name: 'yolov8n', weights: 5 }, frames: [] })?.model.weights).toBeUndefined();
    expect(parsePredictions({ model: { name: 'yolov8n', weights: '' }, frames: [] })?.model.weights).toBeUndefined();
  });
});
