// related files:
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// change-log:
// - 2026-09-03: 개인 User SSOT + ExoCAD 3.0 이하 Yes/No. BA는 대표자 템플릿만.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { FileText } from "lucide-react";

type ExoCadVersion = "le_3_0" | "ge_3_2";

type RequestSettingsResponse = {
  success?: boolean;
  message?: string;
  data?: {
    canEdit?: boolean;
    canEditDesignSoftware?: boolean;
    anodizingEnabled?: boolean;
    requestorAnodizingEnabled?: boolean;
    hasRequestorAnodizingSetting?: boolean;
    designSoftware?: string | null;
    requestorDesignSoftware?: string | null;
    exoCadVersion?: string | null;
    requestorExoCadVersion?: string | null;
    propagatedRequestorDesignSoftwareCount?: number;
  };
};

const normalizeExo = (value: unknown): ExoCadVersion | null => {
  const raw = String(value || "").trim();
  if (raw === "le_3_0" || raw === "3.0" || raw === "<=3.0") return "le_3_0";
  if (raw === "ge_3_2" || raw === "3.2" || raw === ">=3.2") return "ge_3_2";
  return null;
};

export const RequestTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [anodizingEnabled, setAnodizingEnabled] = useState(true);
  const [canEditBaTemplate, setCanEditBaTemplate] = useState(false);
  const [designMode, setDesignMode] = useState<"3Shape" | "ExoCAD" | "custom">(
    "3Shape",
  );
  const [customDesignSoftware, setCustomDesignSoftware] = useState("");
  const [exoCadVersion, setExoCadVersion] = useState<ExoCadVersion | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const res = await request<RequestSettingsResponse>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        });
        if (!res.ok) return;
        const data = res.data?.data;
        setCanEditBaTemplate(Boolean(data?.canEditDesignSoftware));

        const personal = String(data?.requestorDesignSoftware || "").trim();
        const business = String(data?.designSoftware || "").trim();
        const designSoftware = personal || business;
        if (designSoftware === "3Shape" || designSoftware === "ExoCAD") {
          setDesignMode(designSoftware);
          setCustomDesignSoftware("");
        } else if (designSoftware) {
          setDesignMode("custom");
          setCustomDesignSoftware(designSoftware);
        }

        setExoCadVersion(
          normalizeExo(data?.requestorExoCadVersion) ||
            normalizeExo(data?.exoCadVersion),
        );

        const ano =
          typeof data?.requestorAnodizingEnabled === "boolean"
            ? data.requestorAnodizingEnabled
            : typeof data?.anodizingEnabled === "boolean"
              ? data.anodizingEnabled
              : true;
        setAnodizingEnabled(ano);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [token]);

  const saveRequestSettings = async (payload: Record<string, unknown>) => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "의뢰 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return null;
    }
    setIsLoading(true);
    try {
      const res = await request<RequestSettingsResponse>({
        path: "/api/businesses/me/request-settings",
        method: "PUT",
        token,
        jsonBody: payload,
      });
      if (!res.ok) {
        toast({
          title: "저장에 실패했습니다",
          description:
            res.data?.message || "의뢰 설정 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
      return res.data?.data || null;
    } finally {
      setIsLoading(false);
    }
  };

  const buildDesignPayload = (
    designSoftware: string,
    exo: ExoCadVersion | null,
  ) => {
    const payload: Record<string, unknown> = {
      requestorDesignSoftware: designSoftware,
      requestorExoCadVersion: designSoftware === "ExoCAD" ? exo : null,
    };
    if (canEditBaTemplate) {
      payload.designSoftware = designSoftware;
      payload.exoCadVersion = designSoftware === "ExoCAD" ? exo : null;
    }
    return payload;
  };

  const toggleAnodizing = (checked: boolean) => {
    const prev = anodizingEnabled;
    setAnodizingEnabled(checked);
    const payload: Record<string, unknown> = {
      requestorAnodizingEnabled: checked,
    };
    if (canEditBaTemplate) payload.anodizingEnabled = checked;
    void saveRequestSettings(payload).then((result) => {
      if (!result) setAnodizingEnabled(prev);
    });
  };

  const persistDesign = async (
    designSoftware: string,
    exo: ExoCadVersion | null,
  ) => {
    if (designSoftware === "ExoCAD" && !exo) {
      toast({
        title: "ExoCAD 버전이 필요합니다",
        description: "3.0 이하 여부를 선택해주세요.",
        variant: "destructive",
      });
      return null;
    }
    return saveRequestSettings(buildDesignPayload(designSoftware, exo));
  };

  const handleDesignModeChange = (next: "3Shape" | "ExoCAD" | "custom") => {
    const prevMode = designMode;
    const prevCustom = customDesignSoftware;
    const prevExo = exoCadVersion;
    setDesignMode(next);
    if (next === "custom") return;
    if (next !== "ExoCAD") setExoCadVersion(null);

    void persistDesign(next, next === "ExoCAD" ? exoCadVersion : null).then(
      (result) => {
        if (!result) {
          setDesignMode(prevMode);
          setCustomDesignSoftware(prevCustom);
          setExoCadVersion(prevExo);
          return;
        }
        toast({
          title: "저장 완료",
          description: "디자인 소프트웨어 설정이 저장되었습니다.",
        });
      },
    );
  };

  const handleExoVersionChange = (next: ExoCadVersion) => {
    const prev = exoCadVersion;
    setExoCadVersion(next);
    void persistDesign("ExoCAD", next).then((result) => {
      if (!result) setExoCadVersion(prev);
      else {
        toast({
          title: "저장 완료",
          description: "ExoCAD 버전 설정이 저장되었습니다.",
        });
      }
    });
  };

  const handleCustomDesignSoftwareBlur = () => {
    if (designMode !== "custom") return;
    const next = String(customDesignSoftware || "").trim();
    if (!next) return;
    const prevMode = designMode;
    const prevCustom = customDesignSoftware;
    void persistDesign(next, null).then((result) => {
      if (!result) {
        setDesignMode(prevMode);
        setCustomDesignSoftware(prevCustom);
        return;
      }
      toast({
        title: "저장 완료",
        description: "디자인 소프트웨어 설정이 저장되었습니다.",
      });
    });
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          의뢰 설정
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-xl border bg-background/60 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="anodizing" className="text-base font-medium">
                아노다이징 처리
              </Label>
              <p className="text-sm text-muted-foreground">
                내 계정 기본값으로 저장됩니다.
                {canEditBaTemplate
                  ? " 대표자인 경우 사업자 신규 가입 시드에도 반영됩니다."
                  : ""}
              </p>
              <p className="text-xs font-medium text-muted-foreground/90">
                현재 상태: {anodizingEnabled ? "ON (O)" : "OFF (X)"}
              </p>
            </div>
            <Switch
              id="anodizing"
              checked={anodizingEnabled}
              disabled={isLoading}
              onCheckedChange={toggleAnodizing}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-background/60 p-4 sm:p-5 space-y-3">
          <div className="space-y-1">
            <Label className="text-base font-medium">디자인 소프트웨어</Label>
            <p className="text-sm text-muted-foreground">
              내 계정에 저장됩니다.
              {canEditBaTemplate
                ? " 대표자인 경우 사업자 신규 가입 기본값에도 함께 저장됩니다."
                : ""}
            </p>
          </div>

          <RadioGroup
            value={designMode}
            onValueChange={(value) => {
              if (value === "3Shape" || value === "ExoCAD" || value === "custom") {
                handleDesignModeChange(value);
              }
            }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="3Shape" id="design-software-3shape" />
              <Label htmlFor="design-software-3shape">3Shape</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="ExoCAD" id="design-software-exocad" />
              <Label htmlFor="design-software-exocad">ExoCAD</Label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="design-software-custom" />
                <Label htmlFor="design-software-custom">직접 입력</Label>
              </div>
              {designMode === "custom" ? (
                <Input
                  value={customDesignSoftware}
                  onChange={(e) => setCustomDesignSoftware(e.target.value)}
                  onBlur={handleCustomDesignSoftwareBlur}
                  placeholder="사용 중인 디자인 소프트웨어를 입력해주세요"
                  disabled={isLoading}
                  maxLength={120}
                />
              ) : null}
            </div>
          </RadioGroup>

          {designMode === "ExoCAD" ? (
            <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-3">
              <Label className="text-sm font-medium">
                ExoCAD 3.0(Galway) 이하인가요?
              </Label>
              <p className="text-xs text-muted-foreground">
                3.0 이하는 헥스 30° 보정이 필요할 수 있어 관리 대상입니다. 3.2
                이상으로 업그레이드를 권장합니다.
              </p>
              <RadioGroup
                value={exoCadVersion || ""}
                onValueChange={(value) => {
                  if (value === "le_3_0" || value === "ge_3_2") {
                    handleExoVersionChange(value);
                  }
                }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="le_3_0" id="settings-exocad-le30" />
                  <Label htmlFor="settings-exocad-le30" className="font-normal">
                    예 (3.0 이하)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="ge_3_2" id="settings-exocad-ge32" />
                  <Label htmlFor="settings-exocad-ge32" className="font-normal">
                    아니오 (3.2 이상)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
