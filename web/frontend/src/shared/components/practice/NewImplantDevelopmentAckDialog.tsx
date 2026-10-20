import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  NEW_IMPLANT_DEVELOPMENT_ACK_BODY,
  NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP,
  NEW_IMPLANT_DEVELOPMENT_ACK_TITLE,
} from "@/shared/practice/newImplantQuickPresets";

type Props = {
  open: boolean;
  lines: string[];
  onConfirm: () => void;
};

export function NewImplantDevelopmentAckDialog({
  open,
  lines,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      open={open && lines.length > 0}
      title={NEW_IMPLANT_DEVELOPMENT_ACK_TITLE}
      confirmLabel="확인"
      confirmTone="primary"
      showCancel={false}
      showCloseButton={false}
      closeOnBackdrop={false}
      onConfirm={onConfirm}
      onCancel={() => {}}
      description={
        <>
          {NEW_IMPLANT_DEVELOPMENT_ACK_BODY}
          <br />
          {NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP}
          {lines.map((line) => (
            <span key={line}>
              <br />
              {line}
            </span>
          ))}
        </>
      }
    />
  );
}
