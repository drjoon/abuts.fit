import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";

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

  const [business, setBusiness] = useState({
    organization: (user as any)?.organization || "",
    phoneNumber: (user as any)?.phoneNumber || "",
  });

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "manufacturer") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization": (user as any)?.organization || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role, userData]);

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
        headers: mockHeaders,
        jsonBody: {
          organization: business.organization,
          phoneNumber: business.phoneNumber,
        },
      });

      if (!res.ok) {
        toast({ title: "저장 실패", variant: "destructive", duration: 3000 });
        return;
      }

      toast({ title: "저장되었습니다" });
    } catch {
      toast({ title: "저장 실패", variant: "destructive", duration: 3000 });
    }
  };

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
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
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            저장하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
