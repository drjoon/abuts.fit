// 제공하지 않는 커넥션 — 의뢰자에게 해당 건만 취소 확인.
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  UNSUPPORTED_CONNECTION_CANCEL_LINE,
  UNSUPPORTED_CONNECTION_REQUESTOR_LINE,
  unsupportedConnectionHistoryLabel,
  type UnsupportedConnectionCancelItem,
} from "@/shared/practice/unsupportedConnectionCancel";

type Props = {
  open: boolean;
  items: UnsupportedConnectionCancelItem[];
  busy?: boolean;
  onConfirm: () => void;
};

export function UnsupportedConnectionCancelDialog({
  open,
  items,
  busy = false,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      open={open && items.length > 0}
      title="커넥션 안내"
      confirmLabel="해당 건 의뢰 취소"
      confirmTone="danger"
      showCancel={false}
      showCloseButton={false}
      closeOnBackdrop={false}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={() => {}}
      description={
        <>
          {UNSUPPORTED_CONNECTION_REQUESTOR_LINE}
          <br />
          {UNSUPPORTED_CONNECTION_CANCEL_LINE}
          {items.map((item) => {
            const tooth = String(item.tooth || "").trim();
            const spec = unsupportedConnectionHistoryLabel(item.label);
            const line = tooth ? `${tooth} — ${spec}` : spec;
            return (
              <span key={`${item.requestMongoId}-${tooth}`}>
                <br />
                {line}
              </span>
            );
          })}
        </>
      }
    />
  );
}
