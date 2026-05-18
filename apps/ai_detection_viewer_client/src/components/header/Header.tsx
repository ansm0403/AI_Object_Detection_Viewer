'use client';

type HeaderProps = {
  frameIndex: number;
  frameCount: number;
  detectionCount: number;
};

export function Header({ frameIndex, frameCount, detectionCount }: HeaderProps) {
  return (
    <header className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1 bg-zinc-900 rounded-lg px-4 py-3">
      <span className="text-sm font-semibold text-zinc-100 tracking-tight">
        AI Detection Viewer
      </span>
      <span className="text-xs text-zinc-400 tabular-nums">
        Frame {frameIndex}/{frameCount} · {detectionCount} detections
      </span>
    </header>
  );
}
