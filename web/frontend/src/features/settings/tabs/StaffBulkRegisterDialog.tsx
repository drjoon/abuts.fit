// related files:
// - web/frontend/src/features/settings/tabs/StaffTab.tsx
// - web/backend/services/staffBulkRegister.service.js
import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/shared/ui/cn";
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
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

type CreatedStaff = {
  userId: string;
  name: string;
  login: string;
  departmentName?: string;
};

type FailedStaff = {
  line?: number;
  name?: string;
  departmentName?: string;
  message: string;
};

type DepartmentOption = {
  _id: string;
  name: string;
};

function countNames(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;
}

function groupCreated(rows: CreatedStaff[]) {
  const order: string[] = [];
  const map = new Map<string, CreatedStaff[]>();
  for (const row of rows) {
    const key = String(row.departmentName || "").trim();
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)?.push(row);
  }
  return order.map((name) => ({ name, rows: map.get(name) || [] }));
}

function failedLabel(row: FailedStaff) {
  const dept = String(row.departmentName || "").trim();
  const name = String(row.name || "").trim();
  const who = [dept, name].filter(Boolean).join(" · ");
  return who ? `${who}: ${row.message}` : row.message;
}

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
  const [namesByDepartment, setNamesByDepartment] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedStaff[]>([]);
  const [failed, setFailed] = useState<FailedStaff[]>([]);

  const multiDepartment = departments.length > 1;
  const effectiveDepartmentId = departments.length === 1 ? departments[0]._id : "";
  const nameCount = multiDepartment
    ? departments.reduce(
        (sum, row) => sum + countNames(namesByDepartment[row._id] || ""),
        0,
      )
    : countNames(text);

  const copyText = useMemo(() => {
    if (!created.length) return "";
    const lines: string[] = [];
    const groups = groupCreated(created);
    const showDept = groups.some((group) => group.name);
    if (!showDept) {
      lines.push("이름  로그인 아이디");
      for (const row of created) lines.push(`${row.name}  ${row.login}`);
    } else {
      for (const group of groups) {
        lines.push(group.name);
        for (const row of group.rows) lines.push(`${row.name}  ${row.login}`);
        lines.push("");
      }
    }
    lines.push(`처음 비밀번호: ${password}`);
    return lines.join("\n").trim();
  }, [created, password]);

  const resetForm = () => {
    setText("");
    setNamesByDepartment({});
    setPassword("");
    setShowPassword(true);
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
        jsonBody: multiDepartment
          ? {
              businessType,
              password,
              groups: departments
                .map((row) => ({
                  departmentId: row._id,
                  text: namesByDepartment[row._id] || "",
                }))
                .filter((row) => row.text.trim()),
            }
          : {
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

  const createdGroups = groupCreated(created);
  const showCreatedDept = createdGroups.some((group) => group.name);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          multiDepartment ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <DialogHeader>
          <DialogTitle>직원 등록</DialogTitle>
          {created.length ? null : (
            <DialogDescription>
              {multiDepartment
                ? "부서마다 이름을 한 줄에 하나씩 적습니다."
                : "이름을 한 줄에 하나씩 적습니다."}
              <br />
              동명이인은 그 숫자만큼 같은 이름을 반복해서 기입합니다.
              <br />
              자동으로 1, 2, ..가 붙습니다.
            </DialogDescription>
          )}
        </DialogHeader>

        {created.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              로그인 아이디와 처음 비밀번호를 전달하세요.
              <br />
              첫 로그인 후 본인 비밀번호로 바꿉니다.
            </p>
            <div className="max-h-[32rem] space-y-3 overflow-y-auto px-1.5 py-1.5">
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>이름</span>
                <span>로그인 아이디</span>
              </div>
              {createdGroups.map((group) => (
                <div
                  key={group.name || "all"}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  {showCreatedDept ? (
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                      {group.name}
                    </div>
                  ) : null}
                  <ul>
                    {group.rows.map((row) => {
                      const { stem, suffix } = loginIdDisplay(row.name, row.login);
                      return (
                        <li
                          key={row.userId}
                          className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 first:border-t-0"
                        >
                          <span className="min-w-0 truncate text-sm text-slate-700">
                            {row.name}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tracking-tight text-slate-900">
                            {stem}
                            {suffix ? (
                              <span className="ml-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-primary-strong">
                                {suffix}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">처음 비밀번호</span>
                <span className="font-mono text-base font-semibold tracking-wide text-slate-900">
                  {password}
                </span>
              </div>
            </div>
            {failed.length ? (
              <div className="space-y-1 text-xs text-destructive">
                {failed.map((row, index) => (
                  <div key={`${row.departmentName || ""}-${row.line || index}-${row.name || ""}`}>
                    {failedLabel(row)}
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
              <Label htmlFor="staff-bulk-password">처음 비밀번호</Label>
              <div className="relative">
                <Input
                  id="staff-bulk-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="영문 소문자 6자리"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={saving}
                  className="pr-10 font-mono tracking-wide"
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
                첫 로그인 후 본인 비밀번호로 바꿉니다.
              </p>
            </div>
            {multiDepartment ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {departments.map((row) => {
                  const value = namesByDepartment[row._id] || "";
                  const count = countNames(value);
                  return (
                    <div
                      key={row._id}
                      className={cn(
                        "rounded-xl border bg-slate-50/80 p-2",
                        count > 0 ? "border-primary/40" : "border-slate-200",
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                        <label
                          htmlFor={`staff-bulk-dept-${row._id}`}
                          className="min-w-0 truncate text-sm font-semibold text-slate-900"
                        >
                          {row.name}
                        </label>
                        {count > 0 ? (
                          <span className="shrink-0 text-xs font-medium tabular-nums text-primary-strong">
                            {count}명
                          </span>
                        ) : null}
                      </div>
                      <Textarea
                        id={`staff-bulk-dept-${row._id}`}
                        value={value}
                        onChange={(event) =>
                          setNamesByDepartment((prev) => ({
                            ...prev,
                            [row._id]: event.target.value,
                          }))
                        }
                        placeholder="이름"
                        rows={3}
                        disabled={saving}
                        className="min-h-[4.75rem] bg-white"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
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
            )}
            {failed.length ? (
              <div className="space-y-1 text-xs text-destructive">
                {failed.map((row, index) => (
                  <div key={`${row.departmentName || ""}-${row.line || index}-${row.name || ""}`}>
                    {failedLabel(row)}
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
              <Button type="submit" disabled={saving || nameCount === 0 || !password.trim()}>
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
