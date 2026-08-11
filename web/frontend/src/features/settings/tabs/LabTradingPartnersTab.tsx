// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-11: 거래처 O/X 결제 흐름 안내 카드 추가.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Handshake, Copy, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";

type PartnerItem = {
  _id: string;
  status: string;
  inviteToken: string;
  invitePath: string;
  practiceHint?: { name?: string; phone?: string; memo?: string };
  invitedAt?: string;
  activatedAt?: string | null;
  practiceName?: string;
  practiceStatus?: string | null;
};

type WindowInfo = {
  canInvite?: boolean;
  remainingDays?: number | null;
  elapsedDays?: number | null;
  windowDays?: number;
  pricingBaseDate?: string | null;
};

export const LabTradingPartnersTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PartnerItem[]>([]);
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: { items?: PartnerItem[]; window?: WindowInfo };
        message?: string;
      }>({
        path: "/api/lab-trading-partners",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "거래 치과 목록 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const data = res.data?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setWindowInfo(data.window || null);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const copyLink = async (path: string) => {
    const url = `${inviteOrigin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "초대 링크를 복사했습니다." });
    } catch {
      toast({
        title: "복사 실패",
        description: url,
        variant: "destructive",
      });
    }
  };

  const createInvite = async () => {
    if (!token) return;
    setCreating(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
        data?: PartnerItem & { invitePath?: string };
      }>({
        path: "/api/lab-trading-partners",
        method: "POST",
        token,
        jsonBody: { name, phone, memo },
      });
      if (!res.ok) {
        toast({
          title: "초대 생성 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const path = res.data?.data?.invitePath;
      if (path) await copyLink(path);
      setName("");
      setPhone("");
      setMemo("");
      await load();
      toast({ title: "거래 치과 초대를 생성했습니다." });
    } finally {
      setCreating(false);
    }
  };

  const cancelInvite = async (id: string) => {
    if (!token) return;
    const res = await request<{ message?: string }>({
      path: `/api/lab-trading-partners/${encodeURIComponent(id)}/cancel`,
      method: "POST",
      token,
    });
    if (!res.ok) {
      toast({
        title: "취소 실패",
        description: res.data?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }
    await load();
    toast({ title: "초대를 취소했습니다." });
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  const canInvite = Boolean(windowInfo?.canInvite);
  const remaining =
    windowInfo?.remainingDays == null ? null : Number(windowInfo.remainingDays);

  return (
    <div className="space-y-4">
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base">결제 안내</CardTitle>
          <CardDescription>
            치과 기공의뢰 시, 거래 치과 등록 여부에 따라 커스텀 어벗 요금
            귀속이 달라집니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-2">
            <p className="font-semibold text-slate-900">공통</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                크라운·브리지·인레이·Pontic 등 보철 기공비 → 기공소
                결제크레딧
              </li>
              <li>
                기공소가 직접 어벗의뢰할 때 → 기존처럼 생산단가를 어벗츠에
                납부
              </li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-primary-muted bg-primary-soft/40 p-4 space-y-2">
              <p className="font-semibold text-primary-strong">
                거래 치과로 등록된 경우
              </p>
              <ul className="list-disc space-y-1 pl-5 text-slate-700">
                <li>치과가 낸 기공비 전액 → 기공소 몫</li>
                <li>
                  기공소는 커스텀 어벗 의뢰시 어벗츠에게 어벗 의뢰 비용 납부
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-2">
              <p className="font-semibold text-slate-900">
                거래 치과로 등록되지 않은 경우
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>보철 기공비 → 기공소 배당</li>
                <li>커스텀 어벗 치과 납품가 → 어벗츠 배당</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            거래 치과 등록
          </CardTitle>
          <CardDescription>
            가입 후 30일 동안만 기존 거래 치과를 등록할 수 있습니다. 치과가
            초대 링크로 가입하고 사업자등록증 검증을 완료하면 등록됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">등록 가능 기간</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                canInvite
                  ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {remaining == null
                ? "-"
                : canInvite
                  ? `D-${remaining}일`
                  : "기간 종료"}
            </span>
          </div>

          {canInvite ? (
            <section className="rounded-xl border border-border/80 bg-background/60 p-4 sm:p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">
                신규 초대
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="partner-name">치과명 (메모)</Label>
                  <Input
                    id="partner-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: ○○치과의원"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-phone">연락처 (메모)</Label>
                  <Input
                    id="partner-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-0000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-memo">메모</Label>
                  <Input
                    id="partner-memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void createInvite()} disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  초대 링크 생성
                </Button>
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              신규 거래 치과 등록 기간이 종료되었습니다. 이미 등록·초대된 건은
              유지됩니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base">등록·초대 목록</CardTitle>
          <CardDescription>
            초대 링크를 치과에 전달하세요. 사업자 검증이 끝나면 등록 완료됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 등록·초대가 없습니다.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item._id}
                className="flex flex-col gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-slate-900">
                    {item.practiceName ||
                      item.practiceHint?.name ||
                      "초대 대기"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.status === "active" ? "등록 완료" : "초대 중"}
                    {item.invitedAt
                      ? ` · ${formatKstDateTimeToKo(item.invitedAt)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "invited" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyLink(item.invitePath)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        링크 복사
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void cancelInvite(item._id)}
                      >
                        취소
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
