// related files:
// - web/backend/controllers/cnc/autoMachiningGate.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useAutoApprovalGate.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// change-log:
// - 2026-10-09: 전체 자동 스위치를 대체. 켜면 장비별 자동 가공도 함께 켠다. 공통 ConfirmDialog.
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useToast } from "@/shared/hooks/use-toast";
import type { GateState } from "../hooks/useAutoApprovalGate";

type Props = {
  gate: GateState | null;
  busy: boolean;
  save: (patch: { enabled?: boolean; mode?: "shadow" | "live" }) => Promise<boolean>;
  /** 장비별 자동 가공을 모두 켜거나 끈다(기존 「전체 자동」). */
  machinesAutoEnabled: boolean;
  setMachinesAuto: (enabled: boolean) => Promise<void>;
};

/**
 * 자동 승인 = 준비→가공 승인 게이트 + 장비별 자동 가공.
 * 섀도는 판정만 기록하고, 라이브는 이상 없는 건을 자동으로 가공에 넘긴다.
 */
export function AutoApprovalGateSwitch({
  gate,
  busy,
  save,
  machinesAutoEnabled,
  setMachinesAuto,
}: Props) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | { kind: "on" | "live" }>(null);

  if (!gate) return null;

  const on = gate.enabled && machinesAutoEnabled;

  const turnOn = async () => {
    const ok = await save({ enabled: true });
    if (!ok) {
      toast({ title: "자동 승인 설정 실패", description: "잠시 후 다시 시도해 주세요.", variant: "destructive" });
      return;
    }
    if (!machinesAutoEnabled) await setMachinesAuto(true);
  };

  const turnOff = async () => {
    const ok = await save({ enabled: false });
    if (!ok) {
      toast({ title: "자동 승인 설정 실패", description: "잠시 후 다시 시도해 주세요.", variant: "destructive" });
      return;
    }
    if (machinesAutoEnabled) await setMachinesAuto(false);
  };

  const onToggle = (next: boolean) => {
    if (!next) {
      void turnOff();
      return;
    }
    if (gate.mode === "live") setConfirm({ kind: "on" });
    else void turnOn();
  };

  const onMode = (mode: "shadow" | "live") => {
    if (mode === gate.mode) return;
    if (mode === "live") setConfirm({ kind: "live" });
    else void save({ mode });
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
        <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
          {(["shadow", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => onMode(m)}
              className={`px-2 py-0.5 text-[11px] font-semibold ${
                gate.mode === m
                  ? m === "live"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-700 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {m === "live" ? "라이브" : "섀도"}
            </button>
          ))}
        </div>
        {gate.enabled ? (
          <span className="text-slate-500">
            {gate.mode === "live"
              ? `보류 ${gate.holdCount}`
              : `통과 ${gate.wouldApproveCount} · 보류 ${gate.holdCount}`}
          </span>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="라이브 자동 승인"
        description={
          <>
            이상 없는 의뢰가 자동으로 가공에 들어갑니다.
            <br />
            보류된 의뢰는 준비에 남고, 장비 카드에서 확인할 수 있습니다.
          </>
        }
        confirmLabel={confirm?.kind === "on" ? "켜기" : "라이브로 전환"}
        cancelLabel="취소"
        confirmTone="primary"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const kind = confirm?.kind;
          setConfirm(null);
          if (kind === "on") await turnOn();
          else if (kind === "live") await save({ mode: "live" });
        }}
      />
    </>
  );
}
