import { describe, expect, it } from 'vitest';
import type { UnlabelledFalseAlarm } from '@/lib/evaluation';
import { withVerdict, type ReviewMap } from '@/lib/review';
import {
  SAMPLE_EXPORT_FORMAT,
  buildSampleExport,
  sampleExportFilename,
  sampleExportToJson,
} from './export';

const NOW = '2026-11-27T01:02:03.000Z';
const item = (n: number, scene = 'scene-0001'): UnlabelledFalseAlarm => ({
  scene,
  frameId: `f${n}`,
  frameIndex: n,
  camera: 'CAM_FRONT',
  predictionId: `pred:f${n}:CAM_FRONT:${n}`,
  class: 'car',
  score: 0.3 + n / 100,
  bbox: { x: 10.04, y: 20, width: 30.26, height: 40 },
});
const sample = [item(0), item(1), item(2), item(3)];
const OPTIONS = {
  exportedAt: NOW,
  seed: 20261127,
  population: 1452,
  scenes: ['scene-0001', 'scene-0002'],
  rules: { minScore: 0.25, iouThreshold: 0.3, noLabelWithinIou: 0.1 },
};
const records = (): ReviewMap => {
  let map: ReviewMap = {};
  map = withVerdict(map, 'f0', sample[0].predictionId, 'approved', NOW);
  map = withVerdict(map, 'f1', sample[1].predictionId, 'rejected', NOW);
  map = withVerdict(map, 'f2', sample[2].predictionId, 'unsure', NOW);
  return map;
};

describe('buildSampleExport', () => {
  const data = buildSampleExport(sample, records(), OPTIONS);

  it('names its own format — not the label review format', () => {
    expect(data.format).toBe(SAMPLE_EXPORT_FORMAT);
    expect(data.format).toBe('ai-detection-viewer/false-alarm-sample@1');
    expect(data.format).not.toContain('review@');
  });

  it('says what the population was and how the sample was drawn', () => {
    expect(data.population.size).toBe(1452);
    expect(data.population.scenes).toEqual(['scene-0001', 'scene-0002']);
    expect(data.population.rules).toEqual({ minScore: 0.25, iouThreshold: 0.3, noLabelWithinIou: 0.1 });
    expect(data.population.definition).toContain('IoU below 0.1');
    expect(data.sample).toEqual({
      method: 'simple random sample without replacement (seeded shuffle, first N)',
      seed: 20261127,
      size: 4,
    });
  });

  it('lists EVERY sampled box in sample order, judged or not', () => {
    expect(data.items.map((row) => row.index)).toEqual([1, 2, 3, 4]);
    expect(data.items.map((row) => row.verdict)).toEqual(['real-object', 'model-wrong', 'unclear', null]);
    expect(data.items.map((row) => row.judgedAt)).toEqual([NOW, NOW, NOW, null]);
  });

  it('writes the verdicts in words, not as the stored review values', () => {
    const text = sampleExportToJson(data);
    expect(text).not.toContain('"approved"');
    expect(text).not.toContain('"rejected"');
  });

  it('numbers frames from 1 (as the screen does) and rounds coordinates', () => {
    expect(data.items[0]).toMatchObject({ scene: 'scene-0001', frameIndex: 1, frameId: 'f0', camera: 'CAM_FRONT' });
    expect(data.items[0].bbox).toEqual([10, 20, 30.3, 40]);
    expect(data.items[2].score).toBe(0.32);
  });

  it('summarises the verdicts with an estimate and its range, over the judged boxes', () => {
    expect(data.summary.judged).toBe(3);
    expect(data.summary.complete).toBe(false);
    expect(data.summary.counts).toEqual({ 'real-object': 1, 'model-wrong': 1, unclear: 1 });
    const estimate = data.summary.estimates['real-object'];
    expect(estimate?.count).toBe(1);
    expect(estimate?.share).toBeCloseTo(0.3333, 4);
    expect(estimate && estimate.low < estimate.share && estimate.share < estimate.high).toBe(true);
    expect(data.summary.caveat).toContain('one person');
  });

  it('has no estimate when nothing is judged', () => {
    const empty = buildSampleExport(sample, {}, OPTIONS);
    expect(empty.summary.judged).toBe(0);
    expect(empty.summary.estimates).toEqual({ 'real-object': null, 'model-wrong': null, unclear: null });
  });

  it('a box whose rectangle is unknown is still listed', () => {
    const data2 = buildSampleExport([{ ...item(0), bbox: null }], {}, OPTIONS);
    expect(data2.items[0].bbox).toBeNull();
  });

  it('two exports of the same state differ only in the time', () => {
    const later = buildSampleExport(sample, records(), { ...OPTIONS, exportedAt: '2027-01-01T00:00:00.000Z' });
    expect({ ...later, exportedAt: NOW }).toEqual(data);
  });
});

describe('sampleExportToJson / sampleExportFilename', () => {
  it('is indented JSON ending in a newline that parses back to the document', () => {
    const data = buildSampleExport(sample, records(), OPTIONS);
    const text = sampleExportToJson(data);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(data);
  });

  it('names the file by the local date and time', () => {
    expect(sampleExportFilename(new Date(2026, 10, 27, 9, 5))).toBe('false-alarm-sample_20261127-0905.json');
  });
});
