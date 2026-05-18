'use client';

// Mirrors Viewer2D / Viewer3D / ObjectList CLASS_COLORS — consolidated in Step 9.
const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};
const DEFAULT_COLOR = '#60a5fa';

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
      <span className="font-semibold uppercase tracking-wide text-xs text-gray-400">
        Classes
      </span>
      {classes.map((name) => {
        const active = showAll || visibleClasses.has(name);
        const color = CLASS_COLORS[name] ?? DEFAULT_COLOR;
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
                ? 'border-white/40 bg-white/5 text-gray-100'
                : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: active ? color : '#374151' }}
            />
            {name}
          </button>
        );
      })}
    </div>
  );
}
