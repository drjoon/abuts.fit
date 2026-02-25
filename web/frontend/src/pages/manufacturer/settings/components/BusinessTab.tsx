import { useCallback, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Building2 } from "lucide-react";

interface BusinessTabProps {
  userData: {
    role?: string;
    email?: string;
    name?: string;
  } | null;
}

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const initialBusiness = useMemo(
    () => ({
      organization: (user as any)?.organization || "",
      phoneNumber: (user as any)?.phoneNumber || "",
    }),
    [user],
  );

  const lastSavedKeyRef = useRef<string>(JSON.stringify(initialBusiness));

  const [business, setBusiness] = useState(initialBusiness);

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const fn = handleSaveRef.current;
      if (fn) {
        void fn();
      }
    }, 300);
  }, []);

  const handleSave = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          organization: business.organization,
          phoneNumber: business.phoneNumber,
        },
      });

      if (!res.ok) {
        toast({ title: "저장 실패", variant: "destructive", duration: 3000 });
        return;
      }

      const savedKey = JSON.stringify({
        organization: business.organization,
        phoneNumber: business.phoneNumber,
      });
      lastSavedKeyRef.current = savedKey;
    } catch {
      toast({ title: "저장 실패", variant: "destructive", duration: 3000 });
    }
  };

  handleSaveRef.current = handleSave;

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          사업자 정보
        </CardTitle>
        <CardDescription>제조사 사업자 정보를 관리하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="organization">회사명</Label>
            <Input
              id="organization"
              value={business.organization}
              onChange={(e) =>
                setBusiness((p) => ({ ...p, organization: e.target.value }))
              }
              onBlur={() => {
                const savedKey = JSON.stringify({
                  organization: business.organization,
                  phoneNumber: business.phoneNumber,
                });
                if (savedKey !== lastSavedKeyRef.current) {
                  scheduleSave();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">대표 전화</Label>
            <Input
              id="phoneNumber"
              value={business.phoneNumber}
              onChange={(e) =>
                setBusiness((p) => ({ ...p, phoneNumber: e.target.value }))
              }
              onBlur={() => {
                const savedKey = JSON.stringify({
                  organization: business.organization,
                  phoneNumber: business.phoneNumber,
                });
                if (savedKey !== lastSavedKeyRef.current) {
                  scheduleSave();
                }
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
