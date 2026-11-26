'use client';

import { useCallback, useEffect, useRef } from 'react';
import { NEAREST_MIN_IOU, type EvaluationRules, type UnlabelledFalseAlarm } from '@/lib/evaluation';
import type { ReviewScope } from '@/lib/review';
import {
  SAMPLE_SEED,
  buildSampleExport,
  nextUnjudged,
  sampleExportFilename,
  sampleExportToJson,
  stepInSample,
  toReviewVerdict,
  type SampleVerdict,
} from '@/lib/sampling';
import type { LoadedScene } from '@/lib/scenes';
import { useReviewStore } from '@/store';
import { downloadTextFile } from '@/components/review';
import { useSampleCheck, type SampleCheck } from './useSampleCheck';

/** Verdicts of the sample check live in their own review scope. */
export const SAMPLE_SCOPE: ReviewScope = 'nuscenes-false-alarms';

type Options = {
  /** The sample check is on screen. */
  on: boolean;
  setOn: (on: boolean) => void;
  /** Something else on screen (the report) shows the sample's numbers, so they are needed too. */
  alsoNeeded: boolean;
  /** Every scene of the catalog, in catalog order. */
  sceneNames: readonly string[];
  loaded: ReadonlyMap<string, LoadedScene>;
  failed: ReadonlyMap<string, string>;
  /** The FIXED rules the population is defined with. */
  rules: EvaluationRules;
  /** `selectedObjectId` — the one selection (Rule #2). */
  selectedId: string | null;
  playing: boolean;
  stopPlayback: () => void;
  /**
   * Put a frame on screen — in whatever scene it is — with `objectId` selected.
   * The page owns frame and scene navigation; this hook only asks for it.
   */
  openBox: (target: { scene: string; frameId: string; objectId: string }) => void;
};

export type SampleCheckController = SampleCheck & {
  /** The stored verdicts of the sample-check scope. */
  records: ReturnType<typeof useReviewStore.getState>['reviews'][ReviewScope];
  /** What the sample is waiting for, or why it cannot be drawn; `undefined` when it exists. */
  message: string | undefined;
  /** Why a verdict cannot be given right now; `undefined` when it can. */
  blocked: string | undefined;
  enter: () => void;
  exit: () => void;
  open: (item: UnlabelledFalseAlarm) => void;
  judge: (verdict: SampleVerdict) => void;
  clear: () => void;
  step: (direction: 1 | -1) => void;
  exportFile: () => void;
};

/**
 * (F7.5) Everything the page needs to run the sample check: the derived sample
 * (`useSampleCheck`) plus the actions on it — open a box, judge it and move on,
 * clear, step, export.
 *
 * Kept out of `page.tsx` so the page only wires it to its slots. It holds no
 * state of its own beyond a "open the first box once the sample exists" flag:
 * which box is being judged is `selectedObjectId`, the verdicts are in the
 * review store, and whether the check is on screen is the page's flag.
 */
export function useSampleCheckController({
  on,
  setOn,
  alsoNeeded,
  sceneNames,
  loaded,
  failed,
  rules,
  selectedId,
  playing,
  stopPlayback,
  openBox,
}: Options): SampleCheckController {
  const records = useReviewStore((state) => state.reviews[SAMPLE_SCOPE]);
  const setVerdict = useReviewStore((state) => state.setVerdict);
  const clearReview = useReviewStore((state) => state.clearReview);

  const check = useSampleCheck({
    active: on || alsoNeeded,
    sceneNames,
    loaded,
    failed,
    rules,
    records,
    selectedId,
  });
  const { availability, sample, current, population, scenes } = check;

  // Open a sampled box: its frame, in whatever scene it is, with the box
  // selected (the photo follows from the selection — `useActiveCamera`).
  const open = useCallback(
    (item: UnlabelledFalseAlarm) => {
      stopPlayback();
      openBox({ scene: item.scene, frameId: item.frameId, objectId: item.predictionId });
    },
    [stopPlayback, openBox],
  );

  // Entering opens the first box that still needs a verdict — once the sample
  // exists (it needs every scene in memory, which can take a moment).
  const openFirst = useRef(false);
  const enter = useCallback(() => {
    openFirst.current = true;
    setOn(true);
    stopPlayback();
  }, [setOn, stopPlayback]);
  const exit = useCallback(() => {
    openFirst.current = false;
    setOn(false);
  }, [setOn]);
  const ready = on && availability.status === 'ready';
  useEffect(() => {
    if (!ready || !openFirst.current) return;
    openFirst.current = false;
    if (current) return;
    const first = nextUnjudged(sample, records, null) ?? sample[0];
    if (first) open(first);
  }, [ready, sample, current, records, open]);

  // A verdict is about a photo standing still; while the sequence plays the
  // photo changes under the reviewer.
  const blocked = playing ? 'Stop playback to judge.' : undefined;
  const judge = useCallback(
    (verdict: SampleVerdict) => {
      if (!current || playing) return;
      const { item } = current;
      setVerdict(SAMPLE_SCOPE, item.frameId, item.predictionId, toReviewVerdict(verdict));
      // Read the records AFTER the update, then move on to the next box that
      // has no verdict — in whatever scene it is.
      const latest = useReviewStore.getState().reviews[SAMPLE_SCOPE];
      const next = nextUnjudged(sample, latest, item.predictionId);
      if (next) open(next);
    },
    [current, playing, setVerdict, sample, open],
  );
  const clear = useCallback(() => {
    if (!current || playing) return;
    clearReview(SAMPLE_SCOPE, current.item.frameId, current.item.predictionId);
  }, [current, playing, clearReview]);
  const step = useCallback(
    (direction: 1 | -1) => {
      const next = stepInSample(sample, current?.item.predictionId ?? null, direction);
      if (next) open(next);
    },
    [sample, current, open],
  );

  // The sample and its verdicts as a file (built by lib/sampling/export).
  const exportFile = useCallback(() => {
    if (population === null) return;
    const now = new Date();
    const data = buildSampleExport(sample, records, {
      exportedAt: now.toISOString(),
      seed: SAMPLE_SEED,
      population,
      scenes,
      rules: {
        minScore: rules.minScore,
        iouThreshold: rules.iouThreshold,
        noLabelWithinIou: NEAREST_MIN_IOU,
      },
    });
    downloadTextFile(sampleExportFilename(now), sampleExportToJson(data), 'application/json');
  }, [population, scenes, sample, records, rules]);

  const message =
    availability.status === 'loading'
      ? `The sample is drawn from all scenes: ${availability.loaded} of ${availability.total} are loaded…`
      : availability.status === 'unavailable'
        ? availability.reason
        : undefined;

  return { ...check, records, message, blocked, enter, exit, open, judge, clear, step, exportFile };
}
