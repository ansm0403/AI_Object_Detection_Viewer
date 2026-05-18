'use client';

export function HintBox() {
  return (
    <div
      className="absolute bottom-2 right-2 pointer-events-none select-none
                 rounded-md border border-zinc-700 bg-zinc-900/80
                 backdrop-blur-sm px-2 py-1.5 text-[10px] text-zinc-300"
    >
      <div className="flex flex-col gap-0.5 tabular-nums">
        <span>드래그 · 회전</span>
        <span>휠 · 줌</span>
        <span>클릭 · 선택</span>
      </div>
    </div>
  );
}
