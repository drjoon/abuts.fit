// related files:
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
// - web/frontend/src/shared/practice/labArrivalDefaults.ts
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - 2026-08-25: 치과 설정 — 기공소별 주문→치과도착 기본 일수.

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
  normalizeArrivalDefaultDays,
  normalizeLabArrivalDefaults,
  upsertLabArrivalDefault,
  type PracticeLabArrivalDefault,
} from "@/shared/practice/labArrivalDefaults";

type SettingsPayload = {
  arrivalDefaultDays?: number;
  labArrivalDefaults?: PracticeLabArrivalDefault[];
};

export function PracticeTransferArrivalSettingsTab() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountArrivalDefaultDays, setAccountArrivalDefaultDays] = useState(
    DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
  );
  const [labArrivalDefaults, setLabArrivalDefaults] = useState<
    PracticeLabArrivalDefault[]
  >([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{ data?: SettingsPayload }>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("기공의뢰 설정을 불러오지 못했습니다.");
      }
      const data =
        res.data && typeof res.data === "object"
          ? ((res.data as { data?: SettingsPayload }).data ??
            (res.data as SettingsPayload))
          : {};
      setAccountArrivalDefaultDays(
        normalizeArrivalDefaultDays(data.arrivalDefaultDays),
      );
      setLabArrivalDefaults(normalizeLabArrivalDefaults(data.labArrivalDefaults));
    } catch (error) {
      toast({
        title: "설정 로딩 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAccountDays = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const days = normalizeArrivalDefaultDays(accountArrivalDefaultDays);
      const res = await request({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token,
        jsonBody: { arrivalDefaultDays: days },
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      setAccountArrivalDefaultDays(days);
      toast({ title: "저장 완료", description: "기본 도착 일수를 저장했습니다." });
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveLabRow = async (row: PracticeLabArrivalDefault) => {
    if (!token) return;
    setSaving(true);
    try {
      const nextDays = normalizeArrivalDefaultDays(row.arrivalDefaultDays);
      const res = await request<{ data?: SettingsPayload }>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token,
        jsonBody: {
          labArrivalDefault: {
            labAnchorId: row.labAnchorId,
            labName: row.labName,
            arrivalDefaultDays: nextDays,
          },
        },
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      const data =
        res.data && typeof res.data === "object"
          ? ((res.data as { data?: SettingsPayload }).data ?? null)
          : null;
      if (data?.labArrivalDefaults) {
        setLabArrivalDefaults(normalizeLabArrivalDefaults(data.labArrivalDefaults));
      } else {
        setLabArrivalDefaults((prev) =>
          upsertLabArrivalDefault(prev, {
            labAnchorId: row.labAnchorId,
            labName: row.labName,
            arrivalDefaultDays: nextDays,
          }),
        );
      }
      toast({
        title: "저장 완료",
        description: `${row.labName || "기공소"} 도착 일수를 저장했습니다.`,
      });
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeLabRow = async (labAnchorId: string) => {
    if (!token) return;
    setSaving(true);
    try {
      const next = labArrivalDefaults.filter(
        (row) => String(row.labAnchorId) !== String(labAnchorId),
      );
      const res = await request<{ data?: SettingsPayload }>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token,
        jsonBody: { labArrivalDefaults: next },
      });
      if (!res.ok) throw new Error("삭제에 실패했습니다.");
      const data =
        res.data && typeof res.data === "object"
          ? ((res.data as { data?: SettingsPayload }).data ?? null)
          : null;
      setLabArrivalDefaults(
        normalizeLabArrivalDefaults(data?.labArrivalDefaults ?? next),
      );
      toast({ title: "삭제 완료", description: "기공소별 설정을 삭제했습니다." });
    } catch (error) {
      toast({
        title: "삭제 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>주문-치과도착 기본 일수</CardTitle>
          <CardDescription>
            기공소를 고르면 해당 기공소 설정이 적용됩니다. 없으면 아래 기본값을
            씁니다. (달력 일수)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="practice-arrival-default-days">기본 일수</Label>
              <Input
                id="practice-arrival-default-days"
                type="number"
                min={0}
                max={365}
                className="h-9 w-28"
                disabled={loading || saving}
                value={accountArrivalDefaultDays}
                onChange={(e) =>
                  setAccountArrivalDefaultDays(
                    normalizeArrivalDefaultDays(e.target.value),
                  )
                }
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={loading || saving}
              onClick={() => void saveAccountDays()}
            >
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기공소별 설정</CardTitle>
          <CardDescription>
            기공의뢰에서 주문-치과도착을 바꾸면 선택한 기공소에 자동 저장됩니다.
            여기서도 수정·삭제할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : labArrivalDefaults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 기공소별 설정이 없습니다. 기공의뢰에서 기공소를 고른 뒤
              주문-치과도착을 바꾸면 여기에 나타납니다.
            </p>
          ) : (
            labArrivalDefaults.map((row) => (
              <div
                key={row.labAnchorId}
                className="flex flex-wrap items-end gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  <Label className="text-muted-foreground">기공소</Label>
                  <p className="truncate text-sm font-medium">
                    {row.labName || row.labAnchorId}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`lab-arrival-${row.labAnchorId}`}>일수</Label>
                  <Input
                    id={`lab-arrival-${row.labAnchorId}`}
                    type="number"
                    min={0}
                    max={365}
                    className="h-9 w-24"
                    disabled={saving}
                    value={row.arrivalDefaultDays}
                    onChange={(e) => {
                      const nextDays = normalizeArrivalDefaultDays(e.target.value);
                      setLabArrivalDefaults((prev) =>
                        prev.map((item) =>
                          item.labAnchorId === row.labAnchorId
                            ? { ...item, arrivalDefaultDays: nextDays }
                            : item,
                        ),
                      );
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={saving}
                  onClick={() => void saveLabRow(row)}
                >
                  저장
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  disabled={saving}
                  onClick={() => void removeLabRow(row.labAnchorId)}
                >
                  삭제
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
