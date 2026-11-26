'use client';

import type { UnlabelledFalseAlarm } from '@/lib/evaluation';
import { cameraShortName } from '@/lib/cameras';
import type { ReviewMap } from '@/lib/review';
import {
  SAMPLE_VERDICTS,
  SAMPLE_VERDICT_NAME,
  verdictOfItem,
  type SampleSummary,
} from '@/lib/sampling';
import { classLabel } from '@/lib/ui/class-label';
import { PANEL_CLASS, PanelHeader, useScrollSelectedIntoView } from '@/components/workspace';
import { SampleVerdictIcon } from './icons';

/** "scene-0757" → "0757"; any other name is shown as it is. */
const shortScene = (name: string): string => name.replace(/^scene-/, '');

type Props = {
  /** The sampled boxes, in the order they were drawn. */
  sample: readonly UnlabelledFalseAlarm[];
  records: ReviewMap;
  summary: SampleSummary | null;
  /** The prediction id of the box on screen, if it is one of the sample. */
  selectedId: string | null;
  onOpen: (item: UnlabelledFalseAlarm) => void;
  /** Shown instead of the rows while the sample cannot be listed. */
  unavailable?: string;
  /** e.g. "J / K to step". */
  stepHint?: string;
};

/**
 * (F7.5) The list slot during the sample check: the sampled model boxes, in
 * drawn order, each with the verdict it has so far. A row opens the box —
 * whatever scene, frame and camera it is in.
 *
 * Pure presentation: which boxes, in which order, comes from `lib/sampling`.
 */
export function SampleList({ sample, records, summary, selectedId, onOpen, unavailable, stepHint }: Props) {
  const selectedRef = useScrollSelectedIntoView(selectedId);
  return (
    <div className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title="Sample" count={sample.length > 0 ? sample.length : undefined}>
        {stepHint && <span className="text-[11px] text-zinc-500">{stepHint}</span>}
      </PanelHeader>
      {summary && (
        <div
          className="shrink-0 flex items-center gap-3 h-7 px-3 border-b border-zinc-800 text-[11px] text-zinc-400 tabular-nums"
          aria-label="Verdicts so far"
        >
          {SAMPLE_VERDICTS.map((verdict) => (
            <span key={verdict} className="inline-flex items-center gap-1" title={SAMPLE_VERDICT_NAME[verdict]}>
              <SampleVerdictIcon verdict={verdict} size={12} />
              {summary.counts[verdict]}
            </span>
          ))}
          <span className="ml-auto text-zinc-500">{summary.size - summary.judged} to go</span>
        </div>
      )}
      {unavailable ? (
        <p className="flex-1 min-h-0 px-3 py-4 text-xs text-zinc-500">{unavailable}</p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-800/60" aria-label="Sampled boxes">
          {sample.map((item, index) => {
            const isSelected = item.predictionId === selectedId;
            const verdict = verdictOfItem(records, item);
            return (
              <li
                key={item.predictionId}
                ref={isSelected ? selectedRef : undefined}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onOpen(item)}
                title={`${item.scene} · frame ${item.frameIndex + 1} · ${item.camera}`}
                className={[
                  'flex items-center gap-2 px-3 h-8 cursor-pointer select-none tabular-nums',
                  'transition-colors duration-100',
                  isSelected ? 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60' : 'hover:bg-zinc-800/60',
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-right text-[11px] text-zinc-500">{index + 1}</span>
                <SampleVerdictIcon verdict={verdict} />
                <span className="flex-1 min-w-0 truncate text-sm text-zinc-100">{classLabel(item.class)}</span>
                <span className="w-7 shrink-0 text-right text-[11px] text-zinc-300" title="Score of the model box">
                  {item.score.toFixed(2)}
                </span>
                {/* The scene's number only ("0757"): the full name is in the row's
                    tooltip, and the class name needs the room in a 240 px list. */}
                <span className="w-8 shrink-0 text-right text-[11px] text-zinc-500">{shortScene(item.scene)}</span>
                <span className="w-6 shrink-0 rounded px-0.5 text-center text-[10px] font-semibold text-zinc-400 ring-1 ring-inset ring-zinc-700">
                  {cameraShortName(item.camera)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
