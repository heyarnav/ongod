import { cx } from "@/lib/format";
import { ORDER_TIMELINE, TIMELINE_LABEL, timelineProgress } from "@/lib/order-status";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";

/**
 * The archival process as a vertical line: ORDERED ↓ … ↓ DELIVERED.
 * Reached stages are bone; the current stage carries the crimson marker.
 */
export function OrderTimeline({ status }: { status: string }) {
  const progress = timelineProgress(status);
  const cancelled = status === "CANCELLED";

  return (
    <ol className="relative">
      {ORDER_TIMELINE.map((stage, i) => {
        const reached = i <= progress && !cancelled;
        const current = i === progress && !cancelled;
        const last = i === ORDER_TIMELINE.length - 1;
        return (
          <li key={stage} className="relative flex gap-4 pb-7 last:pb-0">
            {/* connector */}
            {!last && (
              <span
                className={cx(
                  "absolute left-[5px] top-4 h-[calc(100%-1rem)] w-px",
                  i < progress && !cancelled ? "bg-bone/126" : "bg-bone/19",
                )}
              />
            )}
            {/* node */}
            <span
              className={cx(
                "relative mt-1 h-[11px] w-[11px] shrink-0 rotate-45 border",
                current
                  ? "border-crimson bg-crimson"
                  : reached
                    ? "border-bone/161 bg-bone/161"
                    : "border-bone/36 bg-transparent",
              )}
            />
            <div>
              <p
                className={cx(
                  "font-mono text-[11px] tracking-[0.2em]",
                  current ? "text-crimson" : reached ? "text-bone/167" : "text-bone/46",
                )}
              >
                {TIMELINE_LABEL[stage].toUpperCase()}
                {current && <span className="ml-3 text-[9px]">— CURRENT STAGE</span>}
              </p>
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="mt-2">
          <ArchiveLabel tone="crimson">ORDER CANCELLED</ArchiveLabel>
        </li>
      )}
    </ol>
  );
}
