'use client';

import { useMemo, useState } from 'react';
import {
  evaluateFrames,
  listUnlabelledFalseAlarms,
  type EvaluationRules,
  type UnlabelledFalseAlarm,
} from '@/lib/evaluation';
import type { ReviewMap } from '@/lib/review';
import {
  SAMPLE_SEED,
  SAMPLE_SIZES,
  drawOrder,
  sampleAvailability,
  sampleOf,
  sampleSizeForRecords,
  summarizeSample,
  verdictOfItem,
  type SampleAvailability,
  type SampleSummary,
  type SampleVerdict,
  type SceneSampleState,
} from '@/lib/sampling';
import type { LoadedScene } from '@/lib/scenes';

const NO_ITEMS: UnlabelledFalseAlarm[] = [];

type Options = {
  /** The sample is only computed while this is true (it costs one evaluation of every scene). */
  active: boolean;
  /** Every scene of the catalog, in catalog order. */
  sceneNames: readonly string[];
  /** The scenes in memory. */
  loaded: ReadonlyMap<string, LoadedScene>;
  /** Scenes that failed to load, by name. */
  failed: ReadonlyMap<string, string>;
  /** The FIXED rules the population is defined with (the defaults — never the slider's). */
  rules: EvaluationRules;
  /** Verdicts of the sample-check scope. */
  records: ReviewMap;
  /** `selectedObjectId` — the box on screen is "current" when it is one of the sample. */
  selectedId: string | null;
};

export type SampleCheck = {
  availability: SampleAvailability;
  /** Size of the population; `null` until the sample can be drawn. */
  population: number | null;
  /**
   * ALL false alarms at the same fixed rules (the population is the part of
   * them with no label nearby); `null` until the sample can be drawn.
   */
  falseAlarms: number | null;
  /** The sampled boxes in drawn order (empty until ready). */
  sample: readonly UnlabelledFalseAlarm[];
  size: number;
  /** The sizes that can be chosen (limited by the population). */
  sizes: readonly number[];
  setSize: (size: number) => void;
  summary: SampleSummary | null;
  /** The sampled box that is selected, with its 1-based position and verdict. */
  current: { item: UnlabelledFalseAlarm; position: number; verdict: SampleVerdict | null } | null;
  /** The names of the scenes the population covers (for the export). */
  scenes: readonly string[];
};

/**
 * (F7.5) The sample check's derived state: the population, the drawn sample,
 * its verdict summary and which sampled box is on screen.
 *
 * Everything is DERIVED from (loaded scenes, fixed rules, stored verdicts,
 * `selectedObjectId`) by the pure functions of `lib/evaluation` and
 * `lib/sampling`. The only state kept here is the sample size the user picked;
 * "the box being judged" is not state — it is `selectedObjectId` (Immutable
 * Rule #2).
 */
export function useSampleCheck({
  active,
  sceneNames,
  loaded,
  failed,
  rules,
  records,
  selectedId,
}: Options): SampleCheck {
  const availability = useMemo<SampleAvailability>(() => {
    return sampleAvailability(
      sceneNames.map((name) => {
        const scene = loaded.get(name);
        const state: SceneSampleState = scene
          ? scene.predictions
            ? 'loaded'
            : 'no-predictions'
          : failed.has(name)
            ? 'failed'
            : 'pending';
        return { name, state };
      }),
    );
  }, [sceneNames, loaded, failed]);
  const ready = active && availability.status === 'ready';

  // The population in its fixed order, then the one seeded shuffle of it.
  const drawn = useMemo(() => {
    if (!ready) return { order: NO_ITEMS, falseAlarms: 0 };
    let falseAlarms = 0;
    const population = listUnlabelledFalseAlarms(
      sceneNames.flatMap((name) => {
        const scene = loaded.get(name);
        if (!scene?.predictions) return [];
        const evaluation = evaluateFrames(scene.frames, scene.predictions, rules);
        falseAlarms += evaluation.summary.falseAlarm;
        return [
          {
            name,
            frames: scene.frames,
            predictions: scene.predictions,
            evaluation: evaluation.byFrame,
          },
        ];
      }),
    );
    return { order: drawOrder(population, SAMPLE_SEED), falseAlarms };
  }, [ready, sceneNames, loaded, rules]);
  const order = drawn.order;

  // The size the user picked; until they pick one, the smallest size that
  // holds every verdict already stored (so a reload does not hide work).
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  const sizes = useMemo(() => {
    const offered = SAMPLE_SIZES.filter((option) => option <= order.length);
    return offered.length > 0 ? offered : [order.length];
  }, [order.length]);
  const size = useMemo(() => {
    if (pickedSize !== null && sizes.includes(pickedSize)) return pickedSize;
    const derived = sampleSizeForRecords(order, records);
    return sizes.includes(derived) ? derived : sizes[sizes.length - 1];
  }, [pickedSize, sizes, order, records]);

  const sample = useMemo(() => (ready ? sampleOf(order, size) : NO_ITEMS), [ready, order, size]);
  const summary = useMemo(
    () => (ready ? summarizeSample(sample, records, order.length) : null),
    [ready, sample, records, order.length],
  );
  const current = useMemo(() => {
    if (!ready || !selectedId) return null;
    const index = sample.findIndex((item) => item.predictionId === selectedId);
    if (index === -1) return null;
    const item = sample[index];
    return { item, position: index + 1, verdict: verdictOfItem(records, item) };
  }, [ready, sample, selectedId, records]);

  return {
    availability,
    population: ready ? order.length : null,
    falseAlarms: ready ? drawn.falseAlarms : null,
    sample,
    size,
    sizes,
    setSize: setPickedSize,
    summary,
    current,
    scenes: sceneNames,
  };
}
