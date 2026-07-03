import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [token]);

  const saveAnodizing = async (next: boolean) => {
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
        jsonBody: { anodizingEnabled: next },
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

    void saveAnodizing(checked).then((ok) => {
      if (!ok) setAnodizingEnabled(prev);
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
      </CardContent>
    </Card>
  );
};
