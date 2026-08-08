// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncToolStatusPanel.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolPanels.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/CncPage.tsx
// - web/frontend/src/features/manufacturer/cnc/components/CncModalShell.tsx
import type { ReactNode } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import {
  CncModalShell,
  type CncModalSize,
} from "@/features/manufacturer/cnc/components/CncModalShell";

interface CncToolStatusModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  toolLifeDirty: boolean;
  health: HealthLevel;
  onRequestClose: () => void;
  onOpenToolOffsetEditor: () => void;
  onSave?: () => void;
  /** 사용 통계 모달로 이동하는 콜백 (제공 시 헤더에 버튼 표시) */
  onOpenUsageStats?: () => void;
}

function modalSize(title: string): CncModalSize {
  if (title === "사용 통계") return "2xl";
  if (title === "공구 상태") return "xl";
  if (
    title === "공구 추가" ||
    title === "템플릿으로 저장" ||
    title === "템플릿 불러오기"
  ) {
    return "sm";
  }
  return "md";
}

function subtitleFor(title: string): string | null {
  if (title === "공구 상태") return "슬롯별 수명 · 옵셋 · 교체";
  if (title === "공구 추가") return "이 장비에 슬롯 등록";
  if (title === "템플릿으로 저장") return "현재 장비 구성을 저장";
  if (title === "템플릿 불러오기")
    return "공구가 없을 때만 적용 · 적용 후 차이만 수정";
  if (title === "사용 통계") return "사용 시간 · 교체 주기";
  return null;
}

export const CncToolStatusModal = ({
  open,
  title,
  body,
  toolLifeDirty: _toolLifeDirty,
  health: _health,
  onRequestClose,
  onOpenToolOffsetEditor: _onOpenToolOffsetEditor,
  onSave,
  onOpenUsageStats,
}: CncToolStatusModalProps) => {
  const isToolStatus = title === "공구 상태";

  return (
    <CncModalShell
      open={open}
      title={title}
      subtitle={subtitleFor(title)}
      size={modalSize(title)}
      onClose={onRequestClose}
      titleId="cnc-tool-modal-title"
      headerActions={
        isToolStatus && onOpenUsageStats ? (
          <button
            type="button"
            onClick={onOpenUsageStats}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            사용 통계
          </button>
        ) : null
      }
      footer={
        isToolStatus ? (
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => {
                if (onSave) onSave();
                onRequestClose();
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              닫기
            </button>
          </div>
        ) : null
      }
    >
      {body}
    </CncModalShell>
  );
};
