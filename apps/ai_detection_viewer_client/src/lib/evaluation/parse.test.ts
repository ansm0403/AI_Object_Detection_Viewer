import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPredictionId, parsePredictions, predictionId } from './parse';

const MODEL = { name: 'yolov8n', library: 'ultralytics 8.4.51', imageSize: 1280, minScore: 0.05 };
const file = (frames: unknown, extra: Record<string, unknown> = {}) => ({
  format: 'ai-detection-viewer/predictions@1',
  camera: 'CAM_FRONT',
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

describe('parsePredictions', () => {
  it('reads frames, model info and camera', () => {
    const set = parsePredictions(file([{ token: 'f1', predictions: [raw('person', 0.9)] }]));
    expect(set).not.toBeNull();
    expect(set?.model).toEqual(MODEL);
    expect(set?.camera).toBe('CAM_FRONT');
    expect(set?.byFrame.get('f1')).toEqual([
      { id: 'pred:f1:0', class: 'person', score: 0.9, bbox: { x: 10, y: 20, width: 30, height: 40 } },
    ]);
  });

  it('keeps every class and every score: filtering is the selectors’ job', () => {
    const set = parsePredictions(
      file([{ token: 'f1', predictions: [raw('traffic light', 0.05), raw('person', 0)] }]),
    );
    expect(set?.byFrame.get('f1')?.map((p) => p.class)).toEqual(['traffic light', 'person']);
  });

  it('orders a frame by score and keeps the FILE index in the id', () => {
    const set = parsePredictions(
      file([{ token: 'f1', predictions: [raw('car', 0.2), raw('car', 0.8), raw('car', 0.5)] }]),
    );
    expect(set?.byFrame.get('f1')?.map((p) => [p.id, p.score])).toEqual([
      ['pred:f1:1', 0.8],
      ['pred:f1:2', 0.5],
      ['pred:f1:0', 0.2],
    ]);
  });

  it('keeps a frame with no predictions (it WAS run and found nothing)', () => {
    const set = parsePredictions(file([{ token: 'f1', predictions: [] }]));
    expect(set?.byFrame.has('f1')).toBe(true);
    expect(set?.byFrame.get('f1')).toEqual([]);
    expect(set?.byFrame.has('f2')).toBe(false);
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
      file([
        {
          token: 'f1',
          predictions: [
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
      ]),
    );
    expect(set?.byFrame.get('f1')?.map((p) => p.id)).toEqual(['pred:f1:0', 'pred:f1:10']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('9 malformed prediction(s)');
  });

  it('skips malformed and duplicate frames', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = parsePredictions(
      file([
        { token: 'f1', predictions: [raw('person', 0.9)] },
        { token: 'f1', predictions: [raw('car', 0.9)] }, // duplicate token
        { token: '', predictions: [] },
        { predictions: [] },
        { token: 'f2' },
        'nope',
      ]),
    );
    expect([...(set?.byFrame.keys() ?? [])]).toEqual(['f1']);
    expect(set?.byFrame.get('f1')?.[0].class).toBe('person');
    expect(String(warn.mock.calls[0][0])).toContain('5 malformed frame(s)');
  });

  it('falls back to a named placeholder when the model info is incomplete', () => {
    const set = parsePredictions({ model: { imageSize: 'big' }, frames: [] });
    expect(set?.model).toEqual({ name: 'unknown model' });
    expect(set?.camera).toBeUndefined();
  });
});

describe('prediction ids', () => {
  it('are told apart from label ids', () => {
    expect(isPredictionId(predictionId('abc', 3))).toBe(true);
    expect(isPredictionId('5999098c7e5e4a0f8d8f3f2b1c0d9e8f')).toBe(false);
    expect(isPredictionId('')).toBe(false);
    expect(isPredictionId(null)).toBe(false);
    expect(isPredictionId(undefined)).toBe(false);
  });

  it('cannot equal a nuScenes instance token (hex only) or a COCO id (digits and "-")', () => {
    const id = predictionId('b5989651183643369174912bc5641d3b', 0);
    expect(/^[0-9a-f]+$/.test(id)).toBe(false);
    expect(/^[0-9-]+$/.test(id)).toBe(false);
  });

  it('differ between frames for the same position', () => {
    expect(predictionId('f1', 0)).not.toBe(predictionId('f2', 0));
  });
});
