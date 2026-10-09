// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/useAutoApprovalGate.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// change-log:
// - 2026-10-09: 준비·가공이 같은 스위치를 쓴다. 설정은 서버 한 곳이라 한쪽을 바꾸면 다른 쪽도 바뀐다.
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useAutoApprovalGate } from "./useAutoApprovalGate";

/**
 * 자동 승인 = 준비→가공 승인 게이트 + 장비별 자동 가공.
 * 켜면 이상 없는 건을 자동으로 가공에 넘긴다(섀도 모드 없음).
 * 장비 카드에서 장비별 자동 가공을 끄면 그 장비만 자동 가공에서 빠진다.
 */
export function AutoApprovalGateSwitch() {
  const { token } = useAuthStore();
  const { state: gate, busy, save, setMachinesAuto, machinesAutoEnabled } =
    useAutoApprovalGate(token);
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);

  if (!gate) return null;

  // 전체 스위치는 게이트 설정만 따른다. 장비별 자동 스위치는 독립이라 일부가 꺼져도 유지한다.
  const on = gate.enabled;

  const turnOn = async () => {
    const ok = await save({ enabled: true });
    if (!ok) {
      toast({
        title: "자동 승인 설정 실패",
        description: "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!machinesAutoEnabled) await setMachinesAuto(true);
  };

  const turnOff = async () => {
    const ok = await save({ enabled: false });
    if (!ok) {
      toast({
        title: "자동 승인 설정 실패",
        description: "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    if (machinesAutoEnabled) await setMachinesAuto(false);
  };

  const onToggle = (next: boolean) => {
    if (!next) {
      void turnOff();
      return;
    }
    setConfirm(true);
  };

  return (
    <>
      <div
        className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
        title="켜면 이상 없는 의뢰를 가공으로 자동 승인하고, 장비별 자동 가공도 함께 켭니다. 끄면 현재 가공 중인 건은 그대로 진행되고 다음 자동 시작만 멈춥니다."
      >
        <span className="font-semibold">자동 승인</span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label="자동 승인"
        />
        {gate.enabled ? (
          <span className="text-slate-500">
            보류 {gate.holdCount}
          </span>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm}
        title="자동 승인"
        description={
          <>
            이상 없는 의뢰가 자동으로 가공에 들어갑니다.
            <br />
            테스트 계정과 준비 단계 문제 건은 준비에 남습니다.
            <br />
            CAM·가공 후 문제는 장비 카드 보류에서 확인합니다.
          </>
        }
        confirmLabel="켜기"
        cancelLabel="취소"
        confirmTone="primary"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await turnOn();
        }}
      />
    </>
  );
}
