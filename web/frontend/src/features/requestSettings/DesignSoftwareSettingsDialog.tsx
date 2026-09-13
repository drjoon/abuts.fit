// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-09-13: 아노다이징 미설정 시 모달에 ON/OFF 선택 복구(첫 CA STL 업로드·작업시작 게이트).
// - 2026-09-08: 버전 라벨을 예/아니오 → 3.0 이하·3.2 이상으로(비ExoCAD 아니오와 혼동 방지).
// - 2026-09-08: ExoCAD 사용 여부 먼저 → 예일 때만 버전 질문.
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
  /** null = 미선택. ExoCAD 사용 여부 */
  usesExoCad?: boolean | null;
  onUsesExoCadChange?: (uses: boolean) => void;
  exoCadVersion?: ExoCadVersion | null;
  onExoCadVersionChange?: (version: ExoCadVersion) => void;
  /** 아노다이징을 한 번도 저장하지 않았을 때 모달에서 ON/OFF 선택 */
  showAnodizing?: boolean;
  anodizingEnabled?: boolean;
  onAnodizingEnabledChange?: (enabled: boolean) => void;
  /** false면 ExoCAD 질문 숨김(아노다이징만 게이트) */
  showDesignSoftware?: boolean;
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
  usesExoCad = null,
  onUsesExoCadChange,
  exoCadVersion = null,
  onExoCadVersionChange,
  showAnodizing = false,
  anodizingEnabled = true,
  onAnodizingEnabledChange,
  showDesignSoftware = true,
  saving = false,
  onSave,
  contentClassName,
}: DesignSoftwareSettingsDialogProps) {
  const usesValue =
    usesExoCad === true ? "yes" : usesExoCad === false ? "no" : "";
  const anodizingOnly = showAnodizing && !showDesignSoftware;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("gap-5", contentClassName || "sm:max-w-sm")}
        closeClassName="right-3 top-3 rounded-full p-1.5 opacity-60 hover:bg-muted hover:opacity-100 focus:ring-1 focus:ring-offset-0"
        closeIconClassName="h-3.5 w-3.5"
      >
        <DialogHeader className="space-y-3 pr-8">
          <DialogTitle>
            {anodizingOnly
              ? "아노다이징을 사용하시나요?"
              : "ExoCAD를 사용하시나요?"}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {anodizingOnly
              ? "기공소 기본값으로 저장되며, 이후 제조 주문에 반영됩니다."
              : "ExoCAD인 경우 버전에 따라 헥스 보정이 달라질 수 있습니다."}
          </DialogDescription>
        </DialogHeader>

        {showDesignSoftware ? (
          <>
            <RadioGroup
              value={usesValue}
              onValueChange={(value) => {
                if (value === "yes") onUsesExoCadChange?.(true);
                if (value === "no") onUsesExoCadChange?.(false);
              }}
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="req-settings-exocad-yes" />
                <Label htmlFor="req-settings-exocad-yes" className="font-normal">
                  예
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="req-settings-exocad-no" />
                <Label htmlFor="req-settings-exocad-no" className="font-normal">
                  아니오 (다른 소프트웨어)
                </Label>
              </div>
            </RadioGroup>

            {usesExoCad === true ? (
              <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">ExoCAD 버전</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    3.2 이상으로 업그레이드를 권장합니다.
                  </p>
                </div>
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
                    <RadioGroupItem
                      value="le_3_0"
                      id="req-settings-exocad-le30"
                    />
                    <Label
                      htmlFor="req-settings-exocad-le30"
                      className="font-normal"
                    >
                      3.0 이하
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
                      3.2 이상
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            ) : null}
          </>
        ) : null}

        {showAnodizing ? (
          <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">아노다이징</Label>
              {!anodizingOnly ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  기공소 기본값으로 저장되며, 이후 제조 주문에 반영됩니다.
                </p>
              ) : null}
            </div>
            <RadioGroup
              value={anodizingEnabled ? "on" : "off"}
              onValueChange={(value) => {
                if (value === "on") onAnodizingEnabledChange?.(true);
                if (value === "off") onAnodizingEnabledChange?.(false);
              }}
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="on" id="req-settings-anodizing-on" />
                <Label htmlFor="req-settings-anodizing-on" className="font-normal">
                  ON
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="off" id="req-settings-anodizing-off" />
                <Label
                  htmlFor="req-settings-anodizing-off"
                  className="font-normal"
                >
                  OFF
                </Label>
              </div>
            </RadioGroup>
          </div>
        ) : null}

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
