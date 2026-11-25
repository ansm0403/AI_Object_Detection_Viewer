import { evidenceLevel, isWeakEvidence, type Verdict } from '@/lib/review';
import { VERDICT_LABELS } from './labels';

// Inline SVG (this project has no icon library). Both icons are sized for the
// 32px object-list rows and carry a text label for screen readers / tooltips.

const OK = '#34d399'; // emerald-400
const NO = '#fb7185'; // rose-400
const UNSURE = '#a1a1aa'; // zinc-400
const IDLE = '#3f3f46'; // zinc-700
const WARN = '#fbbf24'; // amber-400

/**
 * Review status of one box. Four shapes, not only four colours, so the states
 * stay distinguishable without colour vision: check, cross, question mark,
 * empty ring (= not reviewed).
 */
export function StatusIcon({ verdict }: { verdict: Verdict | undefined }) {
  const label = verdict ? VERDICT_LABELS[verdict] : 'Not reviewed';
  return (
    <span title={label} aria-label={label} role="img" className="shrink-0 inline-flex">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {verdict === 'approved' && (
          <>
            <circle cx="8" cy="8" r="7" fill={OK} fillOpacity="0.18" stroke={OK} strokeWidth="1.2" />
            <path d="M4.8 8.3l2.2 2.2 4.2-4.6" stroke={OK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {verdict === 'rejected' && (
          <>
            <circle cx="8" cy="8" r="7" fill={NO} fillOpacity="0.18" stroke={NO} strokeWidth="1.2" />
            <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke={NO} strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
        {verdict === 'unsure' && (
          <>
            <circle cx="8" cy="8" r="7" fill={UNSURE} fillOpacity="0.16" stroke={UNSURE} strokeWidth="1.2" />
            <path d="M6.2 6.3a1.9 1.9 0 1 1 2.7 1.8c-.6.3-.9.7-.9 1.3" stroke="#d4d4d8" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="11.6" r="0.9" fill="#d4d4d8" />
          </>
        )}
        {verdict === undefined && <circle cx="8" cy="8" r="6.4" stroke={IDLE} strokeWidth="1.2" />}
      </svg>
    </span>
  );
}

/**
 * LiDAR evidence as "signal bars": how many LiDAR points the dataset counted
 * inside the box (0 / a few / some / many). Amber when the evidence is weak.
 * The exact count is in the tooltip and in the details panel.
 */
export function EvidenceBars({ points }: { points: number }) {
  const level = evidenceLevel(points);
  const weak = isWeakEvidence(points);
  const on = weak ? WARN : UNSURE;
  const off = weak ? 'rgba(251,191,36,0.28)' : IDLE;
  const label = `${points} LiDAR point${points === 1 ? '' : 's'} in box`;
  const bars: [number, number][] = [
    [0, 5],
    [5, 8.5],
    [10, 12],
  ];
  return (
    <span title={label} aria-label={label} role="img" className="shrink-0 inline-flex">
      <svg width="13" height="12" viewBox="0 0 13 12" aria-hidden="true">
        {bars.map(([x, h], i) => (
          <rect key={x} x={x} y={12 - h} width="3" height={h} rx="0.8" fill={level >= i + 1 ? on : off} />
        ))}
      </svg>
    </span>
  );
}
