'use client';

import type { Frame } from '@/lib/types';
import { getClassColor } from '@/lib/ui/class-colors';

type Props = {
  frame: Frame;
  selectedId: string | null;
};

export function SelectedObjectInfo({ frame, selectedId }: Props) {
  // Defensive find — `handleSelectFrame` clears the object selection on
  // frame change, but if a stale id ever slips through we render the same
  // placeholder rather than blow up. Same vocabulary as Step 5's
  // "nonexistent id is stored as-is, no highlight rendered" contract.
  const d2 =
    selectedId !== null
      ? frame.detections2D.find((d) => d.id === selectedId) ?? null
      : null;
  const d3 =
    d2 !== null ? frame.detections3D.find((d) => d.id === d2.id) ?? null : null;

  if (!d2) {
    return (
      <section className="px-3 py-3">
        <Heading>Selected</Heading>
        <p className="text-xs text-zinc-500">Select a detection to see details.</p>
      </section>
    );
  }

  const color = getClassColor(d2.class);
  const { x, y, width, height } = d2.bbox;

  return (
    <section className="px-3 py-3 space-y-2">
      <Heading>Selected</Heading>
      <Row label="Class">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
          style={{ backgroundColor: color }}
        />
        <span className="text-zinc-100">{d2.class}</span>
      </Row>
      <Row label="Confidence">
        <span className="text-zinc-100 tabular-nums">{d2.confidence.toFixed(3)}</span>
      </Row>
      <Row label="2D bbox">
        <span className="text-zinc-300 tabular-nums font-mono text-xs">
          {Math.round(x)}, {Math.round(y)} · {Math.round(width)}×{Math.round(height)}
        </span>
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
        <span className="text-zinc-400 tabular-nums font-mono text-xs">{d2.id}</span>
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
