// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-10-24: 통장 사본은 치과 기공료를 계좌로 받기 위한 등록.
// - 2026-09-16: 통장 사본 미등록 시 일 1회 안내. 지급일까지 미등록이면 1개월 이월 강조. 설정 CTA는 focus=payout 스크롤.
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LAB_PAYOUT_BANKBOOK_DELAY_NOTICE,
  LAB_PAYOUT_SETTINGS_PATH,
} from "@/shared/settlement/labPayoutBankbook";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LabPayoutBankbookRemindDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>통장 사본 등록</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                치과 기공료를 계좌로 받으려면 통장 사본이 필요합니다.
              </p>
              <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[13px] font-medium leading-relaxed text-amber-950">
                {LAB_PAYOUT_BANKBOOK_DELAY_NOTICE}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>나중에</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              navigate(LAB_PAYOUT_SETTINGS_PATH);
            }}
          >
            설정에서 등록
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
