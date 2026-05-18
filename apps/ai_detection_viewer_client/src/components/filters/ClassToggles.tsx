'use client';

import { getClassColor } from '@/lib/ui/class-colors';

type Props = {
  // The full set of class names that can be toggled (derived from the current
  // frame in `page.tsx`). Order is preserved as given.
  classes: string[];
  visibleClasses: Set<string>;
  onToggle: (className: string) => void;
};

export function ClassToggles({ classes, visibleClasses, onToggle }: Props) {
  // Permissive-empty semantic: an empty visibleClasses Set means "show all".
  // Render every chip as active in that state so the UI reflects that the
  // first click filters TO that class (not AWAY from it).
  const showAll = visibleClasses.size === 0;

  if (classes.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-semibold uppercase tracking-wide text-xs text-zinc-400">
        Classes
      </span>
      {classes.map((name) => {
        const active = showAll || visibleClasses.has(name);
        const color = getClassColor(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            aria-pressed={active}
            className={[
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs select-none',
              'border transition-colors',
              active
                ? 'border-sky-400/50 bg-sky-400/10 text-zinc-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300',
            ].join(' ')}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: active ? color : '#3f3f46' }}
            />
            {name}
          </button>
        );
      })}
    </div>
  );
}
