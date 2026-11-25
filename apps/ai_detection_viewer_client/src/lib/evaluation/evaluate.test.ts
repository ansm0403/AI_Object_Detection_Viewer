import { describe, expect, it } from 'vitest';
import type { CameraView, Frame } from '@/lib/types';
import { SINGLE_VIEW } from '@/lib/cameras';
import { evaluateFrameCameras, evaluateFrames, mergeObjectOutcomes } from './evaluate';
import { evaluateFrame } from './match';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { Box2D, EvaluationRules, Prediction2D, PredictionSet } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };
const HERE = box(0, 0, 100, 100);
const ELSEWHERE = box(500, 500, 50, 50);

/** Predictions for frames that have ONE photo (no `cameras`): keyed by the unnamed single view. */
const setOf = (entries: [string, Prediction2D[]][]): PredictionSet => ({
  model: { name: 'test-model' },
  cameras: [SINGLE_VIEW],
  byFrame: new Map(entries.map(([frameId, list]) => [frameId, new Map([[SINGLE_VIEW, list]])])),
});

describe('evaluateFrames — one photo per frame', () => {
  it('evaluates each frame against its own predictions and sums them', () => {
    const frames = [
      makeFrame([{ id: 'a', bbox: HERE }], 'f1'),
      makeFrame([{ id: 'b', bbox: HERE }], 'f2'),
    ];
    const result = evaluateFrames(
      frames,
      setOf([
        ['f1', [makePrediction(0, 'person', 0.9, HERE, 'f1')]],
        ['f2', [makePrediction(0, 'person', 0.9, ELSEWHERE, 'f2')]],
      ]),
      RULES,
    );
    expect(result.byFrame.get('f1')?.counts).toMatchObject({ found: 1, missed: 0 });
    expect(result.byFrame.get('f2')?.counts).toMatchObject({ found: 0, missed: 1, falseAlarm: 1 });
    expect(result.summary).toMatchObject({ found: 1, missed: 1, falseAlarm: 1 });
    expect(result.evaluatedFrames).toBe(2);
    expect(result.evaluatedPhotos).toBe(2);
    expect(result.framesWithoutPredictions).toBe(0);
    expect(result.photosWithoutPredictions).toBe(0);
  });

  it('the one photo’s evaluation is exactly evaluateFrame of that frame', () => {
    const frame = makeFrame([{ id: 'a', bbox: HERE }, { id: 'b', bbox: box(300, 0, 50, 50) }], 'f1');
    const predictions = [makePrediction(0, 'person', 0.9, HERE, 'f1')];
    const result = evaluateFrames([frame], setOf([['f1', predictions]]), RULES);
    expect(result.byFrame.get('f1')?.byCamera.get(SINGLE_VIEW)).toEqual(
      evaluateFrame(frame, predictions, RULES),
    );
  });

  it('leaves out a frame the model was not run on — its labels are NOT counted as missed', () => {
    const frames = [
      makeFrame([{ id: 'a', bbox: HERE }], 'f1'),
      makeFrame([{ id: 'b', bbox: HERE }, { id: 'c', bbox: box(300, 0, 50, 50) }], 'f2'),
    ];
    const result = evaluateFrames(
      frames,
      setOf([['f1', [makePrediction(0, 'person', 0.9, HERE, 'f1')]]]),
      RULES,
    );
    expect(result.byFrame.has('f2')).toBe(false);
    expect(result.summary).toMatchObject({ found: 1, missed: 0 });
    expect(result.summary.recall).toBe(1);
    expect(result.evaluatedFrames).toBe(1);
    expect(result.framesWithoutPredictions).toBe(1);
  });

  it('a frame with an EMPTY prediction list was run: every scored label is missed', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const result = evaluateFrames(frames, setOf([['f1', []]]), RULES);
    expect(result.byFrame.get('f1')?.counts).toMatchObject({ found: 0, missed: 1 });
    expect(result.summary.recall).toBe(0);
    expect(result.summary.precision).toBeNull();
    expect(result.framesWithoutPredictions).toBe(0);
  });

  it('ignores predictions for frames that are not in the dataset', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const result = evaluateFrames(
      frames,
      setOf([
        ['f1', []],
        ['gone', [makePrediction(0, 'person', 0.9, HERE, 'gone')]],
      ]),
      RULES,
    );
    expect([...result.byFrame.keys()]).toEqual(['f1']);
    expect(result.summary.falseAlarm).toBe(0);
  });

  it('applies the rules it is given (the score slider)', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const predictions = setOf([['f1', [makePrediction(0, 'person', 0.3, HERE, 'f1')]]]);
    expect(evaluateFrames(frames, predictions, RULES).summary.found).toBe(1);
    expect(
      evaluateFrames(frames, predictions, { ...RULES, minScore: 0.5 }).summary,
    ).toMatchObject({ found: 0, missed: 1 });
  });

  it('no frames, or no evaluated frame: empty totals, null ratios', () => {
    expect(evaluateFrames([], setOf([]), RULES)).toMatchObject({
      evaluatedFrames: 0,
      evaluatedPhotos: 0,
      framesWithoutPredictions: 0,
      byCamera: [],
      objects: { found: 0, missed: 0, notScored: 0 },
      summary: { found: 0, missed: 0, precision: null, recall: null },
    });
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    expect(evaluateFrames(frames, setOf([]), RULES)).toMatchObject({
      evaluatedFrames: 0,
      framesWithoutPredictions: 1,
      summary: { missed: 0, recall: null },
    });
  });
});

// ---------------------------------------------------------------- several cameras

type ViewLabel = { id: string; bbox?: Box2D; class?: string };
const view = (name: string, labels: ViewLabel[]): CameraView => ({
  name,
  imageUrl: `/img/${name}.jpg`,
  imageWidth: 1600,
  imageHeight: 900,
  detections2D: labels.map((l) => ({
    id: l.id,
    class: l.class ?? 'person',
    confidence: 1,
    bbox: l.bbox ?? HERE,
  })),
});
/** A frame with the given 3D boxes (via `makeFrame`) seen through the given camera views. */
const rigFrame = (
  boxes: Parameters<typeof makeFrame>[0],
  views: CameraView[],
  id = 'f1',
): Frame => ({
  ...makeFrame(boxes.map((b) => ({ ...b, inCamera: false })), id),
  detections2D: views[0].detections2D,
  imageUrl: views[0].imageUrl,
  cameras: views,
});
const pred = (camera: string, index: number, bbox: Box2D, cls = 'person', score = 0.9, frameId = 'f1') =>
  makePrediction(index, cls, score, bbox, frameId, camera);
const rigSet = (entries: [string, [string, Prediction2D[]][]][]): PredictionSet => ({
  model: { name: 'test-model' },
  cameras: ['FRONT', 'RIGHT', 'BACK'],
  byFrame: new Map(entries.map(([frameId, cams]) => [frameId, new Map(cams)])),
});

describe('evaluateFrameCameras — each photo is scored on its own', () => {
  // "shared" is in the overlap of FRONT and RIGHT; "front" only in FRONT;
  // "back" only in BACK; "unseen" in no photo; "rack" is a class the model cannot name.
  const frame = rigFrame(
    [{ id: 'shared' }, { id: 'front' }, { id: 'back' }, { id: 'unseen' }, { id: 'rack', class: 'static_object.bicycle_rack' }],
    [
      view('FRONT', [{ id: 'shared', bbox: box(1500, 0, 100, 100) }, { id: 'front', bbox: HERE }]),
      view('RIGHT', [{ id: 'shared', bbox: HERE }, { id: 'rack', class: 'static_object.bicycle_rack', bbox: box(800, 0, 200, 100) }]),
      view('BACK', [{ id: 'back', bbox: HERE }]),
    ],
  );
  const predictions = new Map([
    // FRONT: finds "front", misses "shared" (cut off at the edge), one false alarm.
    ['FRONT', [pred('FRONT', 0, HERE), pred('FRONT', 1, ELSEWHERE)]],
    // RIGHT: finds "shared".
    ['RIGHT', [pred('RIGHT', 0, HERE)]],
    // BACK: ran and found nothing → "back" is missed.
    ['BACK', []],
  ]);
  const evaluation = evaluateFrameCameras(frame, predictions, RULES);

  it('evaluates every photo against its own labels and predictions', () => {
    expect(evaluation?.byCamera.get('FRONT')?.counts).toEqual({ found: 1, missed: 1, falseAlarm: 1, notScored: 0 });
    expect(evaluation?.byCamera.get('RIGHT')?.counts).toEqual({ found: 1, missed: 0, falseAlarm: 0, notScored: 0 });
    expect(evaluation?.byCamera.get('BACK')?.counts).toEqual({ found: 0, missed: 1, falseAlarm: 0, notScored: 0 });
  });

  it('adds the photos up: an object two cameras see is counted twice', () => {
    // "shared" is one miss (FRONT) and one find (RIGHT).
    expect(evaluation?.counts).toEqual({ found: 2, missed: 2, falseAlarm: 1, notScored: 0 });
  });

  it('per object: found if ANY camera found it', () => {
    expect(evaluation?.objects.get('shared')).toEqual({
      kind: 'found',
      views: [
        { camera: 'FRONT', kind: 'missed' },
        { camera: 'RIGHT', kind: 'found' },
      ],
    });
    expect(evaluation?.objects.get('front')?.kind).toBe('found');
    expect(evaluation?.objects.get('back')).toEqual({ kind: 'missed', views: [{ camera: 'BACK', kind: 'missed' }] });
  });

  it('boxes no camera sees, or of a class the model cannot name, are not evaluated', () => {
    expect(evaluation?.objects.has('unseen')).toBe(false);
    expect(evaluation?.objects.has('rack')).toBe(false);
    expect(evaluation?.notEvaluated).toBe(2);
  });

  it('the same prediction index in two photos stays two predictions', () => {
    const front = evaluation?.byCamera.get('FRONT')?.results.find((r) => r.kind === 'found');
    const right = evaluation?.byCamera.get('RIGHT')?.results.find((r) => r.kind === 'found');
    expect(front?.kind === 'found' && front.predictionId).toBe('pred:f1:FRONT:0');
    expect(right?.kind === 'found' && right.predictionId).toBe('pred:f1:RIGHT:0');
  });

  it('a camera the model was not run on is left out — its labels are NOT misses', () => {
    const partial = evaluateFrameCameras(
      frame,
      new Map([['FRONT', predictions.get('FRONT') ?? []]]),
      RULES,
    );
    expect([...(partial?.byCamera.keys() ?? [])]).toEqual(['FRONT']);
    expect(partial?.camerasWithoutPredictions).toEqual(['RIGHT', 'BACK']);
    expect(partial?.counts).toEqual({ found: 1, missed: 1, falseAlarm: 1, notScored: 0 });
    // "shared" is judged by the one photo that was run; "back" has no result at all.
    expect(partial?.objects.get('shared')?.kind).toBe('missed');
    expect(partial?.objects.has('back')).toBe(false);
    expect(partial?.notEvaluated).toBe(3);
  });

  it('no photo run at all → null (the frame is not evaluated)', () => {
    expect(evaluateFrameCameras(frame, new Map(), RULES)).toBeNull();
    expect(evaluateFrameCameras(frame, new Map([['ELSEWHERE', []]]), RULES)).toBeNull();
  });

  it('does not modify the frame', () => {
    const before = JSON.stringify(frame);
    evaluateFrameCameras(frame, predictions, RULES);
    expect(JSON.stringify(frame)).toBe(before);
  });
});

describe('mergeObjectOutcomes — the per-object rule', () => {
  const outcomeOf = (kinds: { camera: string; visibility?: 'v0-40'; found?: boolean }[]) => {
    const byCamera = new Map(
      kinds.map(({ camera, visibility, found }) => {
        const frame = makeFrame([{ id: 'x', bbox: HERE, ...(visibility ? { visibility } : {}) }]);
        return [camera, evaluateFrame(frame, found ? [makePrediction(0, 'person', 0.9, HERE)] : [], RULES)] as const;
      }),
    );
    return mergeObjectOutcomes(byCamera).get('x');
  };

  it.each([
    ['found + missed → found', [{ camera: 'A', found: true }, { camera: 'B' }], 'found'],
    ['missed + found → found (order does not matter)', [{ camera: 'A' }, { camera: 'B', found: true }], 'found'],
    ['missed + missed → missed', [{ camera: 'A' }, { camera: 'B' }], 'missed'],
    ['not scored + not scored → not scored', [{ camera: 'A', visibility: 'v0-40' as const }, { camera: 'B', visibility: 'v0-40' as const }], 'not-scored'],
  ])('%s', (_name, views, expected) => {
    expect(outcomeOf(views)?.kind).toBe(expected);
    expect(outcomeOf(views)?.views.map((v) => v.camera)).toEqual(views.map((v) => v.camera));
  });

  it('false alarms have no object and are left out', () => {
    const frame = makeFrame([]);
    const byCamera = new Map([['A', evaluateFrame(frame, [makePrediction(0, 'person', 0.9, HERE)], RULES)]]);
    expect(mergeObjectOutcomes(byCamera).size).toBe(0);
  });
});

describe('evaluateFrames — several cameras', () => {
  const frame1 = rigFrame(
    [{ id: 'shared' }, { id: 'front' }],
    [view('FRONT', [{ id: 'shared', bbox: box(1500, 0, 100, 100) }, { id: 'front', bbox: HERE }]), view('RIGHT', [{ id: 'shared', bbox: HERE }])],
    'f1',
  );
  const frame2 = rigFrame(
    [{ id: 'shared' }],
    [view('FRONT', [{ id: 'shared', bbox: HERE }]), view('RIGHT', [])],
    'f2',
  );
  const result = evaluateFrames(
    [frame1, frame2],
    rigSet([
      ['f1', [['FRONT', [pred('FRONT', 0, HERE)]], ['RIGHT', [pred('RIGHT', 0, HERE)]]]],
      // f2: only FRONT was run.
      ['f2', [['FRONT', [pred('FRONT', 0, ELSEWHERE, 'person', 0.9, 'f2')]]]],
    ]),
    RULES,
  );

  it('the totals are per photo', () => {
    // f1 FRONT: front found, shared missed · f1 RIGHT: shared found · f2 FRONT: shared missed + 1 false alarm
    expect(result.summary).toMatchObject({ found: 2, missed: 2, falseAlarm: 1, notScored: 0 });
    expect(result.evaluatedFrames).toBe(2);
    expect(result.evaluatedPhotos).toBe(3);
    expect(result.photosWithoutPredictions).toBe(1);
    expect(result.framesWithoutPredictions).toBe(0);
  });

  it('breaks the same totals down by camera, and the cameras add up to the total', () => {
    expect(result.byCamera.map((c) => [c.camera, c.photos, c.summary.found, c.summary.missed, c.summary.falseAlarm])).toEqual([
      ['FRONT', 2, 1, 2, 1],
      ['RIGHT', 1, 1, 0, 0],
    ]);
    const sum = (key: 'found' | 'missed' | 'falseAlarm') => result.byCamera.reduce((n, c) => n + c.summary[key], 0);
    expect([sum('found'), sum('missed'), sum('falseAlarm')]).toEqual([2, 2, 1]);
  });

  it('counts objects once per frame, by "found by any camera"', () => {
    // f1: shared (found by RIGHT), front (found) · f2: shared (missed)
    expect(result.objects).toEqual({ found: 2, missed: 1, notScored: 0 });
  });

  it('a frame none of whose photos was run is left out entirely', () => {
    const none = evaluateFrames([frame1], rigSet([['f1', [['ELSEWHERE', []]]]]), RULES);
    expect(none.evaluatedFrames).toBe(0);
    expect(none.framesWithoutPredictions).toBe(1);
    expect(none.photosWithoutPredictions).toBe(0);
    expect(none.summary.missed).toBe(0);
  });
});
