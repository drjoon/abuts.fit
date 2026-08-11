// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-11: 입력 폼 제거 → 소개코드/초대링크/안내문구 생성·복사, 목록 2열 카드.
// - 2026-08-11: 「치과에 전달하기」중첩 카드 제거, 안내 문구 단순화.
// - 2026-08-11: 목록 뱃지 — 가입 진행중(pending) / 등록 완료(active).
// - 2026-08-11: 초대링크·안내문구 복사만으로는 목록 카드 미생성(가입 시작 시 표시).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Handshake,
  Link2,
  Loader2,
  Check,
  Send,
  Hash,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";

type PartnerItem = {
  _id: string;
  status: string;
  inviteToken: string;
  invitePath: string;
  practiceHint?: { name?: string; phone?: string; memo?: string };
  invitedAt?: string;
  boundAt?: string | null;
  activatedAt?: string | null;
  practiceName?: string;
  practiceAddress?: string;
  practiceRepresentativeName?: string;
  practiceStatus?: string | null;
};

type WindowInfo = {
  canInvite?: boolean;
  remainingDays?: number | null;
  elapsedDays?: number | null;
  windowDays?: number;
  pricingBaseDate?: string | null;
  feeRates?: { labReferredFeeRate?: number; nonPartnerFeeRate?: number };
};

export const LabTradingPartnersTab = () => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PartnerItem[]>([]);
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);

  const referralCode = useMemo(
    () =>
      String(user?.referralCode || "")
        .trim()
        .toUpperCase(),
    [user?.referralCode],
  );

  const inviteOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

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

  const buildInviteUrl = (path: string) => {
    const base = `${inviteOrigin}${path}`;
    if (!referralCode) return base;
    const sep = path.includes("?") ? "&" : "?";
    return `${base}${sep}ref=${encodeURIComponent(referralCode)}`;
  };

  const copyText = async (
    text: string,
    okTitle: string,
    setFlag?: (v: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      if (setFlag) {
        setFlag(true);
        setTimeout(() => setFlag(false), 2000);
      }
      toast({ title: okTitle, duration: 2000 });
    } catch {
      toast({
        title: "복사 실패",
        description: text,
        variant: "destructive",
      });
    }
  };

  const createInvite = async (): Promise<string | null> => {
    if (!token) return null;
    const res = await request<{
      success?: boolean;
      message?: string;
      data?: PartnerItem & { invitePath?: string };
    }>({
      path: "/api/lab-trading-partners",
      method: "POST",
      token,
      jsonBody: {},
    });
    if (!res.ok) {
      toast({
        title: "초대 생성 실패",
        description: res.data?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
      return null;
    }
    const path = String(res.data?.data?.invitePath || "").trim();
    if (!path) return null;
    // 초대 링크는 URL만 (안내 문구와 분리)
    return buildInviteUrl(path);
  };

  const handleCopyCode = async () => {
    if (!referralCode) {
      toast({
        title: "복사 실패",
        description: "소개 코드를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    await copyText(referralCode, "소개 코드를 복사했습니다.", setCodeCopied);
  };

  const handleCreateInviteLink = async () => {
    setCreating(true);
    try {
      const url = await createInvite();
      if (!url) return;
      // URL만 클립보드에 넣음. 목록 카드는 치과 가입 시작 시 생성.
      await copyText(url, "초대 링크를 복사했습니다.", setLinkCopied);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyGuideMessage = async () => {
    setCreating(true);
    try {
      const url = await createInvite();
      if (!url) return;
      const message = canInvite
        ? `안녕하세요 🙂 어벗츠 소개치과로 등록하시면 플랫폼 수수료가 면제됩니다.\n아래 링크로 가입 후 사업자등록증 검증을 완료해 주세요.\n${url}`
        : `안녕하세요 🙂 어벗츠에 함께해요!\n아래 링크로 가입 후 사업자등록증 검증을 완료해 주세요.\n${url}`;
      await copyText(
        message,
        "안내 문구를 복사했습니다.",
        setMessageCopied,
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  const canInvite = Boolean(windowInfo?.canInvite);
  const remaining =
    windowInfo?.remainingDays == null ? null : Number(windowInfo.remainingDays);
  const windowDays = Number(windowInfo?.windowDays ?? 60);
  const platformFeePct = Math.round(
    Number(windowInfo?.feeRates?.nonPartnerFeeRate ?? 0.1) * 100,
  );
  const creditPct = 100 - platformFeePct;

  return (
    <div className="space-y-4">
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">결제 안내</CardTitle>
          <CardDescription>
            플랫폼 수수료와 커스텀 어벗 생산 서비스 이용 안내입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-xl border border-border/80 bg-background/60 px-3.5 py-3 space-y-2">
            <p className="font-semibold text-slate-900">
              플랫폼 수수료 {platformFeePct}%
            </p>
            <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground">
              <li>
                어벗츠가 중개한 모든 의뢰건에 대해 수수료 {platformFeePct}%를
                제하고 나머지 {creditPct}%를 결제크레딧으로 지급합니다.
              </li>
              <li>
                단, 기공소 가입 후 {windowDays}일간 거래하시던 치과를 소개하여
                가입하면(소개치과) 수수료를 면제합니다.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border/80 bg-background/60 px-3.5 py-3 space-y-1.5">
            <p className="font-semibold text-slate-900">
              커스텀 어벗 생산 서비스
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              치과나 기공소는 어벗츠에게 커스텀 어벗 생산을 의뢰할 수 있으며,
              이 경우 의뢰크레딧이 차감됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            치과 등록·소개
          </CardTitle>
          <CardDescription>
            {canInvite ? (
              <>
                <span className="font-semibold text-foreground">
                  가입 후 {windowDays}일 이내
                </span>
                에 거래하시던 치과를 소개하면 소개치과(수수료 면제)로
                등록됩니다. 아래에서 소개 코드·초대 링크·안내 문구를 복사해
                치과에 전달하세요. 가입·사업자등록증 검증 후 등록됩니다.
              </>
            ) : (
              <>
                {windowDays}일 등록 기간이 종료되었습니다. 이후 소개 가입
                치과는 플랫폼 수수료 {platformFeePct}%가 적용됩니다. 아래에서
                소개 코드·초대 링크·안내 문구를 복사해 치과에 전달하세요.
                가입·사업자등록증 검증 후 등록됩니다.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">등록 가능 기간</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                      canInvite
                        ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                        : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    }`}
                  >
                    {remaining == null
                      ? "-"
                      : canInvite
                        ? `D-${remaining}일`
                        : "기간 종료 · 이후 소개는 수수료 면제 없음"}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  복사한 내용을 치과에 전달하세요.
                </p>
              </div>

              {referralCode ? (
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="shrink-0 rounded-xl bg-slate-50 px-4 py-3 text-right transition-colors hover:bg-slate-100 sm:min-w-[10rem]"
                >
                  <div className="text-xs font-medium text-slate-500">
                    소개 코드
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tracking-wider text-slate-900">
                    {referralCode}
                  </div>
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyCode()}
                disabled={!referralCode}
                className="h-10 gap-1.5"
              >
                {codeCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
                {codeCopied ? "복사됨" : "소개 코드"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateInviteLink()}
                disabled={creating}
                className="h-10 gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : linkCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {linkCopied ? "복사됨" : "초대 링크"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleCopyGuideMessage()}
                disabled={creating}
                className="h-10 gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : messageCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {messageCopied ? "복사됨" : "안내 문구"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base">등록 목록</CardTitle>
          <CardDescription>
            초대 링크로 가입을 시작한 치과가 표시됩니다. 사업자등록증 검증 후
            등록 완료됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              등록된 치과가 없습니다.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const isActive = item.status === "active";
                const isReferred = item.status === "referred";
                const name =
                  item.practiceName ||
                  item.practiceHint?.name ||
                  (isActive
                    ? "소개치과"
                    : isReferred
                      ? "등록 치과"
                      : "가입 진행 중");
                const address = String(item.practiceAddress || "").trim();
                const representative = String(
                  item.practiceRepresentativeName || "",
                ).trim();
                const badgeLabel = isActive
                  ? "소개치과 · 수수료 면제"
                  : isReferred
                    ? "등록 치과"
                    : "가입 진행 중";
                const badgeClassName = isActive
                  ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                  : isReferred
                    ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                    : "bg-amber-50 text-amber-800 ring-1 ring-amber-200";

                return (
                  <div
                    key={item._id}
                    className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/60 px-4 py-3.5"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-900 truncate">
                          {name}
                        </p>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${badgeClassName}`}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                      <dl className="space-y-1 text-[13px] text-muted-foreground">
                        <div className="flex gap-2">
                          <dt className="shrink-0 w-14 text-slate-500">주소</dt>
                          <dd className="min-w-0 break-words">
                            {address || "—"}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 w-14 text-slate-500">
                            대표원장
                          </dt>
                          <dd className="min-w-0 truncate">
                            {representative || "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
