import type { ActionReceipt } from '@/lib/action-receipt';

type Props = {
  receipt: ActionReceipt;
};

export function ActionReceiptStrip({ receipt }: Props) {
  return (
    <div
      className="mt-2 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft/80 px-3 py-2 text-left"
      role="status"
    >
      <p className="text-xs font-semibold tracking-wide text-accent">
        {receipt.title}
      </p>
      {receipt.detail ? (
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">
          {receipt.detail}
        </p>
      ) : null}
    </div>
  );
}
