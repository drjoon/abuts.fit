// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/users/user.controller.js
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Box, ScanLine } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

function readRequireUpload(value: boolean | undefined) {
  return value !== false;
}

export function PracticeOralScanTab() {
  const { user, token, setUser } = useAuthStore();
  const { toast } = useToast();
  const [usesOralScan, setUsesOralScan] = useState(
    Boolean(user?.practiceProfile?.usesOralScan),
  );
  const [requireUpload, setRequireUpload] = useState(
    readRequireUpload(user?.practiceProfile?.requireLabProsthesisUpload),
  );
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const savedRef = useRef({
    usesOralScan: Boolean(user?.practiceProfile?.usesOralScan),
    requireUpload: readRequireUpload(
      user?.practiceProfile?.requireLabProsthesisUpload,
    ),
  });

  useEffect(() => {
    const nextOral = Boolean(user?.practiceProfile?.usesOralScan);
    const nextRequire = readRequireUpload(
      user?.practiceProfile?.requireLabProsthesisUpload,
    );
    setUsesOralScan(nextOral);
    setRequireUpload(nextRequire);
    savedRef.current = { usesOralScan: nextOral, requireUpload: nextRequire };
  }, [
    user?.practiceProfile?.usesOralScan,
    user?.practiceProfile?.requireLabProsthesisUpload,
  ]);

  useEffect(() => {
    if (
      usesOralScan === savedRef.current.usesOralScan &&
      requireUpload === savedRef.current.requireUpload
    ) {
      return;
    }
    if (!token || !user) return;
    const timer = window.setTimeout(() => {
      void persist(usesOralScan, requireUpload);
    }, 400);
    return () => window.clearTimeout(timer);
    // persist는 체크 값만 저장한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesOralScan, requireUpload, token, user?.id]);

  const persist = async (nextOral: boolean, nextRequire: boolean) => {
    if (!token || !user) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    const pp = user.practiceProfile || {};
    setSaving(true);
    try {
      const res = await request<{ data?: Record<string, unknown> }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          practiceProfile: {
            usesOralScan: nextOral,
            requireLabProsthesisUpload: nextRequire,
          },
        },
      });
      if (!res.ok) {
        const body = (res.data as { message?: string }) || {};
        throw new Error(body.message || "저장에 실패했습니다.");
      }
      const updated = ((res.data as { data?: unknown })?.data ||
        res.data ||
        {}) as Record<string, unknown>;
      const updatedProfile =
        updated.practiceProfile && typeof updated.practiceProfile === "object"
          ? (updated.practiceProfile as Record<string, unknown>)
          : null;
      const savedOral = Boolean(updatedProfile?.usesOralScan ?? nextOral);
      const savedRequire = readRequireUpload(
        typeof updatedProfile?.requireLabProsthesisUpload === "boolean"
          ? updatedProfile.requireLabProsthesisUpload
          : nextRequire,
      );
      savedRef.current = { usesOralScan: savedOral, requireUpload: savedRequire };
      setUser({
        ...user,
        practiceProfile: {
          ...pp,
          usesOralScan: savedOral,
          requireLabProsthesisUpload: savedRequire,
          updatedAt: String(
            updatedProfile?.updatedAt || new Date().toISOString(),
          ),
        },
      });
      setSavedTick((n) => n + 1);
    } catch (error) {
      setUsesOralScan(savedRef.current.usesOralScan);
      setRequireUpload(savedRef.current.requireUpload);
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-slate-200/80 shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary-strong" />
            구강 스캐너
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            구강 스캐너 사용 여부를 알려주시면
            <br />
            스캔바 등 디지털 지원을 안내합니다.
          </p>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <Checkbox
              className="mt-0.5"
              checked={usesOralScan}
              onCheckedChange={(v) => setUsesOralScan(v === true)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-slate-900">
                구강 스캐너를 사용하고 있습니다
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4 text-primary-strong" />
            보철 작업물
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            기공소가 최종 보철을 올리면
            <br />
            치과에서 기공물 데이터를 미리볼 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <Checkbox
              className="mt-0.5"
              checked={requireUpload}
              onCheckedChange={(v) => setRequireUpload(v === true)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-slate-900">
                보철 작업물 업로드를 요청합니다
              </span>
              <span className="block text-xs leading-relaxed text-slate-500">
                협력 기공소 의뢰만 이 설정을 따릅니다.
                <br />
                끄면 보철 파일 없이도 작업이 완료됩니다.
                <br />
                어벗츠기공본부로 보낸 의뢰는 내부 처리·하청 모두 완성 보철을
                올립니다.
                <br />
                이미 보낸 협력 의뢰에는 적용되지 않습니다.
              </span>
            </span>
          </label>
          <p className="text-xs text-slate-400">
            {saving ? "저장 중…" : savedTick > 0 ? "저장되었습니다" : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
