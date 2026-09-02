// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
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
import { Switch } from "@/components/ui/switch";

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
  /** 게이트/첫 설정 시 아노다이징도 함께 선택 */
  showAnodizing?: boolean;
  anodizingEnabled?: boolean;
  onAnodizingChange?: (enabled: boolean) => void;
  contentClassName?: string;
};

export function DesignSoftwareSettingsDialog({
  open,
  onOpenChange,
  exoCadVersion = null,
  onExoCadVersionChange,
  saving = false,
  onSave,
  showAnodizing = false,
  anodizingEnabled = true,
  onAnodizingChange,
  contentClassName,
}: DesignSoftwareSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName || "sm:max-w-sm"}>
        <DialogHeader>
          <DialogTitle>의뢰 설정</DialogTitle>
          <DialogDescription className="sr-only">
            ExoCAD 버전과 아노다이징을 설정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              ExoCAD 3.0 이하인가요?
            </Label>
            <p className="text-xs text-muted-foreground">
              가능하면 3.2 이상으로 업그레이드를 권장합니다.
            </p>
            <RadioGroup
              value={exoCadVersion || ""}
              onValueChange={(value) => {
                if (value === "le_3_0" || value === "ge_3_2") {
                  onExoCadVersionChange?.(value);
                }
              }}
              className="flex flex-wrap gap-x-4 gap-y-2 pt-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="le_3_0" id="req-settings-exocad-le30" />
                <Label
                  htmlFor="req-settings-exocad-le30"
                  className="font-normal"
                >
                  예 (3.0 이하)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ge_3_2" id="req-settings-exocad-ge32" />
                <Label
                  htmlFor="req-settings-exocad-ge32"
                  className="font-normal"
                >
                  아니오 (3.2 이상)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {showAnodizing ? (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="req-settings-anodizing">아노다이징</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {anodizingEnabled ? "ON" : "OFF"}
                </span>
                <Switch
                  id="req-settings-anodizing"
                  checked={anodizingEnabled}
                  onCheckedChange={(checked) =>
                    onAnodizingChange?.(Boolean(checked))
                  }
                />
              </div>
            </div>
          ) : null}
        </div>

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
