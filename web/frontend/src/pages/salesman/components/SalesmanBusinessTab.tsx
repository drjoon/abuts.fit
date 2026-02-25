import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

export const SalesmanBusinessTab = () => {
  const { toast } = useToast();
  const { token, user, loginWithToken } = useAuthStore();

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState(user?.companyName || "");
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const res = await request<any>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || !mounted) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const nextOrg = String(data?.organization || "").trim();
        setOrganization(nextOrg);
        lastSavedRef.current = nextOrg;
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const save = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (saving) return;

    const nextOrg = organization.trim();
    if (!nextOrg) {
      toast({
        title: "사업자명을 입력해주세요",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        headers: mockHeaders,
        jsonBody: {
          organization: nextOrg,
        },
      });
      if (!res.ok) {
        const msg = String(
          (res.data as any)?.message || "저장에 실패했습니다.",
        );
        toast({
          title: "저장 실패",
          description: msg,
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      lastSavedRef.current = nextOrg;
      toast({
        title: "저장되었습니다",
        duration: 2000,
      });

      try {
        window.dispatchEvent(new Event("abuts:profile:updated"));
      } catch {}

      if (token) {
        void loginWithToken(token);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardContent className="py-8 text-sm text-muted-foreground">
          불러오는 중...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          사업자
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="salesman-org">사업자명(상호)</Label>
          <Input
            id="salesman-org"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onBlur={() => {
              if (
                organization.trim() &&
                organization.trim() !== lastSavedRef.current
              ) {
                void save();
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};
