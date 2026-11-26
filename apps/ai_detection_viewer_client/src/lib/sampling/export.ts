import type { Box2D, UnlabelledFalseAlarm } from '@/lib/evaluation';
import type { ReviewMap } from '@/lib/review';
import type { ShareEstimate } from './estimate';
import {
  judgedAtOfItem,
  summarizeSample,
  verdictOfItem,
  type SampleVerdict,
} from './sample-check';

/**
 * (F7.5) The sample check as a file.
 *
 * The verdicts are the evidence behind any sentence like "of 100 sampled false
 * alarms, N were real objects without a label". They live in the browser's
 * storage; this document is how they leave it — complete enough to be checked
 * by someone else: what the population was, how the sample was drawn (seed),
 * every sampled box (judged or not) and what was estimated from them.
 *
 * A SEPARATE format from the label review export (`review@2`, lib/review):
 * that file records verdicts on dataset labels, this one on model boxes.
 */
export const SAMPLE_EXPORT_FORMAT = 'ai-detection-viewer/false-alarm-sample@1';

export type SampleExportItem = {
  /** 1-based position in the sample (the order the boxes were drawn in). */
  index: number;
  scene: string;
  /** 1-based position of the frame within its scene — the number the screen shows. */
  frameIndex: number;
  frameId: string;
  camera: string;
  predictionId: string;
  /** What the model reported. */
  class: string;
  score: number;
  /** `[x, y, width, height]` in the original photo's pixels; `null` if unknown. */
  bbox: [number, number, number, number] | null;
  /** `null` = not judged. */
  verdict: SampleVerdict | null;
  /** ISO time of the verdict; `null` when not judged. */
  judgedAt: string | null;
};

type ExportEstimate = { count: number; share: number; low: number; high: number } | null;

export type SampleExport = {
  format: typeof SAMPLE_EXPORT_FORMAT;
  exportedAt: string;
  dataset: 'nuscenes';
  /** The set the sample was drawn from. */
  population: {
    definition: string;
    /** The evaluation rules the population was computed with. */
    rules: { minScore: number; iouThreshold: number; noLabelWithinIou: number };
    size: number;
    scenes: string[];
  };
  sample: {
    method: 'simple random sample without replacement (seeded shuffle, first N)';
    seed: number;
    size: number;
  };
  /** What the verdicts mean. */
  verdicts: Record<SampleVerdict, string>;
  summary: {
    judged: number;
    complete: boolean;
    counts: Record<SampleVerdict, number>;
    /**
     * Estimated share of each verdict among ALL boxes of the population, with a
     * 95 % interval (Wilson score, finite population). An estimate from the
     * `judged` sampled boxes — not a count of the population.
     */
    estimates: Record<SampleVerdict, ExportEstimate>;
    caveat: string;
  };
  items: SampleExportItem[];
};

export type SampleExportOptions = {
  exportedAt: string;
  seed: number;
  /** Size of the whole population (the sample is a part of it). */
  population: number;
  /** Names of the scenes the population covers, in order. */
  scenes: readonly string[];
  rules: { minScore: number; iouThreshold: number; noLabelWithinIou: number };
};

const round = (value: number, digits: number): number => Number(value.toFixed(digits));
const toTuple = (bbox: Box2D | null): SampleExportItem['bbox'] =>
  bbox ? [round(bbox.x, 1), round(bbox.y, 1), round(bbox.width, 1), round(bbox.height, 1)] : null;
const toExportEstimate = (estimate: ShareEstimate | null): ExportEstimate =>
  estimate
    ? {
        count: estimate.count,
        share: round(estimate.share, 4),
        low: round(estimate.low, 4),
        high: round(estimate.high, 4),
      }
    : null;

/**
 * Build the export document for `sample` (the drawn items, in sample order).
 * Pure: two exports of the same state differ only in `exportedAt`.
 */
export function buildSampleExport(
  sample: readonly UnlabelledFalseAlarm[],
  records: ReviewMap,
  options: SampleExportOptions,
): SampleExport {
  const summary = summarizeSample(sample, records, options.population);
  return {
    format: SAMPLE_EXPORT_FORMAT,
    exportedAt: options.exportedAt,
    dataset: 'nuscenes',
    population: {
      definition:
        'Model boxes counted as false alarms that overlap no label of any class in their photo ' +
        `(IoU below ${options.rules.noLabelWithinIou} with every label, scored or not).`,
      rules: options.rules,
      size: options.population,
      scenes: [...options.scenes],
    },
    sample: {
      method: 'simple random sample without replacement (seeded shuffle, first N)',
      seed: options.seed,
      size: sample.length,
    },
    verdicts: {
      'real-object':
        'A real object (a vehicle or a person) is in the box and the dataset has no label for it. ' +
        'Does not assert that the model named its exact class.',
      'model-wrong': 'No such object is there (background, a reflection, a picture of a person, …).',
      unclear: 'The photo cannot settle it.',
    },
    summary: {
      judged: summary.judged,
      complete: summary.complete,
      counts: summary.counts,
      estimates: {
        'real-object': toExportEstimate(summary.estimates['real-object']),
        'model-wrong': toExportEstimate(summary.estimates['model-wrong']),
        unclear: toExportEstimate(summary.estimates.unclear),
      },
      caveat:
        'Judged by one person on 960x540 copies of the photos. The interval treats the boxes as ' +
        'independent; the same object is often boxed again in the next frame, so the true ' +
        'uncertainty is somewhat larger.',
    },
    items: sample.map((item, index) => ({
      index: index + 1,
      scene: item.scene,
      frameIndex: item.frameIndex + 1,
      frameId: item.frameId,
      camera: item.camera,
      predictionId: item.predictionId,
      class: item.class,
      score: round(item.score, 4),
      bbox: toTuple(item.bbox),
      verdict: verdictOfItem(records, item),
      judgedAt: judgedAtOfItem(records, item),
    })),
  };
}

/** The document as the text of a `.json` file (indented, newline-ended). */
export function sampleExportToJson(data: SampleExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** File name for a download, e.g. `false-alarm-sample_20261127-0905.json` (local wall-clock time). */
export function sampleExportFilename(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}` +
    `-${two(at.getHours())}${two(at.getMinutes())}`;
  return `false-alarm-sample_${stamp}.json`;
}
