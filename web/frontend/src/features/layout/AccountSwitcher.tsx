// change-log:
// - 2026-08-05: 계정 전환 후 현재 화면 유지(하드 리다이렉트 제거). 비밀번호 자동완성 차단.
// - 2026-08-05: 사이드바 계정 팝업에서 같은 사업자 동료 계정으로 비밀번호 확인 후 전환(모든 role).
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/modules/auth/auth.routes.js
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users } from "lucide-react";

export type ColleagueAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  subRole?: string | null;
  profileImage?: string | null;
  companyName?: string;
  internalDepartmentId?: string | null;
  departmentName?: string;
};

type ColleaguesApiResponse = {
  success?: boolean;
  data?: {
    colleagues?: ColleagueAccount[];
    usesDepartments?: boolean;
    departmentName?: string;
  };
  message?: string;
};

const getSubRoleLabel = (subRole?: string | null) => {
  if (subRole === "owner") return "대표";
  if (subRole === "staff") return "직원";
  return null;
};

type AccountSwitcherMenuSectionProps = {
  menuOpen: boolean;
  getInitials: (name: string) => string;
  onSelectColleague: (colleague: ColleagueAccount) => void;
};

export function AccountSwitcherMenuSection({
  menuOpen,
  getInitials,
  onSelectColleague,
}: AccountSwitcherMenuSectionProps) {
  const { user, token } = useAuthStore();
  const [colleagues, setColleagues] = useState<ColleagueAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [usesDepartments, setUsesDepartments] = useState(false);
  const [departmentName, setDepartmentName] = useState("");

  useEffect(() => {
    if (!menuOpen || !token || !user?.businessAnchorId) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<ColleaguesApiResponse>({
          path: "/api/auth/colleagues",
          method: "GET",
          token,
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.data?.colleagues)
          ? res.data.data.colleagues
          : [];
        setColleagues(list);
        setUsesDepartments(Boolean(res.data?.data?.usesDepartments));
        setDepartmentName(String(res.data?.data?.departmentName || ""));
      } catch {
        if (!cancelled) {
          setColleagues([]);
          setUsesDepartments(false);
          setDepartmentName("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [menuOpen, token, user?.businessAnchorId, user?.id]);

  if (!user?.businessAnchorId) {
    return null;
  }

  const sectionLabel = usesDepartments
    ? departmentName
      ? `같은 부서 계정 (${departmentName})`
      : "같은 부서 계정"
    : "같은 사업자 계정";

  const emptyMessage = usesDepartments
    ? departmentName
      ? "전환할 다른 계정이 없습니다."
      : "부서가 할당되지 않아 다른 계정을 표시할 수 없습니다."
    : "전환할 다른 계정이 없습니다.";

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
        <Users className="h-3.5 w-3.5" />
        {sectionLabel}
      </DropdownMenuLabel>
      {loading ? (
        <div className="flex items-center justify-center py-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : colleagues.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        colleagues.map((colleague) => {
          const subLabel = getSubRoleLabel(colleague.subRole);
          return (
            <DropdownMenuItem
              key={colleague.id}
              className="cursor-pointer"
              onSelect={() => onSelectColleague(colleague)}
            >
              <Avatar className="h-6 w-6 mr-2 flex-shrink-0">
                <AvatarImage
                  seed={colleague.email || colleague.id}
                  fallbackInitial={colleague.name}
                  src={colleague.profileImage || undefined}
                  alt={colleague.name}
                />
                <AvatarFallback className="text-[10px]">
                  {getInitials(colleague.name || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm truncate">{colleague.name}</span>
                  {subLabel ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 leading-none"
                    >
                      {subLabel}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {colleague.email}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })
      )}
    </>
  );
}

type AccountSwitchPasswordDialogProps = {
  colleague: ColleagueAccount | null;
  getInitials: (name: string) => string;
  onClose: () => void;
};

export function AccountSwitchPasswordDialog({
  colleague,
  getInitials,
  onClose,
}: AccountSwitchPasswordDialogProps) {
  const { switchAccount } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [passwordReady, setPasswordReady] = useState(false);

  useEffect(() => {
    if (!colleague) {
      setPassword("");
      setError("");
      setSwitching(false);
      setPasswordReady(false);
      return;
    }
    setPassword("");
    setError("");
    setSwitching(false);
    setPasswordReady(false);
    const timer = window.setTimeout(() => setPasswordReady(true), 50);
    return () => window.clearTimeout(timer);
  }, [colleague]);

  const handleSwitch = async () => {
    if (!colleague) return;
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setSwitching(true);
    setError("");
    const result = await switchAccount(colleague.id, password);
    if (!result.success) {
      setError(result.message || "계정 전환에 실패했습니다.");
      setSwitching(false);
      setPassword("");
      return;
    }

    const switchedName = colleague.name;
    onClose();
    queryClient.clear();
    toast({
      title: "계정 전환 완료",
      description: `${switchedName} 계정으로 전환했습니다.`,
    });
  };

  return (
    <Dialog
      open={Boolean(colleague)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // 브라우저 비밀번호 자동완성으로 긴 값이 채워지지 않도록 포커스를 직접 제어
          event.preventDefault();
          window.setTimeout(() => {
            const el = document.getElementById(
              "account-switch-password",
            ) as HTMLInputElement | null;
            el?.focus();
          }, 60);
        }}
      >
        <DialogHeader>
          <DialogTitle>계정 전환</DialogTitle>
          <DialogDescription>
            {colleague
              ? `${colleague.name} 계정의 비밀번호를 입력하면 전환됩니다.`
              : "전환할 계정의 비밀번호를 입력해주세요."}
          </DialogDescription>
        </DialogHeader>

        {colleague ? (
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                seed={colleague.email || colleague.id}
                fallbackInitial={colleague.name}
                src={colleague.profileImage || undefined}
                alt={colleague.name}
              />
              <AvatarFallback>
                {getInitials(colleague.name || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{colleague.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {colleague.email}
              </div>
            </div>
          </div>
        ) : null}

        {/* 브라우저가 비밀번호 매니저로 인식하지 않도록 더미 필드 */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={colleague?.email || ""}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />

        <div className="space-y-2">
          <Label htmlFor="account-switch-password">비밀번호</Label>
          <Input
            id="account-switch-password"
            name="account-switch-password"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            value={password}
            disabled={switching}
            readOnly={!passwordReady}
            onFocus={() => {
              if (!passwordReady) setPasswordReady(true);
            }}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSwitch();
              }
            }}
            placeholder="전환할 계정의 비밀번호"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={switching}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={switching || !password}
            onClick={() => void handleSwitch()}
          >
            {switching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                전환 중…
              </>
            ) : (
              "전환하기"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
