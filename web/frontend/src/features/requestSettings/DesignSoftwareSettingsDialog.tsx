// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

export type DesignSoftwareMode = "3Shape" | "ExoCAD" | "custom";
/** ExoCAD 버전 SSOT — backend designSoftwareHex.js 와 동일 */
export type ExoCadVersion = "le_3_0" | "ge_3_2";

type DesignSoftwareSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DesignSoftwareMode;
  onModeChange: (mode: DesignSoftwareMode) => void;
  customValue: string;
  onCustomValueChange: (value: string) => void;
  exoCadVersion?: ExoCadVersion | null;
  onExoCadVersionChange?: (version: ExoCadVersion) => void;
  saving?: boolean;
  onSave: () => void;
  /** @deprecated 닫기 차단에 쓰지 않음. 호출부 호환용으로 유지. */
  forceRequired?: boolean;
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
  mode,
  onModeChange,
  customValue,
  onCustomValueChange,
  exoCadVersion = null,
  onExoCadVersionChange,
  saving = false,
  onSave,
  description = "사용 중인 디자인 소프트웨어를 설정해주세요.",
  showAnodizing = false,
  anodizingEnabled = true,
  onAnodizingChange,
  contentClassName,
}: DesignSoftwareSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName || "sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>디자인 소프트웨어 설정</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(value) => {
              if (value === "3Shape" || value === "ExoCAD" || value === "custom") {
                onModeChange(value);
              }
            }}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="3Shape" id="req-settings-design-3shape" />
              <Label htmlFor="req-settings-design-3shape">3Shape</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ExoCAD" id="req-settings-design-exocad" />
              <Label htmlFor="req-settings-design-exocad">ExoCAD</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="req-settings-design-custom" />
              <Label htmlFor="req-settings-design-custom">직접 입력</Label>
            </div>
          </RadioGroup>

          {mode === "custom" ? (
            <Input
              value={customValue}
              onChange={(e) => onCustomValueChange(e.target.value)}
              placeholder="사용 중인 디자인 소프트웨어를 입력해주세요"
              maxLength={120}
              autoFocus
            />
          ) : null}

          {mode === "ExoCAD" ? (
            <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                ExoCAD 3.0(Galway) 이하에서는 STL 내보내기 시 임플란트 헥스가
                약 30° 틀어질 수 있습니다. 3.2(Elefsina) 이상에서는 수정되었습니다.
                사용 중인 버전에 맞는 헥스 보정으로 첫 의뢰를 확인합니다.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">ExoCAD 버전</Label>
                <RadioGroup
                  value={exoCadVersion || ""}
                  onValueChange={(value) => {
                    if (value === "le_3_0" || value === "ge_3_2") {
                      onExoCadVersionChange?.(value);
                    }
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem
                      value="le_3_0"
                      id="req-settings-exocad-le30"
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="req-settings-exocad-le30"
                      className="font-normal leading-snug"
                    >
                      <span className="font-medium">3.0 이하</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        헥스 30° 회전 오류 발생 → 보정본을 원본으로하고, 무보정
                        샘플을 함께 제공
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem
                      value="ge_3_2"
                      id="req-settings-exocad-ge32"
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="req-settings-exocad-ge32"
                      className="font-normal leading-snug"
                    >
                      <span className="font-medium">3.2 이상</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        STL 그대로가 원본 → 30° 확인용 샘플을 함께 가공
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : null}

          {showAnodizing ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="req-settings-anodizing">아노다이징</Label>
                <p className="text-xs text-muted-foreground">
                  제조 주문 기본값으로 저장됩니다
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {anodizingEnabled ? "ON" : "OFF"}
                </span>
                <Switch
                  id="req-settings-anodizing"
                  checked={anodizingEnabled}
                  onCheckedChange={(checked) => onAnodizingChange?.(Boolean(checked))}
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
