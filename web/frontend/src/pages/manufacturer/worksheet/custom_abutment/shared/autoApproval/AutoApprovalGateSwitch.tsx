// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/useAutoApprovalGate.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// change-log:
// - 2026-11-26: 장비 자동 가공은 건드리지 않는다. 준비→가공 승인만 켠다.
// - 2026-10-14: 스위치 옆에 제외 버튼. 모달에서 자동 승인에서 뺄 의뢰자를 고른다.
// - 2026-10-10: 켜면 장비 자동 가공을 토스트로 알리고, 가공 시작은 30초 뒤다.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { AutoApprovalExcludeDialog } from "./AutoApprovalExcludeDialog";
import { useAutoApprovalGate } from "./useAutoApprovalGate";

/**
 * 자동 승인 = 준비→가공 승인 게이트.
 * 켜면 이상 없는 건만 가공으로 넘긴다. 장비 자동 가공은 가공 화면에서 따로 켠다.
 * 피니시라인 불량 등 문제 건은 준비에 남긴다.
 */
export function AutoApprovalGateSwitch() {
  const { token } = useAuthStore();
  const { state: gate, busy, save } = useAutoApprovalGate(token);
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const excludedCount = gate?.excludedRequestors?.length || 0;

  if (!gate) return null;

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
    toast({
      title: "자동 승인을 켰습니다",
      description: "이상 없는 의뢰는 준비에서 가공으로 넘깁니다.",
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
    }
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
        title="켜면 이상 없는 의뢰만 준비에서 가공으로 넘깁니다. 장비 자동 가공은 가공 화면에서 켭니다."
      >
        <span className="font-semibold">자동 승인</span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label="자동 승인"
        />
        <Button
          type="button"
          variant="outline"
          className="h-6 rounded-md px-2 text-[11px] font-semibold"
          onClick={() => setExcludeOpen(true)}
          aria-label="자동 승인 제외"
        >
          제외{excludedCount > 0 ? ` ${excludedCount}` : ""}
        </Button>
        {gate.enabled && gate.holdCount > 0 ? (
          <span
            className="text-slate-500"
            title="준비에 남겨 둔 문제 건입니다. 확인 후 가공으로 넘깁니다."
          >
            확인 {gate.holdCount}
          </span>
        ) : null}
      </div>

      <AutoApprovalExcludeDialog
        open={excludeOpen}
        onOpenChange={setExcludeOpen}
      />

      <ConfirmDialog
        open={confirm}
        title="자동 승인"
        description={
          <>
            이상 없는 의뢰가 자동으로 가공에 들어갑니다.
            <br />
            준비에서 가공으로 넘기는 것만 자동 처리합니다.
            <br />
            장비 자동 가공은 가공 화면에서 따로 켜세요.
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
