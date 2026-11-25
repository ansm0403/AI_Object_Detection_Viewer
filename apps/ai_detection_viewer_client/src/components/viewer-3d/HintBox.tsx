'use client';

export function HintBox() {
  return (
    <div
      className="absolute bottom-2 right-2 pointer-events-none select-none
                 rounded-md border border-zinc-700 bg-zinc-900/80
                 backdrop-blur-sm px-2 py-1.5 text-[10px] text-zinc-300"
    >
      <div className="flex flex-col gap-0.5 tabular-nums">
        {/* (F3, decision 8) English, matching the rest of the UI. */}
        <span>Drag · rotate</span>
        <span>Scroll · zoom</span>
        <span>Click · select</span>
      </div>
    </div>
  );
}
