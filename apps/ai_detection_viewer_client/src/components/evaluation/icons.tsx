import { OUTCOME_COLOR, OUTCOME_HINT, OUTCOME_LABEL, type EvalKind } from '@/lib/evaluation';

/**
 * One evaluation outcome as an icon. Four SHAPES, not only four colours, so the
 * outcomes stay distinguishable without colour vision: check (found), cross
 * (missed), exclamation mark (false alarm), dash (not scored).
 *
 * Inline SVG — this project has no icon library.
 */
export function OutcomeIcon({ kind, size = 14 }: { kind: EvalKind; size?: number }) {
  const color = OUTCOME_COLOR[kind];
  return (
    <span
      title={`${OUTCOME_LABEL[kind]} — ${OUTCOME_HINT[kind]}`}
      aria-label={OUTCOME_LABEL[kind]}
      role="img"
      className="shrink-0 inline-flex"
    >
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.2" />
        {kind === 'found' && (
          <path d="M4.8 8.3l2.2 2.2 4.2-4.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {kind === 'missed' && (
          <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        )}
        {kind === 'false-alarm' && (
          <>
            <path d="M8 4.3v4.4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="8" cy="11.4" r="1" fill={color} />
          </>
        )}
        {kind === 'not-scored' && (
          <path d="M5 8h6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}
