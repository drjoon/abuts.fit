// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
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

type DesignSoftwareSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DesignSoftwareMode;
  onModeChange: (mode: DesignSoftwareMode) => void;
  customValue: string;
  onCustomValueChange: (value: string) => void;
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
      <DialogContent className={contentClassName || "sm:max-w-md"}>
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
