'use client';

import { useEffect, useRef, useState } from 'react';
import {
  describeCondition,
  normalizeCondition,
  sameCondition,
  type SearchCondition,
  type SearchPreset,
} from '@/lib/search';
import { classLabel } from '@/lib/ui/class-label';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  conditions: readonly SearchCondition[];
  onChange: (conditions: SearchCondition[]) => void;
  presets: readonly SearchPreset[];
  /** Class names offered in the "objects" condition (every class of the loaded scenes). */
  classes: readonly string[];
  /** Whether conditions about the model (missed labels, false alarms) are offered. */
  allowModel: boolean;
  matched: number;
  total: number;
};

type Kind = 'objects' | 'no-lidar' | 'night' | 'day' | 'missed' | 'false-alarm' | 'unlabelled';

const KIND_LABEL: Record<Kind, string> = {
  objects: 'Objects of a class',
  'no-lidar': 'Boxes without LiDAR points',
  night: 'Scene is a night scene',
  day: 'Scene is a day scene',
  missed: 'Model: missed labels',
  'false-alarm': 'Model: false alarms',
  unlabelled: 'Model: false alarms with no label nearby',
};
const MODEL_KINDS: readonly Kind[] = ['missed', 'false-alarm', 'unlabelled'];

const CHIP =
  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap transition-colors';
const FIELD =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-sky-400 focus:outline-none';

/**
 * (F7) The bar under the header in Explore mode: the search conditions as
 * chips (all must hold), a small form to add one, ready-made searches, and how
 * many frames match. Presentation only — what a condition MEANS is in
 * `lib/search`.
 */
export function ExploreBar({ conditions, onChange, presets, classes, allowModel, matched, total }: Props) {
  const [editor, setEditor] = useState<{ left: number; top: number } | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const [kind, setKind] = useState<Kind>('objects');
  const [cls, setCls] = useState('person');
  const [within, setWithin] = useState('20');
  const [min, setMin] = useState('5');

  useEffect(() => {
    if (!editor) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (editorRef.current?.contains(target) || addRef.current?.contains(target)) return;
      setEditor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEditor(null);
      addRef.current?.focus();
    };
    const close = () => setEditor(null);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [editor]);

  const toggleEditor = () => {
    if (editor) {
      setEditor(null);
      return;
    }
    const rect = addRef.current?.getBoundingClientRect();
    if (!rect) return;
    setEditor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)), top: rect.bottom + 6 });
  };

  const draft = (): SearchCondition => {
    const minimum = Number(min);
    switch (kind) {
      case 'objects':
        return normalizeCondition({
          kind: 'objects',
          class: cls === '' ? null : cls,
          within: within.trim() === '' ? null : Number(within),
          min: minimum,
        });
      case 'no-lidar':
        return normalizeCondition({ kind: 'no-lidar', min: minimum });
      case 'night':
        return { kind: 'time', night: true };
      case 'day':
        return { kind: 'time', night: false };
      default:
        return normalizeCondition({ kind: 'model', what: kind, min: minimum });
    }
  };
  const addDraft = () => {
    const next = draft();
    // "Night" and "day" exclude each other: the new one replaces the old one.
    const kept = conditions.filter(
      (c) => !sameCondition(c, next) && !(c.kind === 'time' && next.kind === 'time'),
    );
    onChange([...kept, next]);
    setEditor(null);
  };

  const isPresetActive = (preset: SearchPreset) =>
    preset.conditions.length === conditions.length &&
    preset.conditions.every((p) => conditions.some((c) => sameCondition(c, p)));
  const shownPresets = presets.filter(
    (preset) => allowModel || preset.conditions.every((c) => c.kind !== 'model'),
  );
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => allowModel || !MODEL_KINDS.includes(k));
  const needsMin = kind !== 'night' && kind !== 'day';

  return (
    <div className="flex items-center flex-wrap lg:flex-nowrap gap-x-3 gap-y-2 h-full bg-zinc-900/60 border-b border-zinc-800 px-4 py-1.5">
      <span className={`${SECTION_TITLE_CLASS} shrink-0`}>Find frames where</span>
      {/* Narrow screens: the chips wrap (Edge_F#7 Case 5 — in one row they pushed
          the page 196 px sideways at 390 px). Wide: one row, scrolling sideways. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:flex-nowrap lg:overflow-x-auto">
        {conditions.length === 0 && (
          <span className="text-xs text-zinc-500 lg:whitespace-nowrap">no condition — every frame is listed</span>
        )}
        {conditions.map((condition, index) => (
          <span
            key={describeCondition(condition)}
            className={`${CHIP} bg-sky-500/15 text-sky-100 ring-1 ring-inset ring-sky-400/40`}
          >
            {index > 0 && <span className="text-[10px] uppercase text-sky-300/70">and</span>}
            {describeCondition(condition)}
            <button
              type="button"
              onClick={() => onChange(conditions.filter((_, i) => i !== index))}
              aria-label={`Remove condition: ${describeCondition(condition)}`}
              className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-sky-200/80 hover:bg-sky-400/30 hover:text-white"
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <button
          ref={addRef}
          type="button"
          onClick={toggleEditor}
          aria-haspopup="dialog"
          aria-expanded={editor !== null}
          className={`${CHIP} shrink-0 border border-dashed border-zinc-600 text-zinc-300 hover:border-sky-400/60 hover:text-zinc-100`}
        >
          + condition
        </button>
      </div>
      <span aria-hidden="true" className="hidden lg:block w-px h-5 bg-zinc-800 shrink-0" />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:flex-nowrap lg:overflow-x-auto">
        <span className={`${SECTION_TITLE_CLASS} shrink-0`}>Presets</span>
        {shownPresets.map((preset) => {
          const active = isPresetActive(preset);
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.hint}
              aria-pressed={active}
              onClick={() => onChange(active ? [] : [...preset.conditions])}
              className={`${CHIP} shrink-0 ${
                active
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 ml-auto shrink-0">
        <span className="text-xs text-zinc-400 tabular-nums">
          <span className="font-semibold text-zinc-100">{matched}</span> / {total} frames
        </span>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={conditions.length === 0}
          className="text-xs px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:border-sky-400/40 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>

      {editor && (
        <div
          ref={editorRef}
          role="dialog"
          aria-label="Add a condition"
          className="fixed z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl"
          style={{ left: editor.left, top: editor.top }}
        >
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              addDraft();
            }}
          >
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              Count
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={FIELD}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'objects' && (
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-zinc-400">
                  Class
                  <select value={cls} onChange={(e) => setCls(e.target.value)} className={FIELD}>
                    <option value="">any class</option>
                    {classes.map((name) => (
                      <option key={name} value={name} title={name}>
                        {classLabel(name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1 text-[11px] text-zinc-400">
                  Within (m)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={within}
                    onChange={(e) => setWithin(e.target.value)}
                    placeholder="any"
                    className={`${FIELD} tabular-nums`}
                  />
                </label>
              </div>
            )}
            {needsMin && (
              <label className="flex w-24 flex-col gap-1 text-[11px] text-zinc-400">
                At least
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  className={`${FIELD} tabular-nums`}
                />
              </label>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="min-w-0 truncate text-[11px] text-zinc-300" title={describeCondition(draft())}>
                {describeCondition(draft())}
              </span>
              <button
                type="submit"
                className="shrink-0 rounded bg-sky-400 px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-sky-300"
              >
                Add
              </button>
            </div>
            <p className="text-[10px] leading-snug text-zinc-500">
              {kind === 'night' || kind === 'day'
                ? 'Day / night comes from the scene description — nuScenes has no such field.'
                : MODEL_KINDS.includes(kind)
                  ? 'Counted per photo, at the default rules (score ≥ 0.25, IoU ≥ 0.3).'
                  : kind === 'no-lidar'
                    ? 'nuScenes’ own count of LiDAR points inside each box (0 = no sensor evidence).'
                    : 'Distance is measured from the car to the centre of the 3D box.'}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
