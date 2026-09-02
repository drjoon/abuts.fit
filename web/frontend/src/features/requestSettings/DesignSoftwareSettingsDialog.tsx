// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-09-03: space-y가 X를 밀어내던 문제 수정. 닫기 버튼 코너·호버 스타일.
// - 2026-09-03: 아노다이징 제거(툴바 버튼으로). 제목을 ExoCAD 3.0 질문으로.
// - 2026-09-03: 설명 문구 제거·가로폭 축소. ExoCAD 버전 Yes/No + 아노다이징만.
// - 2026-09-03: 3Shape/ExoCAD/직접입력 선택 제거. ExoCAD 버전 + 아노다이징만.
// - 2026-09-03: ExoCAD 안내 축약 — 3.0 이하 여부 + 3.2 업그레이드 권고 + 아노다이징만.
// - 2026-09-03: ExoCAD 3.0 이하 Yes/No + 3.2 업그레이드 권고. 긴 버전별 보정 설명 제거.
// - 2026-08-21: ExoCAD 버전(3.0 이하/3.2 이상) 선택 + 헥스 30도 안내 요약
// - 2026-08-16: 미설정 게이트도 X/취소로 닫기 허용(재진입·새로고침 시 다시 노출).
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/shared/ui/cn";

/** @deprecated 모달에서 소프트웨어 선택 UI 제거. 타입 호환용으로 유지. */
export type DesignSoftwareMode = "3Shape" | "ExoCAD" | "custom";
/** ExoCAD 버전 SSOT — backend designSoftwareHex.js 와 동일 */
export type ExoCadVersion = "le_3_0" | "ge_3_2";

type DesignSoftwareSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exoCadVersion?: ExoCadVersion | null;
  onExoCadVersionChange?: (version: ExoCadVersion) => void;
  saving?: boolean;
  onSave: () => void;
  /** @deprecated 닫기 차단에 쓰지 않음. 호출부 호환용으로 유지. */
  forceRequired?: boolean;
  /** @deprecated 설명 문구 미사용. 호출부 호환용으로 유지. */
  description?: string;
  contentClassName?: string;
};

export function DesignSoftwareSettingsDialog({
  open,
  onOpenChange,
  exoCadVersion = null,
  onExoCadVersionChange,
  saving = false,
  onSave,
  contentClassName,
}: DesignSoftwareSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("gap-5", contentClassName || "sm:max-w-sm")}
        closeClassName="right-3 top-3 rounded-full p-1.5 opacity-60 hover:bg-muted hover:opacity-100 focus:ring-1 focus:ring-offset-0"
        closeIconClassName="h-3.5 w-3.5"
      >
        <DialogHeader className="space-y-3 pr-8">
          <DialogTitle>ExoCAD 3.0 이하인가요?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            3.2 이상으로 업그레이드를 권장합니다.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={exoCadVersion || ""}
          onValueChange={(value) => {
            if (value === "le_3_0" || value === "ge_3_2") {
              onExoCadVersionChange?.(value);
            }
          }}
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="le_3_0" id="req-settings-exocad-le30" />
            <Label htmlFor="req-settings-exocad-le30" className="font-normal">
              예 (3.0 이하)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="ge_3_2" id="req-settings-exocad-ge32" />
            <Label htmlFor="req-settings-exocad-ge32" className="font-normal">
              아니오 (3.2 이상)
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
