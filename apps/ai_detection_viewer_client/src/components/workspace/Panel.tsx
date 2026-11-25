import type { ReactNode } from 'react';

/**
 * Shared panel look for the workspace (F3-D). One rule for every pane:
 * background, border, corner radius, title row. Kept as plain class strings and
 * two tiny components so each pane keeps its own markup and behaviour.
 *
 * Border, not `ring-inset`: an inset ring is painted UNDER the content, so a
 * camera photo or the 3D canvas filling the pane hid it. A real border sits
 * outside the content box and stays visible.
 */
export const PANEL_CLASS =
  'bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden';

/** Title style for a section inside a panel (e.g. "Selected", "Classes"). */
export const SECTION_TITLE_CLASS =
  'text-[11px] font-semibold text-zinc-400 uppercase tracking-wider';

/** Panel / section title with an optional count, e.g. "OBJECTS 40". */
export function PanelTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className={SECTION_TITLE_CLASS}>
      {title}
      {count !== undefined && (
        <span className="ml-1.5 text-zinc-500 font-normal tracking-normal tabular-nums">
          {count}
        </span>
      )}
    </h2>
  );
}

/** The 32px title row at the top of a data panel (list, details). */
export function PanelHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  /** Optional right-hand content (e.g. "13 in camera"). */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 h-8 px-3 border-b border-zinc-800 shrink-0">
      <PanelTitle title={title} count={count} />
      {children}
    </div>
  );
}

/**
 * Name tag in the top-left corner of a viewer (3D, camera). Viewers get a tag
 * instead of a title row so the image / scene keeps the full pane height.
 * `pointer-events-none`: clicks and drags pass through to the viewer.
 */
export function ViewerLabel({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-2 left-2 z-10 pointer-events-none select-none rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 bg-zinc-950/70 ring-1 ring-zinc-700">
      {children}
    </span>
  );
}
