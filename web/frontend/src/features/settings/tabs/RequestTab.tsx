import { useEffect, useState } from "react";

// related files:
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/models/businessAnchor.model.js
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { FileText } from "lucide-react";

type RequestSettingsResponse = {
  success?: boolean;
  message?: string;
  data?: {
    scope?: "business";
    membership?: "owner" | "member" | "pending" | "none";
    canEdit?: boolean;
    anodizingEnabled?: boolean;
    designSoftware?: string | null;
    updatedAt?: string | null;
  };
};

const readAnodizing = (payload: unknown): boolean | null => {
  if (!payload || typeof payload !== "object") return null;

  const typed = payload as RequestSettingsResponse;
  if (typeof typed.data?.anodizingEnabled === "boolean") {
    return typed.data.anodizingEnabled;
  }

  return null;
};

const readCanEdit = (payload: unknown): boolean | null => {
  if (!payload || typeof payload !== "object") return null;
  const typed = payload as RequestSettingsResponse;
  if (typeof typed.data?.canEdit === "boolean") return typed.data.canEdit;
  return null;
};

const readDesignSoftware = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const typed = payload as RequestSettingsResponse;
  const value = String(typed.data?.designSoftware || "").trim();
  return value || null;
};

const readMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const typed = payload as RequestSettingsResponse;
  return typeof typed.message === "string" ? typed.message : null;
};

export const RequestTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [anodizingEnabled, setAnodizingEnabled] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [designMode, setDesignMode] = useState<"3Shape" | "ExoCAD" | "custom">(
    "custom",
  );
  const [customDesignSoftware, setCustomDesignSoftware] = useState("");
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

        const next = readAnodizing(res.data);
        if (typeof next === "boolean") {
          setAnodizingEnabled(next);
        }

        const editable = readCanEdit(res.data);
        if (typeof editable === "boolean") {
          setCanEdit(editable);
        }

        const designSoftware = readDesignSoftware(res.data);
        if (designSoftware === "3Shape" || designSoftware === "ExoCAD") {
          setDesignMode(designSoftware);
          setCustomDesignSoftware("");
        } else if (designSoftware) {
          setDesignMode("custom");
          setCustomDesignSoftware(designSoftware);
        } else {
          setDesignMode("custom");
          setCustomDesignSoftware("");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [token]);

  const saveRequestSettings = async (payload: {
    anodizingEnabled?: boolean;
    designSoftware?: string;
  }) => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "의뢰 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return false;
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
            readMessage(res.data) || "의뢰 설정 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }

      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAnodizing = (checked: boolean) => {
    if (!canEdit) {
      toast({
        title: "권한이 없습니다",
        description: "대표자 계정만 기공소 의뢰 설정을 변경할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    const prev = anodizingEnabled;
    setAnodizingEnabled(checked);

    void saveRequestSettings({ anodizingEnabled: checked }).then((ok) => {
      if (!ok) setAnodizingEnabled(prev);
    });
  };

  const persistDesignSoftware = async (value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
      toast({
        title: "입력값이 필요합니다",
        description: "직접 입력을 선택한 경우 소프트웨어 이름을 입력해주세요.",
        variant: "destructive",
      });
      return false;
    }
    return saveRequestSettings({ designSoftware: normalized });
  };

  const handleDesignModeChange = (next: "3Shape" | "ExoCAD" | "custom") => {
    if (!canEdit) {
      toast({
        title: "권한이 없습니다",
        description: "대표자 계정만 기공소 의뢰 설정을 변경할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    const prevMode = designMode;
    const prevCustom = customDesignSoftware;
    setDesignMode(next);

    if (next === "custom") return;

    void saveRequestSettings({ designSoftware: next }).then((ok) => {
      if (!ok) {
        setDesignMode(prevMode);
        setCustomDesignSoftware(prevCustom);
      }
    });
  };

  const handleCustomDesignSoftwareBlur = () => {
    if (!canEdit || designMode !== "custom") return;
    const next = String(customDesignSoftware || "").trim();
    if (!next) return;

    const prevMode = designMode;
    const prevCustom = customDesignSoftware;
    void persistDesignSoftware(next).then((ok) => {
      if (!ok) {
        setDesignMode(prevMode);
        setCustomDesignSoftware(prevCustom);
      }
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
                기공소 설정으로 관리되며, 해당 기공소의 전체 의뢰 기본값에
                적용됩니다.
              </p>
              <p className="text-xs font-medium text-muted-foreground/90">
                현재 상태: {anodizingEnabled ? "ON (O)" : "OFF (X)"}
              </p>
              {!canEdit ? (
                <p className="text-xs text-muted-foreground">
                  대표자 계정에서만 변경할 수 있습니다.
                </p>
              ) : null}
            </div>

            <Switch
              id="anodizing"
              checked={anodizingEnabled}
              disabled={isLoading || !canEdit}
              onCheckedChange={toggleAnodizing}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-background/60 p-4 sm:p-5 space-y-3">
          <div className="space-y-1">
            <Label className="text-base font-medium">디자인 소프트웨어</Label>
            <p className="text-sm text-muted-foreground">
              헥스 회전에 대한 중요한 설정입니다. 반드시 설정해주세요.
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
                  disabled={isLoading || !canEdit}
                  maxLength={120}
                />
              ) : null}
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
};
