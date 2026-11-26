'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReviewExportFileType } from '@/lib/review';

type Props = {
  /**
   * Review records the menu acts on — what an export contains and what a reset
   * deletes. (F7) With scenes this is EVERY scene's records, not the count of
   * the scene on screen: both actions cover all scenes (Edge_F#7 Case 2).
   */
  reviewedCount: number;
  /** (F7) What the count covers, e.g. "in all scenes". Shown next to it. */
  scope?: string;
  /** (F7) A caveat about the export, e.g. scenes that are not loaded yet. */
  exportNote?: string;
  onExport: (type: ReviewExportFileType) => void;
  /** Delete every review of the current scope. */
  onReset: () => void;
};

/**
 * The "Export" menu in the top bar (F4): download the reviews as JSON or CSV,
 * or delete them. Deleting cannot be undone (there is no server copy), so it
 * takes two clicks inside the menu — the first only arms the button and says
 * how many reviews would go.
 */
export function ExportMenu({ reviewedCount, scope, exportNote, onExport, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const empty = reviewedCount === 0;

  const close = () => {
    setOpen(false);
    setArmed(false);
  };

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      // While the menu is open the keyboard belongs to it: stop the event before
      // it reaches the window-level review shortcuts (a stray "A" must not
      // approve a box behind an open menu). Tab / Enter still do their default.
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const item =
    'w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="h-[26px] inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
      >
        Export
        <span aria-hidden="true" className="text-[8px] text-zinc-500">
          ▼
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Export reviews"
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-md bg-zinc-900 py-1 shadow-xl shadow-black/50 ring-1 ring-zinc-700"
        >
          <p className="px-3 pt-1 pb-1.5 text-[11px] text-zinc-500">
            {empty
              ? 'Nothing reviewed yet'
              : `${reviewedCount} reviewed box${reviewedCount === 1 ? '' : 'es'}${scope ? ` ${scope}` : ''} · saved in this browser`}
          </p>
          {exportNote && !empty && (
            <p className="px-3 pb-1.5 text-[11px] text-amber-300/90">{exportNote}</p>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={empty}
            className={item}
            onClick={() => {
              onExport('json');
              close();
            }}
          >
            Download JSON
            <span className="text-[10px] text-zinc-500">for tools</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={empty}
            className={item}
            onClick={() => {
              onExport('csv');
              close();
            }}
          >
            Download CSV
            <span className="text-[10px] text-zinc-500">for spreadsheets</span>
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <button
            type="button"
            role="menuitem"
            disabled={empty}
            // flex-wrap: the armed text ("… delete all 2,424" + "in all scenes · no
            // undo") is wider than the menu; the warning must wrap, not be cut off.
            className={`${item} flex-wrap gap-y-0.5 ${armed ? 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25' : 'text-rose-300'}`}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              onReset();
              close();
            }}
          >
            <span className="whitespace-nowrap">
              {armed
                ? `Click again to delete ${scope ? 'all ' : ''}${reviewedCount}`
                : 'Reset reviews…'}
            </span>
            {armed && (
              <span className="whitespace-nowrap text-[10px] text-rose-300/80">
                {scope ? `${scope} · no undo` : 'no undo'}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
