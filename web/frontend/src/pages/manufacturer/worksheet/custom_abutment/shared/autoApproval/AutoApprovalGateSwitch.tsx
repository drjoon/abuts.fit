// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/useAutoApprovalGate.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// change-log:
// - 2026-10-10: 켜면 장비 자동 가공을 토스트로 알리고, 가공 시작은 30초 뒤다.
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useAutoApprovalGate } from "./useAutoApprovalGate";

/**
 * 자동 승인 = 준비→가공 승인 게이트 + 장비별 자동 가공.
 * 켜면 이상 없는 건만 가공으로 넘기고, 장비 자동 가공도 함께 켠다.
 * 피니시라인 불량 등 문제 건은 준비에 남긴다.
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
    if (!machinesAutoEnabled) {
      const machinesOk = await setMachinesAuto(true);
      if (!machinesOk) return;
    }
    toast({
      title: "장비 자동 가공을 켰습니다",
      description: (
        <>
          30초 후 가공을 시작합니다.
          <br />
          끄려면 가공 화면에서 장비 자동 스위치를 끄세요.
        </>
      ),
    });
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
        title="켜면 이상 없는 의뢰만 가공으로 넘깁니다. 장비 자동 가공은 30초 후 시작합니다."
      >
        <span className="font-semibold">자동 승인</span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label="자동 승인"
        />
        {gate.enabled && gate.holdCount > 0 ? (
          <span
            className="text-slate-500"
            title="준비에 남겨 둔 문제 건입니다. 확인 후 가공으로 넘깁니다."
          >
            확인 {gate.holdCount}
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
            장비 자동 가공을 켜고, 30초 후 시작합니다.
            <br />
            끄려면 가공 화면에서 장비 자동 스위치를 끄세요.
            <br />
            피니시라인 불량 등 문제 건은 준비에 남습니다.
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
