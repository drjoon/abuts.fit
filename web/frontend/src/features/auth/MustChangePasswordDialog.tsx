// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/backend/controllers/auth/auth.controller.js
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
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
import { useNavigate } from "react-router-dom";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

export function MustChangePasswordDialog() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user?.mustChangePassword || !token) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await request<{ message?: string }>({
        path: "/api/auth/change-password",
        method: "PUT",
        token,
        jsonBody: { currentPassword, newPassword },
      });
      if (!res.ok) {
        const message = String(res.data?.message || "").trim();
        toast({
          title: "비밀번호를 바꾸지 못했습니다",
          description: message || "지금 비밀번호와 새 비밀번호를 확인해 주세요.",
          variant: "destructive",
        });
        return;
      }
      setUser({ ...user, mustChangePassword: false });
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "비밀번호를 바꿨습니다" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        hideClose
        overlayClassName="z-[500]"
        className="z-[500] sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>비밀번호를 바꿔 주세요</DialogTitle>
            <DialogDescription>
              대표가 알려 준 비밀번호로 로그인했습니다.
              <br />
              영문 소문자 6자리로 새 비밀번호를 정해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="current-staff-password">지금 비밀번호</Label>
            <Input
              id="current-staff-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-staff-password">새 비밀번호</Label>
            <div className="relative">
              <Input
                id="new-staff-password"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                placeholder="영문 소문자 6자리. 예: qwerty"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={saving}
                className="pr-10"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground"
                aria-label={showNew ? "비밀번호 숨기기" : "비밀번호 보기"}
                onClick={() => setShowNew((prev) => !prev)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              로그아웃
            </Button>
            <Button type="submit" disabled={saving || !currentPassword || !newPassword}>
              {saving ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
