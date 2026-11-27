import { SAMPLE_VERDICT_NAME, type SampleVerdict } from '@/lib/sampling';

const COLOR: Record<SampleVerdict, string> = {
  'real-object': '#34d399', // emerald-400
  'model-wrong': '#fb7185', // rose-400
  unclear: '#a1a1aa', // zinc-400
};

/** Text colour class of each verdict (buttons, counts). */
export const SAMPLE_VERDICT_TEXT: Record<SampleVerdict, string> = {
  'real-object': 'text-emerald-300',
  'model-wrong': 'text-rose-300',
  unclear: 'text-zinc-300',
};

/** Bar segment colour of each verdict. */
export const SAMPLE_VERDICT_FILL: Record<SampleVerdict, string> = COLOR;

/**
 * The verdict on a sampled model box, as a small icon: a box (a real object is
 * there), a cross (the model was wrong), a question mark (unclear), or a dashed
 * ring for "not judged yet". Inline SVG — this project has no icon library.
 */
export function SampleVerdictIcon({
  verdict,
  size = 14,
}: {
  verdict: SampleVerdict | null;
  size?: number;
}) {
  const label = verdict ? SAMPLE_VERDICT_NAME[verdict] : 'Not judged';
  const color = verdict ? COLOR[verdict] : '#52525b';
  return (
    <span role="img" aria-label={label} title={label} className="shrink-0 inline-flex">
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {verdict === null ? (
          <circle cx="8" cy="8" r="6.4" stroke={color} strokeWidth="1.2" strokeDasharray="2.4 2" />
        ) : (
          <circle cx="8" cy="8" r="7" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.2" />
        )}
        {verdict === 'real-object' && (
          <rect x="4.6" y="5.2" width="6.8" height="5.6" rx="1" stroke={color} strokeWidth="1.5" />
        )}
        {verdict === 'model-wrong' && (
          <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        )}
        {verdict === 'unclear' && (
          <path
            d="M6.1 6.3a1.9 1.9 0 1 1 2.7 1.8c-.5.3-.8.6-.8 1.2M8 11.6v.1"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}
