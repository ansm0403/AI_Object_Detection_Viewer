'use client';

import type { Frame } from '@/lib/types';
import { getClassColor } from '@/lib/ui/class-colors';

type Props = {
  frame: Frame;
  selectedId: string | null;
};

export function SelectedObjectInfo({ frame, selectedId }: Props) {
  // 2D and 3D are looked up INDEPENDENTLY by the shared id (Immutable Rule #1),
  // not 3D-gated-on-2D. On nuScenes a measured 3D box may have no 2D projection
  // (behind camera / off-screen, Edge_F#2 Case 1); selecting such a box in the
  // 3D viewer must still populate this panel. So we render whenever EITHER
  // exists, and the missing modality's row shows "—". Defensive find — if a
  // stale id slips through (e.g. a frame change leaving an id with no match) we
  // fall through to the placeholder rather than blow up.
  const d2 =
    selectedId !== null
      ? frame.detections2D.find((d) => d.id === selectedId) ?? null
      : null;
  const d3 =
    selectedId !== null
      ? frame.detections3D.find((d) => d.id === selectedId) ?? null
      : null;

  // Shared fields (id / class / confidence) read off whichever box is present.
  // The two carry identical values for these, so either is authoritative.
  const primary = d2 ?? d3;

  if (!primary) {
    return (
      <section className="px-3 py-3">
        <Heading>Selected</Heading>
        <p className="text-xs text-zinc-500">Select a detection to see details.</p>
      </section>
    );
  }

  const color = getClassColor(primary.class);

  return (
    <section className="px-3 py-3 space-y-2">
      <Heading>Selected</Heading>
      <Row label="Class">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
          style={{ backgroundColor: color }}
        />
        <span className="text-zinc-100">{primary.class}</span>
      </Row>
      <Row label="Confidence">
        <span className="text-zinc-100 tabular-nums">
          {primary.confidence.toFixed(3)}
        </span>
      </Row>
      <Row label="2D bbox">
        {d2 ? (
          <span className="text-zinc-300 tabular-nums font-mono text-xs">
            {Math.round(d2.bbox.x)}, {Math.round(d2.bbox.y)} ·{' '}
            {Math.round(d2.bbox.width)}×{Math.round(d2.bbox.height)}
          </span>
        ) : (
          <span className="text-zinc-500 text-xs">—</span>
        )}
      </Row>
      <Row label="3D bbox">
        {d3 ? (
          <span className="text-zinc-300 tabular-nums font-mono text-xs">
            c [{fmt(d3.bbox3D.center[0])}, {fmt(d3.bbox3D.center[1])},{' '}
            {fmt(d3.bbox3D.center[2])}] · s [{fmt(d3.bbox3D.size[0])},{' '}
            {fmt(d3.bbox3D.size[1])}, {fmt(d3.bbox3D.size[2])}]
          </span>
        ) : (
          <span className="text-zinc-500 text-xs">—</span>
        )}
      </Row>
      <Row label="Frame">
        <span className="text-zinc-400 tabular-nums font-mono text-xs">{frame.id}</span>
      </Row>
      <Row label="Id">
        <span className="text-zinc-400 tabular-nums font-mono text-xs">
          {primary.id}
        </span>
      </Row>
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
      {children}
    </h3>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toFixed(2);
}
