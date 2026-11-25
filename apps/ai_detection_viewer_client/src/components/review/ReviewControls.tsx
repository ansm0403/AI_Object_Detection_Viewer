'use client';

import type { MouseEvent, ReactNode } from 'react';
import {
  NOTE_MAX_LENGTH,
  REJECT_REASONS,
  SHORTCUT_KEYS,
  type RejectReason,
  type ReviewBlock,
  type ReviewRecord,
  type Verdict,
} from '@/lib/review';
import { REJECT_REASON_LABELS, REVIEW_BLOCK_MESSAGES, VERDICT_LABELS } from './labels';

type Props = {
  /** The review of the selected box in the current frame, if it has one. */
  record: ReviewRecord | undefined;
  /** Why a verdict cannot be given right now; `null` = it can. */
  blocked: ReviewBlock | null;
  onVerdict: (verdict: Verdict) => void;
  onToggleReason: (reason: RejectReason) => void;
  onNote: (note: string) => void;
  onClear: () => void;
  /**
   * True when the queue (this frame's visible boxes) has no unreviewed box
   * left. The panel then offers the jump to the next unfinished frame.
   */
  queueDone: boolean;
  /** Jump to the next frame with unreviewed boxes; absent when there is none. */
  onNextFrame?: () => void;
};

/**
 * Verdict buttons for the selected box (F4). Sits at the top of the details
 * panel, OUTSIDE its scroll area, so the buttons never scroll away.
 *
 * Controlled and stateless: which box it acts on is decided by the page from
 * `selectedFrameId` + `selectedObjectId` (Immutable Rule #2) — this component
 * only reports clicks. Reasons appear for a rejected box; the note field for a
 * rejected or unsure box (a place to say why it could not be judged).
 */
export function ReviewControls({
  record,
  blocked,
  onVerdict,
  onToggleReason,
  onNote,
  onClear,
  queueDone,
  onNextFrame,
}: Props) {
  const verdict = record?.verdict;
  const disabled = blocked !== null;
  const showReasons = verdict === 'rejected';
  const showNote = verdict === 'rejected' || verdict === 'unsure';
  const needsReason = showReasons && record?.reasons.length === 0;

  return (
    <div className="shrink-0 flex flex-col gap-2 px-3 py-2 border-b border-zinc-800">
      <div className="flex gap-2">
        <VerdictButton
          tone="approve"
          active={verdict === 'approved'}
          dimmed={verdict !== undefined && verdict !== 'approved'}
          disabled={disabled}
          shortcut={SHORTCUT_KEYS.approve}
          onClick={() => onVerdict('approved')}
        >
          <span aria-hidden="true">✓</span>
          {verdict === 'approved' ? 'Approved' : 'Approve'}
        </VerdictButton>
        <VerdictButton
          tone="reject"
          active={verdict === 'rejected'}
          dimmed={verdict !== undefined && verdict !== 'rejected'}
          disabled={disabled}
          shortcut={SHORTCUT_KEYS.reject}
          onClick={() => onVerdict('rejected')}
        >
          <span aria-hidden="true">✕</span>
          {verdict === 'rejected' ? 'Rejected' : 'Reject'}
        </VerdictButton>
        <VerdictButton
          tone="unsure"
          active={verdict === 'unsure'}
          dimmed={verdict !== undefined && verdict !== 'unsure'}
          disabled={disabled}
          shortcut={SHORTCUT_KEYS.unsure}
          title="Looked at it, but this view cannot settle it"
          onClick={() => onVerdict('unsure')}
        >
          Unsure
        </VerdictButton>
      </div>

      {showReasons && (
        <div role="group" aria-label="Reject reasons" className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((reason, index) => {
            const on = record?.reasons.includes(reason) ?? false;
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={(e) => {
                  onToggleReason(reason);
                  blurAfterMouseClick(e);
                }}
                className={[
                  'h-6 pl-1.5 pr-2.5 rounded-full text-[11px] inline-flex items-center gap-1.5 transition-colors',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  on
                    ? 'bg-rose-400/15 text-rose-300 ring-1 ring-inset ring-rose-400/55'
                    : 'text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:text-zinc-200 hover:ring-zinc-500',
                ].join(' ')}
              >
                {/* The number key that toggles this reason. */}
                <span aria-hidden="true" className="font-mono text-[10px] font-semibold opacity-60 w-3 text-center">
                  {index + 1}
                </span>
                {REJECT_REASON_LABELS[reason]}
              </button>
            );
          })}
        </div>
      )}

      {showNote && (
        <input
          type="text"
          aria-label="Review note"
          placeholder="Note (optional)"
          value={record?.note ?? ''}
          maxLength={NOTE_MAX_LENGTH}
          disabled={disabled}
          onChange={(e) => onNote(e.target.value)}
          // Enter / Escape hand the keyboard back to the shortcuts.
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
          className="h-7 w-full rounded-md bg-zinc-950 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 ring-1 ring-inset ring-zinc-800 focus:outline-none focus:ring-sky-400/60 disabled:opacity-40"
        />
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 min-h-4">
        {blocked ? (
          <span>{REVIEW_BLOCK_MESSAGES[blocked]}</span>
        ) : (
          <span className={needsReason ? 'text-amber-300/90' : ''}>
            {verdict
              ? needsReason
                ? 'Rejected · add a reason'
                : VERDICT_LABELS[verdict]
              : 'Not reviewed'}
          </span>
        )}
        <span className="flex items-center gap-2.5 shrink-0">
          <KeyHint keys={SHORTCUT_KEYS.previous}>prev</KeyHint>
          <KeyHint keys={SHORTCUT_KEYS.next}>next</KeyHint>
          {verdict && !blocked && (
            <button
              type="button"
              onClick={(e) => {
                onClear();
                blurAfterMouseClick(e);
              }}
              className="inline-flex items-center gap-1 hover:text-zinc-200"
            >
              <Kbd>{SHORTCUT_KEYS.clear}</Kbd>
              clear
            </button>
          )}
        </span>
      </div>

      {queueDone && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-200 ring-1 ring-inset ring-emerald-400/25">
          <span>{onNextFrame ? 'No unreviewed boxes left in this list' : 'Every box is reviewed'}</span>
          {onNextFrame && (
            <button
              type="button"
              onClick={(e) => {
                onNextFrame();
                blurAfterMouseClick(e);
              }}
              className="inline-flex items-center gap-1.5 font-semibold hover:text-white"
            >
              Next frame
              <Kbd>{SHORTCUT_KEYS.nextFrame}</Kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A verdict advances the selection to the next box. A button clicked with the
 * mouse keeps keyboard focus, so a later Space / Enter would "click" it again —
 * silently giving the SAME verdict to the next box, one nobody looked at. So a
 * mouse click drops focus. A keyboard activation (`detail === 0`) keeps it:
 * that user is deliberately operating the button.
 */
function blurAfterMouseClick(e: MouseEvent<HTMLButtonElement>) {
  if (e.detail > 0) e.currentTarget.blur();
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[3px] border border-current font-mono text-[10px] font-semibold leading-none opacity-70">
      {children}
    </kbd>
  );
}

function KeyHint({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Kbd>{keys}</Kbd>
      {children}
    </span>
  );
}

const TONES = {
  approve: {
    idle: 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/40 hover:bg-emerald-400/20',
    active: 'bg-emerald-400 text-zinc-950',
  },
  reject: {
    idle: 'bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/40 hover:bg-rose-400/20',
    active: 'bg-rose-400 text-zinc-950',
  },
  unsure: {
    idle: 'bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700',
    active: 'bg-zinc-300 text-zinc-950',
  },
} as const;

function VerdictButton({
  tone,
  active,
  dimmed,
  disabled,
  shortcut,
  title,
  onClick,
  children,
}: {
  tone: keyof typeof TONES;
  active: boolean;
  /** Another verdict is set — still clickable (to change it), shown quieter. */
  dimmed: boolean;
  disabled: boolean;
  shortcut: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        onClick();
        blurAfterMouseClick(e);
      }}
      className={[
        'h-8 rounded-md text-[13px] font-semibold inline-flex items-center justify-center gap-1.5',
        'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        // Approve / Reject share the width; Unsure is the narrower third option.
        tone === 'unsure' ? 'px-2.5 font-medium' : 'flex-1',
        active ? TONES[tone].active : TONES[tone].idle,
        dimmed && !disabled ? 'opacity-60 hover:opacity-100' : '',
      ].join(' ')}
    >
      {children}
      <Kbd>{shortcut}</Kbd>
    </button>
  );
}
