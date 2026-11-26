'use client';

import { formatPercent, ratio, type GroupScore, type ScenesEvaluation } from '@/lib/evaluation';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  evaluation: ScenesEvaluation;
  /** Scenes in the catalog — more than `evaluation` covers while scenes are still loading. */
  scenesTotal: number;
  /** The numbers are catching up with the score slider (they are computed a beat later). */
  stale?: boolean;
  currentScene?: string | null;
  onOpenScene?: (scene: string) => void;
};

const number = (n: number) => n.toLocaleString('en-US');

/**
 * (F7) The "all scenes" block of the evaluation panel: the total, one recall
 * bar per scene, and the day / night split with the number of DRIVES behind
 * each — the context a reader needs before quoting any of these numbers.
 *
 * Pure presentation: every number comes from `evaluateScenes` (lib/evaluation).
 */
export function SceneScores({ evaluation, scenesTotal, stale = false, currentScene, onOpenScene }: Props) {
  const { total, scenes, day, night, notEvaluated } = evaluation;
  const labels = total.counts.found + total.counts.missed;
  const pending = scenesTotal - scenes.length - notEvaluated.length;
  return (
    <section
      className={`px-3 py-2 border-t border-zinc-800 transition-opacity ${stale ? 'opacity-60' : ''}`}
      aria-busy={stale}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className={SECTION_TITLE_CLASS}>All scenes</h3>
        <span className="text-[11px] text-zinc-600 tabular-nums">
          {pending > 0 ? `${scenes.length} of ${scenesTotal} scenes loaded · ` : `${scenes.length} scenes · `}
          {number(total.photos)} photos
        </span>
      </div>
      <p className="text-xs tabular-nums text-zinc-300">
        Precision <span className="font-semibold text-zinc-100">{formatPercent(total.precision)}</span>
        <span className="mx-1.5 text-zinc-700">·</span>
        Recall <span className="font-semibold text-zinc-100">{formatPercent(total.recall)}</span>
        <span className="ml-2 text-[11px] text-zinc-500">
          {number(total.counts.found)} of {number(labels)} labels found
        </span>
      </p>

      <ul className="mt-1.5 space-y-0.5" aria-label="Recall by scene">
        {scenes.map((score) => {
          const scored = score.counts.found + score.counts.missed;
          const value = ratio(score.counts.found, scored);
          const isCurrent = score.scene === currentScene;
          return (
            <li key={score.scene}>
              <button
                type="button"
                onClick={onOpenScene ? () => onOpenScene(score.scene) : undefined}
                disabled={!onOpenScene || isCurrent}
                title={
                  isCurrent
                    ? 'The scene on screen'
                    : `Open ${score.scene}${score.drive ? ` (drive ${score.drive})` : ''}`
                }
                className={[
                  'flex w-full items-center gap-2 rounded px-1 text-left text-xs tabular-nums',
                  isCurrent ? 'cursor-default' : 'hover:bg-zinc-800/70',
                ].join(' ')}
              >
                <span className={`w-[4.75rem] shrink-0 ${isCurrent ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>
                  {score.scene}
                </span>
                <span
                  className={`w-8 shrink-0 text-[10px] ${score.night ? 'text-amber-300' : 'text-transparent'}`}
                  title="From the scene description — nuScenes has no day/night field"
                >
                  night
                </span>
                <span className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                  <span
                    className={`block h-full rounded ${score.night ? 'bg-amber-400' : 'bg-sky-400'}`}
                    style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-zinc-200">{formatPercent(value)}</span>
                <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-zinc-500">
                  {number(score.counts.found)}/{number(scored)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="mt-2 grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-2 gap-y-0.5 text-xs tabular-nums">
        <GroupRow label="Day" group={day} />
        <GroupRow label="Night" group={night} tone="night" />
      </dl>
      {notEvaluated.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-300/90">
          Not evaluated (no predictions): {notEvaluated.join(', ')}
        </p>
      )}
      {pending > 0 && (
        <p className="mt-1 text-[11px] text-sky-200">
          {pending} scene{pending === 1 ? ' is' : 's are'} still loading — these totals are not complete yet.
        </p>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
        What was observed on this data under these rules — not a general property of the model. Frames
        0.5 s apart show the same objects again (about 20 times each), so the independent units are
        the drives{night.scenes > 0 && night.drives === 1 ? `, and all ${night.scenes} night scenes are one drive (one evening, one place)` : ''}.
        The cause of a day / night difference is not established by this.
      </p>
    </section>
  );
}

function GroupRow({ label, group, tone }: { label: string; group: GroupScore; tone?: 'night' }) {
  if (group.scenes === 0) return null;
  const scored = group.counts.found + group.counts.missed;
  return (
    <>
      <dt className={tone === 'night' ? 'text-amber-300' : 'text-zinc-300'}>{label}</dt>
      <dd className="text-[11px] text-zinc-500">
        {group.scenes} scene{group.scenes === 1 ? '' : 's'} ·{' '}
        <span className={group.drives === 1 && group.scenes > 1 ? 'text-amber-300' : undefined}>
          {group.drives} drive{group.drives === 1 ? '' : 's'}
        </span>
      </dd>
      <dd className="text-right font-semibold text-zinc-100">{formatPercent(group.recall)}</dd>
      <dd className="text-right text-[11px] text-zinc-500">
        {number(group.counts.found)}/{number(scored)}
      </dd>
    </>
  );
}
