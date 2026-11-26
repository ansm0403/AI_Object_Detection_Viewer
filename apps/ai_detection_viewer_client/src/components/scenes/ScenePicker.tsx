'use client';

import { useEffect, useRef, useState } from 'react';
import type { SceneInfo } from '@/lib/nuscenes';
import type { SceneLoadState } from '@/lib/scenes';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

/** A per-scene number shown in the list (review progress, recall, …). */
export type SceneStat = { text: string; title?: string; tone?: 'default' | 'good' | 'alert' };

type ScenePickerProps = {
  scenes: readonly SceneInfo[];
  /** The scene on screen. */
  current: string | null;
  /** A scene that was asked for and is not on screen yet. */
  pending?: { name: string; error: string | null } | null;
  onSelect: (name: string) => void;
  /** Go to the neighbouring scene (‹ ›). */
  onStep: (delta: 1 | -1) => void;
  /** Load state per scene, for the "loading" / "failed" marks in the list. */
  states: ReadonlyMap<string, SceneLoadState>;
  /** Column title and value of the per-scene number; omitted → no column. */
  statLabel?: string;
  stat?: (name: string) => SceneStat | null;
};

const STAT_TONE: Record<NonNullable<SceneStat['tone']>, string> = {
  default: 'text-zinc-300',
  good: 'text-emerald-300',
  alert: 'text-rose-300',
};

const MENU_WIDTH = 640;

/**
 * (F7) Which scene the workspace shows: a button with the scene's name and its
 * place in the list, ‹ › to step, and a list of all scenes that opens upward
 * (the picker sits in the timeline, at the bottom of the window).
 *
 * The list is `position: fixed` — the timeline panel clips its content — and is
 * placed from the button's rectangle when it opens. Presentation only: which
 * scene is on screen, and loading it, is the page's business.
 */
export function ScenePicker({
  scenes,
  current,
  pending,
  onSelect,
  onStep,
  states,
  statLabel,
  stat,
}: ScenePickerProps) {
  const [menu, setMenu] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on a click outside and on Escape; both are only listened for while open.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenu(null);
      buttonRef.current?.focus();
    };
    const onResize = () => setMenu(null);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menu]);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    setMenu({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      bottom: window.innerHeight - rect.top + 6,
    });
  };

  const index = scenes.findIndex((scene) => scene.name === current);
  const loading = pending && !pending.error ? pending.name : null;
  // How many scenes share each drive: scenes cut from one drive are not
  // independent samples, and the list says so.
  const perDrive = new Map<string, number>();
  for (const scene of scenes) {
    if (scene.log) perDrive.set(scene.log.name, (perDrive.get(scene.log.name) ?? 0) + 1);
  }

  const stepClass =
    'inline-flex h-6 w-6 items-center justify-center rounded text-sm text-zinc-300 ' +
    'bg-zinc-800 ring-1 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800';

  return (
    <div className="flex items-center gap-1.5">
      <span className={SECTION_TITLE_CLASS}>Scene</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="listbox"
        aria-expanded={menu !== null}
        aria-label={`Scene: ${current ?? 'none'}. Choose a scene`}
        title={loading ? `Loading ${loading}…` : pending?.error ? `Could not load ${pending.name}` : undefined}
        className="inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium text-zinc-100 bg-zinc-800 ring-1 ring-zinc-700 hover:bg-zinc-700"
      >
        <span className="tabular-nums">{current ?? '—'}</span>
        {loading ? (
          <span className="text-[10px] font-normal text-sky-300 animate-pulse">→ {loading}…</span>
        ) : pending?.error ? (
          <span className="text-[10px] font-normal text-rose-300">{pending.name} failed</span>
        ) : (
          <span className="text-[10px] font-normal text-zinc-500 tabular-nums">
            {index >= 0 ? index + 1 : '–'} / {scenes.length}
          </span>
        )}
        <span aria-hidden="true" className="text-[10px] text-zinc-500">
          ▾
        </span>
      </button>
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={scenes.length < 2}
        aria-label="Previous scene"
        title="Previous scene"
        className={stepClass}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        onClick={() => onStep(1)}
        disabled={scenes.length < 2}
        aria-label="Next scene"
        title="Next scene"
        className={stepClass}
      >
        <span aria-hidden="true">›</span>
      </button>

      {menu && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Scenes"
          className="fixed z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"
          style={{ left: menu.left, bottom: menu.bottom, width: `min(${MENU_WIDTH}px, calc(100vw - 16px))` }}
        >
          <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
            <span className="w-24">Scene</span>
            <span className="flex-1">Drive · description</span>
            <span className="w-12 text-right">Frames</span>
            <span className="w-14 text-right">Boxes</span>
            {statLabel && <span className="w-20 text-right">{statLabel}</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {scenes.map((scene) => {
              const isCurrent = scene.name === current;
              const state = states.get(scene.name);
              const value = stat?.(scene.name) ?? null;
              const shared = scene.log ? (perDrive.get(scene.log.name) ?? 1) : 1;
              return (
                <li key={scene.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => {
                      setMenu(null);
                      onSelect(scene.name);
                    }}
                    className={[
                      'flex w-full items-start gap-3 px-3 py-1.5 text-left text-xs',
                      isCurrent ? 'bg-sky-400/15' : 'hover:bg-zinc-800/70',
                    ].join(' ')}
                  >
                    <span className="w-24 shrink-0">
                      <span className={`block tabular-nums font-medium ${isCurrent ? 'text-sky-200' : 'text-zinc-100'}`}>
                        {scene.name}
                      </span>
                      <span
                        className={`text-[10px] ${scene.night ? 'text-amber-300' : 'text-zinc-500'}`}
                        title="From the scene description — nuScenes has no day/night field"
                      >
                        {scene.night ? 'night' : 'day'}
                      </span>
                    </span>
                    {/* overflow-hidden: in a very narrow window the drive badge must be
                        cut off, not drawn over the number columns (Edge_F#7 Case 5). */}
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="flex items-baseline gap-1.5 text-[11px] tabular-nums">
                        <span
                          className="truncate text-zinc-300"
                          title={scene.log ? `Drive ${scene.log.name}` : undefined}
                        >
                          {scene.log ? `${scene.log.date} · ${scene.log.location}` : 'drive unknown'}
                        </span>
                        {shared > 1 && (
                          <span
                            className="shrink-0 rounded px-1 text-[10px] text-amber-300 ring-1 ring-amber-400/30"
                            title={`${shared} scenes in this list were cut from this one drive (same day, same place, same car). They are not independent samples.`}
                          >
                            1 drive · {shared} scenes
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500" title={scene.description}>
                        {scene.description || '—'}
                      </span>
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-zinc-300">{scene.frameCount}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-300">
                      {scene.boxCount.toLocaleString('en-US')}
                    </span>
                    {statLabel && (
                      <span
                        className={`w-20 shrink-0 text-right tabular-nums ${
                          state === 'failed'
                            ? 'text-rose-300'
                            : value
                              ? STAT_TONE[value.tone ?? 'default']
                              : 'text-zinc-600'
                        }`}
                        title={state === 'failed' ? 'This scene could not be loaded. Select it to try again.' : value?.title}
                      >
                        {state === 'failed' ? 'failed' : value ? value.text : state === 'ready' ? '—' : 'loading…'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
