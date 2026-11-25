'use client';

import { getClassColor } from '@/lib/ui/class-colors';
import { classLabel } from '@/lib/ui/class-label';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

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
    <div className="flex items-center gap-1.5 flex-wrap lg:flex-nowrap">
      <span className={`${SECTION_TITLE_CLASS} mr-1`}>
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
            // The chip shows the short name ("bicycle_rack"); the class itself is
            // still the full one, kept as the tooltip and for screen readers.
            title={classLabel(name) === name ? undefined : name}
            aria-label={name}
            className={[
              // Tighter below 1280px: with nuScenes' seven classes the row did not
              // fit the bar at 1024px and the last chip ("motorcycle") was cut off.
              // Measured: 649px needed, 558px available. The short name saves
              // ~88px and the padding 28px.
              'inline-flex items-center gap-1.5 px-1.5 xl:px-2 py-0.5 rounded-full text-xs select-none whitespace-nowrap',
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
            {classLabel(name)}
          </button>
        );
      })}
    </div>
  );
}
