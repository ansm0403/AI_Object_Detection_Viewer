'use client';

import type { ReactNode } from 'react';
import { describeValue, type SceneMatches, type SearchCondition } from '@/lib/search';
import { PANEL_CLASS, PanelHeader, SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  conditions: readonly SearchCondition[];
  /** The frame on screen: its number in the scene, box count, and value per condition. */
  frameIndex: number;
  frameBoxCount: number;
  frameValues: readonly (number | null)[];
  /** Whether the frame on screen meets every condition. */
  frameMatches: boolean;
  /** Matches per scene, in scene order (scenes whose data is loaded). */
  byScene: readonly SceneMatches[];
  currentScene: string | null;
  /** Open the first matching frame of a scene. */
  onOpenScene: (scene: string) => void;
  /** Scenes in the catalog / scenes still loading. */
  scenesTotal: number;
  scenesPending: number;
  framesSearched: number;
  /** A block pinned above the scrolling area: what the selected model box / label is (model conditions). */
  pinned?: ReactNode;
};

/**
 * (F7) The details panel in Explore mode: what the frame on screen measures on
 * each condition, and how the matching frames are spread over the scenes.
 */
export function SearchPanel({
  conditions,
  frameIndex,
  frameBoxCount,
  frameValues,
  frameMatches,
  byScene,
  currentScene,
  onOpenScene,
  scenesTotal,
  scenesPending,
  framesSearched,
  pinned,
}: Props) {
  const usesModel = conditions.some((c) => c.kind === 'model');
  const usesTime = conditions.some((c) => c.kind === 'time');
  return (
    <div className={`flex h-full flex-col ${PANEL_CLASS}`}>
      <PanelHeader title="Search">
        <span className="text-[11px] text-zinc-500 tabular-nums">
          {scenesPending > 0
            ? `${scenesTotal - scenesPending} / ${scenesTotal} scenes loaded`
            : `all ${scenesTotal} scenes`}{' '}
          · {framesSearched} frames
        </span>
      </PanelHeader>
      {pinned}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-zinc-800 px-3 py-2.5">
          <h3 className={SECTION_TITLE_CLASS}>
            This frame
            <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-500 tabular-nums">
              #{frameIndex} · {frameBoxCount} boxes
            </span>
          </h3>
          {conditions.length === 0 ? (
            <p className="mt-1.5 text-xs text-zinc-500">
              Add a condition above, or pick a preset, to find frames.
            </p>
          ) : (
            <>
              <ul className="mt-1.5 flex flex-col gap-1">
                {conditions.map((condition, index) => {
                  const value = frameValues[index] ?? null;
                  const ok =
                    value !== null && (condition.kind === 'time' ? value === 1 : value >= condition.min);
                  return (
                    <li key={describeValue(condition, 0)} className="flex items-baseline gap-2 text-xs">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${ok ? 'bg-amber-400' : 'bg-zinc-600'}`}
                      />
                      <span className={ok ? 'text-zinc-100' : 'text-zinc-500'}>
                        {condition.kind === 'time'
                          ? ok
                            ? describeValue(condition, value)
                            : `not a ${describeValue(condition, value)}`
                          : describeValue(condition, value)}
                        {condition.kind !== 'time' && (
                          <span className="ml-1.5 text-zinc-500 tabular-nums">(needs ≥ {condition.min})</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className={`mt-1.5 text-[11px] ${frameMatches ? 'text-amber-300' : 'text-zinc-500'}`}>
                {frameMatches ? 'This frame matches the search.' : 'This frame does not match the search.'}
              </p>
            </>
          )}
        </section>

        <section className="px-3 py-2.5">
          <h3 className={SECTION_TITLE_CLASS}>Matching frames by scene</h3>
          <ul className="mt-1.5 flex flex-col">
            {byScene.map((entry) => {
              const isCurrent = entry.scene === currentScene;
              const share = entry.total > 0 ? entry.matched / entry.total : 0;
              return (
                <li key={entry.scene}>
                  <button
                    type="button"
                    onClick={() => onOpenScene(entry.scene)}
                    disabled={entry.matched === 0}
                    title={
                      entry.matched === 0
                        ? 'No matching frame in this scene'
                        : `Open the first matching frame of ${entry.scene}`
                    }
                    className={[
                      'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] tabular-nums',
                      entry.matched === 0 ? 'cursor-default' : 'hover:bg-zinc-800/70',
                    ].join(' ')}
                  >
                    <span className={`w-[4.75rem] shrink-0 ${isCurrent ? 'font-semibold text-zinc-100' : 'text-zinc-400'}`}>
                      {entry.scene}
                    </span>
                    <span
                      className={`w-8 shrink-0 text-[10px] ${entry.night ? 'text-amber-300' : 'text-transparent'}`}
                      title="From the scene description"
                    >
                      night
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <span
                        className="block h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </span>
                    <span className={`w-14 shrink-0 text-right ${entry.matched === 0 ? 'text-zinc-600' : isCurrent ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>
                      {entry.matched} / {entry.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {scenesPending > 0 && (
            <p className="mt-1.5 text-[11px] text-sky-200">
              {scenesPending} scene{scenesPending === 1 ? ' is' : 's are'} still loading and not searched yet.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            The search runs on the same boxes and the same functions the workspace uses, so an opened
            frame shows exactly the count in the list.
            {usesModel && ' Model conditions use the default rules (score ≥ 0.25, IoU ≥ 0.3), counted per photo.'}
            {usesTime && ' Day / night is read from the scene description; nuScenes has no such field.'}
          </p>
        </section>
      </div>
    </div>
  );
}
