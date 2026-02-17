import { useState, ChangeEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminOrganizationVerification() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [orgId, setOrgId] = useState("");
  const [verified, setVerified] = useState(true);
  const [message, setMessage] = useState("수동 검증 처리되었습니다.");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmedId = orgId.trim();
    if (!trimmedId) {
      toast({
        title: "조직 ID를 입력해주세요",
        variant: "destructive",
      });
      return;
    }
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await request<any>({
        path: `/api/admin/organizations/${trimmedId}/verification/override`,
        method: "POST",
        token,
        jsonBody: { verified, message },
      });
      if (!res.ok) {
        const serverMsg = String(res.data?.message || "").trim();
        toast({
          title: "수동 검증에 실패했습니다",
          description: serverMsg || undefined,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: verified ? "검증 완료로 변경" : "미검증으로 변경",
        description: `조직 ID: ${trimmedId}`,
      });
      setOrgId("");
    } catch (error: any) {
      toast({
        title: "요청 중 오류가 발생했습니다",
        description: error?.message || undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>사업자 검증 수동 처리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="orgId">조직 ID (Mongo ObjectId)</Label>
            <Input
              id="orgId"
              placeholder="예) 65e4d9..."
              value={orgId}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setOrgId(e.target.value)
              }
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="verified"
              checked={verified}
              onCheckedChange={setVerified}
              disabled={loading}
            />
            <Label htmlFor="verified">
              {verified ? "검증 완료로 표시" : "미검증 상태로 표시"}
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">메시지 (선택)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setMessage(e.target.value)
              }
              disabled={loading}
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "처리 중..." : "수동 검증 적용"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
