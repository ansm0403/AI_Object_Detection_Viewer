'use client';

import { useEffect, useRef } from 'react';
import { describeValue, type HitOrder, type SearchCondition, type SearchHit } from '@/lib/search';
import { PANEL_CLASS, PanelHeader, useScrollSelectedIntoView } from '@/components/workspace';

type Props = {
  /** The matching frames, already in display order (`sortHits`). */
  hits: readonly SearchHit[];
  conditions: readonly SearchCondition[];
  order: HitOrder;
  onChangeOrder: (order: HitOrder) => void;
  /** The frame on screen (highlighted when it is one of the hits). */
  currentFrameId: string | null;
  onOpen: (hit: SearchHit) => void;
  /** How many scenes have a match, and how many were searched. */
  scenesWithMatches: number;
  scenesSearched: number;
  /** Scenes still loading: the list is not complete yet. */
  scenesPending: number;
  /** Keys shown as the hint for stepping through the list. */
  stepHint?: string;
};

/**
 * (F7) The list in Explore mode: one row per frame that meets the conditions.
 * It takes the place of the object list. A click opens that frame (in whatever
 * scene it is); the frame on screen is the highlighted row.
 *
 * In scene order the rows are grouped under their scene; in value order the
 * scene is named on each row.
 */
export function ExploreResults({
  hits,
  conditions,
  order,
  onChangeOrder,
  currentFrameId,
  onOpen,
  scenesWithMatches,
  scenesSearched,
  scenesPending,
  stepHint,
}: Props) {
  const selectedRef = useScrollSelectedIntoView(currentFrameId, `${order}:${hits.length}`);
  // When the result set changes and the frame on screen is not in it, start at
  // the top: the list keeps its scroll position otherwise, which after a search
  // would leave it somewhere in the middle of an unrelated list.
  const listRef = useRef<HTMLUListElement>(null);
  const currentIsHit = hits.some((hit) => hit.frameId === currentFrameId);
  const listSignature = `${order}:${hits.length}:${hits[0]?.frameId ?? ''}`;
  useEffect(() => {
    if (!currentIsHit && listRef.current) listRef.current.scrollTop = 0;
    // Deliberately keyed on the LIST only: it must not run when the frame on
    // screen changes (that is what `useScrollSelectedIntoView` is for).
  }, [listSignature]);
  const first = conditions[0];
  // Value bars are relative to the largest value in the list.
  const maxValue = hits.reduce((max, hit) => Math.max(max, hit.values[0] ?? 0), 0);
  const perScene = new Map<string, number>();
  for (const hit of hits) perScene.set(hit.scene, (perScene.get(hit.scene) ?? 0) + 1);

  return (
    <div className={`flex h-full flex-col ${PANEL_CLASS}`}>
      <PanelHeader title="Results" count={hits.length}>
        <span className="text-[11px] text-zinc-500 tabular-nums">
          {scenesWithMatches} of {scenesSearched} scene{scenesSearched === 1 ? '' : 's'}
        </span>
      </PanelHeader>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500">
          Order
          <select
            value={order}
            onChange={(e) => onChangeOrder(e.target.value as HitOrder)}
            className="h-6 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[11px] text-zinc-200"
          >
            <option value="scene">Scene order</option>
            <option value="value" disabled={!first || first.kind === 'time'}>
              Largest value first
            </option>
          </select>
        </label>
        {stepHint && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-500">{stepHint}</span>
        )}
      </div>
      {scenesPending > 0 && (
        <p className="shrink-0 border-b border-zinc-800 bg-sky-500/10 px-3 py-1 text-[11px] text-sky-200">
          Loading {scenesPending} more scene{scenesPending === 1 ? '' : 's'} — the list is not complete yet.
        </p>
      )}
      {hits.length === 0 ? (
        <p className="p-4 text-xs text-zinc-500">
          {scenesPending > 0 ? 'No frames match so far.' : 'No frames match.'}
        </p>
      ) : (
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Matching frames">
          {hits.map((hit, index) => {
            const isCurrent = hit.frameId === currentFrameId;
            const startsScene = order === 'scene' && (index === 0 || hits[index - 1].scene !== hit.scene);
            const value = hit.values[0] ?? null;
            return (
              <li key={hit.frameId} ref={isCurrent ? selectedRef : undefined}>
                {startsScene && (
                  <div className="flex items-center justify-between bg-zinc-950/60 px-3 py-1 text-[11px] tabular-nums">
                    <span className="font-medium text-zinc-300">{hit.scene}</span>
                    <span className="text-zinc-500">{perScene.get(hit.scene)} frames</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onOpen(hit)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={[
                    'flex w-full items-center gap-2.5 border-b border-zinc-800/70 px-3 py-1.5 text-left',
                    isCurrent ? 'bg-sky-400/15 ring-1 ring-inset ring-sky-400/50' : 'hover:bg-zinc-800/60',
                  ].join(' ')}
                >
                  {/* Native <img> on purpose (local public/ asset, 3 KB). */}
                  {hit.thumbnailUrl ? (
                    <img
                      src={hit.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      width={56}
                      height={32}
                      className="h-8 w-14 shrink-0 rounded-sm bg-zinc-800 object-cover"
                    />
                  ) : (
                    <span className="h-8 w-14 shrink-0 rounded-sm bg-zinc-800" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                      <span className="font-semibold text-zinc-100">
                        #{hit.frameIndex + 1}
                        {order === 'value' && (
                          <span className="ml-1.5 font-normal text-zinc-500">{hit.scene}</span>
                        )}
                      </span>
                      {first && (
                        <span className="truncate text-amber-300" title={describeValue(first, value)}>
                          {first.kind === 'time' ? '' : (value ?? '–')}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        {first && first.kind !== 'time' && maxValue > 0 && (
                          <span
                            className="block h-full rounded-full bg-amber-400"
                            style={{ width: `${Math.round(((value ?? 0) / maxValue) * 100)}%` }}
                          />
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{hit.boxCount} boxes</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
