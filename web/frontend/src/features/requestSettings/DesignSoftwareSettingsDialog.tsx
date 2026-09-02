// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
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
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  ExoCAD 3.0(Galway) 이하인가요?
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  3.0 이하에서는 STL 내보내기 시 임플란트 헥스가 약 30° 틀어질 수
                  있습니다. 3.2(Elefsina) 이상으로 업그레이드를 권장합니다.
                </p>
                <RadioGroup
                  value={exoCadVersion || ""}
                  onValueChange={(value) => {
                    if (value === "le_3_0" || value === "ge_3_2") {
                      onExoCadVersionChange?.(value);
                    }
                  }}
                  className="space-y-2 pt-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="le_3_0"
                      id="req-settings-exocad-le30"
                    />
                    <Label
                      htmlFor="req-settings-exocad-le30"
                      className="font-normal"
                    >
                      예 (3.0 이하)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="ge_3_2"
                      id="req-settings-exocad-ge32"
                    />
                    <Label
                      htmlFor="req-settings-exocad-ge32"
                      className="font-normal"
                    >
                      아니오 (3.2 이상)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {exoCadVersion === "le_3_0" ? (
                <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  헥스 30° 보정이 필요할 수 있어 관리 대상으로 등록됩니다.
                  가능하면 ExoCAD 3.2 이상으로 업그레이드해 주세요. 스캔바디
                  라이브러리별로 패치 여부가 다를 수 있어, 임플란트 제조사별
                  설정은 관리자가 확인합니다.
                </p>
              ) : null}
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
