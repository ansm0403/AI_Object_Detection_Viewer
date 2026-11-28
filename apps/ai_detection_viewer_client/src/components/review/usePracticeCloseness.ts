'use client';

import { useMemo } from 'react';
import type { EditMap } from '@/lib/editing';
import { editCloseness, type EditCloseness, type PlantedError } from '@/lib/review';
import type { Frame } from '@/lib/types';

/**
 * (F8) Practice mode: the edited boxes of the frame on screen, measured
 * against the REAL label (`lib/review/closeness`).
 *
 * @param planted        The answer key; `null` = not the practice set → nothing.
 * @param practiceFrame  The frame on screen as the practice set has it (without
 *                       the edits laid over).
 * @param realFrames     The same scene with the dataset's own boxes. It stays in
 *                       memory while its practice set is shown.
 * @param edits          The edits of the practice scope.
 * @returns `undefined` when there is nothing to measure against.
 */
export function usePracticeCloseness(
  planted: PlantedError[] | null,
  practiceFrame: Frame | null,
  realFrames: readonly Frame[] | undefined,
  edits: EditMap,
): EditCloseness[] | undefined {
  return useMemo(() => {
    if (!planted || !practiceFrame || !realFrames) return undefined;
    const realFrame = realFrames.find((frame) => frame.id === practiceFrame.id);
    return realFrame ? editCloseness(realFrame, practiceFrame, edits, planted) : undefined;
  }, [planted, practiceFrame, realFrames, edits]);
}
