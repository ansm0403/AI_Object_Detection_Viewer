'use client';

import { QUEUE_ORDERS, type QueueOrder } from '@/lib/review';

const ORDER_LABELS: Record<QueueOrder, string> = {
  scene: 'Scene order',
  evidence: 'Fewest LiDAR pts',
  // (F6) Was "In camera first": with six cameras every box is in some camera,
  // so the useful grouping is BY camera (the photo changes once per group).
  camera: 'By camera',
  unsure: 'Unsure first',
};

type Props = {
  order: QueueOrder;
  onChangeOrder: (order: QueueOrder) => void;
  /** Unreviewed boxes left in the queue (the filtered, ordered list). */
  remaining: number;
};

/**
 * The thin bar under the object-list title (F4): how the list — and with it
 * the review queue walked by J / K — is ordered, and how many boxes are left.
 */
export function QueueBar({ order, onChangeOrder, remaining }: Props) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 h-7 px-3 border-b border-zinc-800 text-[11px] text-zinc-500">
      <label className="flex items-center gap-1.5 min-w-0">
        Order
        <select
          value={order}
          onChange={(e) => {
            onChangeOrder(e.target.value as QueueOrder);
            // A focused <select> swallows letter keys (type-ahead), which would
            // silence the J / K / A shortcuts until the user clicks elsewhere.
            e.currentTarget.blur();
          }}
          className="h-5 min-w-0 rounded bg-zinc-800 pl-1.5 pr-1 text-[11px] text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline-none focus:ring-sky-400/60"
        >
          {QUEUE_ORDERS.map((value) => (
            <option key={value} value={value}>
              {ORDER_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <span className="shrink-0 tabular-nums" title="Unreviewed boxes in this list (after filters)">
        {remaining} to review
      </span>
    </div>
  );
}
