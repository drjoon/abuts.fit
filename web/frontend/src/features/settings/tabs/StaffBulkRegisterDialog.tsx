// related files:
// - web/frontend/src/features/settings/tabs/StaffTab.tsx
// - web/backend/services/staffBulkRegister.service.js
import { useMemo, useState, type FormEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

type CreatedStaff = {
  userId: string;
  name: string;
  login: string;
};

type FailedStaff = {
  line?: number;
  name?: string;
  message: string;
};

type DepartmentOption = {
  _id: string;
  name: string;
};

export function loginIdDisplay(name: string, login: string) {
  const stemName = String(name || "").trim().replace(/\s+/g, "");
  const id = String(login || "").trim();
  if (!stemName || !id.startsWith(stemName)) return { stem: id, suffix: "" };
  const suffix = id.slice(stemName.length);
  if (!/^\d+$/.test(suffix)) return { stem: id, suffix: "" };
  return { stem: stemName, suffix };
}

function copyWithExecCommand(value: string) {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

async function writeClipboard(value: string) {
  // 클립보드 API가 거절된 뒤에 execCommand를 호출하면 클릭 권한이 사라져 복사가 실패한다.
  const clipboardWrite = navigator.clipboard?.writeText(value);
  if (copyWithExecCommand(value)) {
    void clipboardWrite?.catch(() => undefined);
    return true;
  }
  try {
    await clipboardWrite;
    return true;
  } catch {
    return false;
  }
}

interface StaffBulkRegisterDialogProps {
  open: boolean;
  token: string;
  businessType: string;
  departments: DepartmentOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function StaffBulkRegisterDialog({
  open,
  token,
  businessType,
  departments,
  onOpenChange,
  onCreated,
}: StaffBulkRegisterDialogProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedStaff[]>([]);
  const [failed, setFailed] = useState<FailedStaff[]>([]);

  const needsDepartment = departments.length > 1;
  const effectiveDepartmentId =
    departments.length === 1 ? departments[0]._id : departmentId;

  const copyText = useMemo(() => {
    if (!created.length) return "";
    const lines = ["이름  로그인 아이디"];
    for (const row of created) lines.push(`${row.name}  ${row.login}`);
    lines.push(`처음 비밀번호: ${password}`);
    return lines.join("\n");
  }, [created, password]);

  const resetForm = () => {
    setText("");
    setPassword("");
    setShowPassword(true);
    setDepartmentId("");
    setCreated([]);
    setFailed([]);
    setSaving(false);
  };

  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) resetForm();
  }

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || created.length) return;
    setSaving(true);
    try {
      const res = await request<{
        message?: string;
        data?: { created?: CreatedStaff[]; failed?: FailedStaff[] };
      }>({
        path: `/api/businesses/staff/bulk?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "POST",
        token,
        jsonBody: {
          businessType,
          text,
          password,
          departmentId: effectiveDepartmentId || undefined,
        },
      });
      const body = res.data;
      const nextCreated = Array.isArray(body?.data?.created) ? body.data.created : [];
      const nextFailed = Array.isArray(body?.data?.failed) ? body.data.failed : [];
      if (!res.ok || !nextCreated.length) {
        toast({
          title: "직원을 등록하지 못했습니다",
          description: String(body?.message || nextFailed[0]?.message || "").trim(),
          variant: "destructive",
        });
        setFailed(nextFailed);
        return;
      }
      setCreated(nextCreated);
      setFailed(nextFailed);
      onCreated();
      toast({
        title: `${nextCreated.length}명을 등록했습니다`,
        description: "로그인 아이디와 처음 비밀번호를 직원에게 전달하세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    const copied = await writeClipboard(copyText);
    if (copied) {
      toast({ title: "복사했습니다" });
      return;
    }
    toast({
      title: "복사하지 못했습니다",
      variant: "destructive",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>직원 등록</DialogTitle>
          {created.length ? null : (
            <DialogDescription>
              이름을 한 줄에 하나씩 적습니다.
              <br />
              같은 이름이 있으면 아이디 뒤에 1, 2를 붙입니다.
            </DialogDescription>
          )}
        </DialogHeader>

        {created.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              로그인할 때 아래 아이디를 입력합니다.
              <br />
              처음 비밀번호와 함께 직원에게 전달하세요.
              <br />
              첫 로그인 후 본인 비밀번호로 바꿉니다.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto px-1.5 py-1.5">
              {created.map((row) => {
                const { stem, suffix } = loginIdDisplay(row.name, row.login);
                return (
                  <div key={row.userId} className="rounded-xl border px-3 py-3">
                    <div className="text-xs text-muted-foreground">로그인 아이디</div>
                    <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-foreground">
                      {stem}
                      {suffix ? (
                        <span className="ml-0.5 rounded-md bg-primary-soft px-1.5 text-primary-strong">
                          {suffix}
                        </span>
                      ) : null}
                    </div>
                    {suffix ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        같은 이름이 있어 아이디 뒤에 숫자를 붙였습니다.
                      </p>
                    ) : null}
                    <div className="mt-2 text-xs text-muted-foreground">이름 {row.name}</div>
                  </div>
                );
              })}
              <div className="rounded-xl border px-3 py-3">
                <div className="text-xs text-muted-foreground">처음 비밀번호</div>
                <div className="mt-1 font-mono text-lg font-semibold tracking-wide">
                  {password}
                </div>
              </div>
            </div>
            {failed.length ? (
              <div className="space-y-1 text-xs text-destructive">
                {failed.map((row, index) => (
                  <div key={`${row.line || index}-${row.name || ""}`}>
                    {row.name ? `${row.name}: ` : ""}
                    {row.message}
                  </div>
                ))}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                닫기
              </Button>
              <Button type="button" onClick={() => void handleCopy()}>
                복사
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-bulk-text">이름</Label>
              <Textarea
                id="staff-bulk-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"김영희\n홍길동"}
                rows={6}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-bulk-password">처음 비밀번호</Label>
              <div className="relative">
                <Input
                  id="staff-bulk-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="영문 소문자 6자리. 예: abcdef"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={saving}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                영문 소문자 6자리입니다.
                <br />
                직원에게 알려 주면, 첫 로그인 후 본인 비밀번호로 바꿉니다.
              </p>
            </div>
            {needsDepartment ? (
              <div className="space-y-2">
                <Label>부서</Label>
                <Select
                  value={departmentId}
                  onValueChange={setDepartmentId}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="부서 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((row) => (
                      <SelectItem key={row._id} value={row._id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {failed.length ? (
              <div className="space-y-1 text-xs text-destructive">
                {failed.map((row, index) => (
                  <div key={`${row.line || index}-${row.name || ""}`}>
                    {row.name ? `${row.name}: ` : ""}
                    {row.message}
                  </div>
                ))}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => handleOpenChange(false)}
              >
                닫기
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !text.trim() ||
                  !password.trim() ||
                  (needsDepartment && !departmentId)
                }
              >
                {saving ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface StaffPasswordResetDialogProps {
  open: boolean;
  token: string;
  businessType: string;
  userId: string;
  label: string;
  onOpenChange: (open: boolean) => void;
}

export function StaffPasswordResetDialog({
  open,
  token,
  businessType,
  userId,
  label,
  onOpenChange,
}: StaffPasswordResetDialogProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) setPassword("");
    onOpenChange(next);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !userId) return;
    setSaving(true);
    try {
      const res = await request<{ message?: string }>({
        path: `/api/businesses/staff/${encodeURIComponent(
          userId,
        )}/password?businessType=${encodeURIComponent(businessType)}`,
        method: "POST",
        token,
        jsonBody: { businessType, password },
      });
      if (!res.ok) {
        toast({
          title: "비밀번호를 다시 정하지 못했습니다",
          description: String(res.data?.message || "").trim(),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "비밀번호를 다시 정했습니다",
        description: "직원에게 새 비밀번호를 알려 주세요.",
      });
      handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>비밀번호 다시 정하기</DialogTitle>
            <DialogDescription>
              {label}
              <br />
              직원이 로그인하면 본인 비밀번호로 바꿉니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="staff-reset-password">새 비밀번호</Label>
            <Input
              id="staff-reset-password"
              type="text"
              autoComplete="new-password"
              placeholder="영문 소문자 6자리. 예: abcdef"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={saving}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => handleOpenChange(false)}
            >
              닫기
            </Button>
            <Button type="submit" disabled={saving || !password.trim()}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
