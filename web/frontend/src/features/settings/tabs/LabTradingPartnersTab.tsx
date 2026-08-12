// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-11: 입력 폼 제거 → 소개코드/초대링크/안내문구 생성·복사, 목록 2열 카드.
// - 2026-08-11: 「치과에 전달하기」중첩 카드 제거, 안내 문구 단순화.
// - 2026-08-11: 목록 뱃지 — 가입 진행중(pending) / 등록 완료(active).
// - 2026-08-11: 초대링크·안내문구 복사만으로는 목록 카드 미생성(가입 시작 시 표시).
// - 2026-08-12: 상단 수수료 안내 — 예시 매출·수수료 다이어그램(프로그레스바)으로 교체.
// - 2026-08-12: 200만 구간 확대 연결선 + 확대 영역 내부 배분 바로 조정.
// - 2026-08-12: 치과등록 안내 반복 제거, 한시 적용 문구 단일화.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Handshake,
  Link2,
  Loader2,
  Check,
  Send,
  Hash,
  ShieldCheck,
  Percent,
  Info,
  Building2,
  Clock,
  Users,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { cn } from "@/shared/ui/cn";
import { Separator } from "@/components/ui/separator";

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
  feeRates?: { partnerFeeRate?: number; nonPartnerFeeRate?: number };
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
        ? `안녕하세요 🙂 기존 거래 치과로 등록하시면 플랫폼 수수료가 면제됩니다.\n아래 링크로 가입 후 사업자등록증 검증을 완료해 주세요.\n${url}`
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
    Number(windowInfo?.feeRates?.nonPartnerFeeRate ?? 0.25) * 100,
  );
  // 안내 예시: 기존 거래 1,000만 + 플랫폼 추가 200만 → 수수료는 추가분만
  const exampleExistingMan = 1000;
  const examplePlatformMan = 200;
  const exampleFeeMan = Math.round(
    (examplePlatformMan * platformFeePct) / 100,
  );
  const exampleLabFromPlatformMan = examplePlatformMan - exampleFeeMan;
  const exampleTotalMan = exampleExistingMan + examplePlatformMan;
  const existingBarPct = Math.round(
    (exampleExistingMan / exampleTotalMan) * 100,
  );
  const platformBarPct = 100 - existingBarPct;
  // 200만 구간을 오른쪽으로 확대해 수수료 조각을 읽기 쉽게 표시
  const zoomPanelStartPct = Math.min(
    existingBarPct,
    Math.max(42, existingBarPct - 28),
  );
  const windowProgressPct =
    remaining == null || windowDays <= 0
      ? 0
      : Math.min(
          100,
          Math.max(0, Math.round(((windowDays - remaining) / windowDays) * 100)),
        );

  return (
    <div className="space-y-5">
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-primary-strong" />
            치과 등록
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            거래해오시던 치과를 등록하시면, 해당 치과들에 대해서는 플랫폼
            수수료가 면제됩니다. (한시 적용)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">
                수수료 예시
              </p>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
                플랫폼 수수료 {platformFeePct}%
              </span>
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              기존 매출 {exampleExistingMan.toLocaleString()}만원, 플랫폼 가입
              후 추가 매출 {examplePlatformMan.toLocaleString()}만원일 경우,
              플랫폼 수수료는 {examplePlatformMan.toLocaleString()}만원에 대한{" "}
              {platformFeePct}%인 {exampleFeeMan.toLocaleString()}만원
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span>월 매출 구성</span>
                <span className="tabular-nums">
                  합계 {exampleTotalMan.toLocaleString()}만원
                </span>
              </div>

              <div
                className="flex h-9 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70"
                role="img"
                aria-label={`기존 거래 ${exampleExistingMan}만원, 플랫폼 추가 ${examplePlatformMan}만원`}
              >
                <div
                  className="flex items-center justify-center bg-primary-strong px-2 text-[11px] font-semibold tabular-nums text-white"
                  style={{ width: `${existingBarPct}%` }}
                >
                  <span className="truncate">
                    {exampleExistingMan.toLocaleString()}만
                  </span>
                </div>
                <div
                  className="flex items-center justify-center bg-sky-400/90 px-2 text-[11px] font-semibold tabular-nums text-white"
                  style={{ width: `${platformBarPct}%` }}
                >
                  <span className="truncate">
                    {examplePlatformMan.toLocaleString()}만
                  </span>
                </div>
              </div>

              {/* 200만 구간 → 확대 영역 연결선 + 내부 배분 바 */}
              <div className="relative mt-0.5">
                <svg
                  className="h-7 w-full text-sky-300"
                  viewBox="0 0 100 28"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polygon
                    points={`${existingBarPct},0 100,0 100,28 ${zoomPanelStartPct},28`}
                    fill="currentColor"
                    opacity="0.18"
                  />
                  <line
                    x1={existingBarPct}
                    y1="0"
                    x2={zoomPanelStartPct}
                    y2="28"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="100"
                    y1="0"
                    x2="100"
                    y2="28"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                <div className="flex">
                  <div
                    className="shrink-0"
                    style={{ width: `${zoomPanelStartPct}%` }}
                    aria-hidden
                  />
                  <div
                    className="min-w-0 space-y-1.5"
                    style={{ width: `${100 - zoomPanelStartPct}%` }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                      <span>기공소 몫</span>
                      <span className="tabular-nums text-amber-700">
                        플랫폼 수수료
                      </span>
                    </div>
                    <div
                      className="grid h-9 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-full bg-sky-50 ring-1 ring-sky-200/80"
                      role="img"
                      aria-label={`추가 매출 ${examplePlatformMan}만원 중 기공소 ${exampleLabFromPlatformMan}만원, 플랫폼 수수료 ${exampleFeeMan}만원`}
                    >
                      <div className="flex min-w-0 items-center px-2.5 text-[11px] font-medium tabular-nums text-sky-900/80">
                        <span className="truncate">
                          {exampleLabFromPlatformMan.toLocaleString()}만
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-center bg-amber-500 px-3 text-[11px] font-semibold tabular-nums text-white whitespace-nowrap"
                        title={`플랫폼 수수료 ${exampleFeeMan.toLocaleString()}만원`}
                      >
                        {exampleFeeMan.toLocaleString()}만
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary-muted/70 bg-primary-soft/35 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 ring-1 ring-primary-muted/60">
                  <ShieldCheck className="h-[18px] w-[18px] text-primary-strong" />
                </span>
                <p className="text-sm font-semibold text-primary-strong">
                  등록 치과 · 수수료 면제
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
                  <Percent className="h-[18px] w-[18px] text-slate-600" />
                </span>
                <p className="text-sm font-semibold text-slate-900">
                  미등록 의뢰 · {platformFeePct}%
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-4 py-3.5">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {windowDays}일 등록·수수료 면제 혜택은 한시 이벤트이며, 정책에
                따라 변경·종료될 수 있습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                어벗츠에 직접 커스텀 어벗 생산을 의뢰할 수 있습니다. 별도
                의뢰크레딧이 차감됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-5 w-5 text-primary-strong" />
            치과 등록·소개
          </CardTitle>
          {!canInvite ? (
            <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-slate-700">
                등록 기간({windowDays}일)이 지났습니다. 이후 등록 치과에도
                수수료 {platformFeePct}%가 적용됩니다.
              </p>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5 pt-2">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Clock className="h-4 w-4 text-slate-400" />
                    등록 가능 기간
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
                      canInvite
                        ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                        : "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
                    )}
                  >
                    {remaining == null
                      ? "-"
                      : canInvite
                        ? `D-${remaining}일`
                        : "기간 종료"}
                  </span>
                </div>

                {remaining != null && canInvite ? (
                  <div className="space-y-1.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                      <div
                        className="h-full rounded-full bg-primary-strong transition-all"
                        style={{ width: `${windowProgressPct}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {referralCode ? (
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="group shrink-0 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-primary-muted hover:shadow-md sm:min-w-[11rem]"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    소개 코드 · 탭하여 복사
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold tracking-[0.18em] text-slate-900 group-hover:text-primary-strong">
                    {referralCode}
                  </div>
                </button>
              ) : null}
            </div>

            <Separator className="my-4 bg-slate-200/70" />

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(
                [
                  {
                    key: "code",
                    label: codeCopied ? "복사됨" : "소개 코드",
                    icon: codeCopied ? Check : Hash,
                    onClick: () => void handleCopyCode(),
                    disabled: !referralCode,
                    active: codeCopied,
                  },
                  {
                    key: "link",
                    label: linkCopied ? "복사됨" : "초대 링크",
                    icon: creating
                      ? Loader2
                      : linkCopied
                        ? Check
                        : Link2,
                    onClick: () => void handleCreateInviteLink(),
                    disabled: creating,
                    active: linkCopied,
                    spin: creating,
                  },
                  {
                    key: "message",
                    label: messageCopied ? "복사됨" : "안내 문구",
                    icon: creating
                      ? Loader2
                      : messageCopied
                        ? Check
                        : Send,
                    onClick: () => void handleCopyGuideMessage(),
                    disabled: creating,
                    active: messageCopied,
                    spin: creating,
                  },
                ] as const
              ).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
                      action.active
                        ? "border-primary-muted bg-primary-soft/50 shadow-sm"
                        : "border-slate-200/80 bg-white hover:border-primary-muted/70 hover:bg-primary-soft/20 hover:shadow-sm",
                      action.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                        action.active
                          ? "bg-white text-primary-strong ring-1 ring-primary-muted/60"
                          : "bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-primary-strong",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px]",
                          "spin" in action && action.spin && "animate-spin",
                        )}
                      />
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary-strong" />
            등록 목록
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            초대 링크로 가입을 시작한 치과가 표시됩니다. 사업자등록증 검증
            후 등록 완료됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                <Building2 className="h-5 w-5 text-slate-400" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-700">
                등록된 치과가 없습니다
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                초대 링크를 전달하면 치과가 가입을 시작할 때 이곳에 표시됩니다.
              </p>
            </div>
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
                  ? "등록 치과 · 수수료 면제"
                  : isReferred
                    ? "등록 치과"
                    : "가입 진행 중";

                return (
                  <div
                    key={item._id}
                    className={cn(
                      "overflow-hidden rounded-2xl border bg-white/70 shadow-sm transition-shadow hover:shadow-md",
                      isActive
                        ? "border-primary-muted/70"
                        : isReferred
                          ? "border-slate-200/80"
                          : "border-amber-200/70",
                    )}
                  >
                    <div
                      className={cn(
                        "h-1 w-full",
                        isActive
                          ? "bg-primary-strong"
                          : isReferred
                            ? "bg-slate-300"
                            : "bg-amber-400",
                      )}
                    />
                    <div className="space-y-3 px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {name}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 inline-flex max-w-[9rem] items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-snug text-center",
                            isActive
                              ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                              : isReferred
                                ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                                : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
                          )}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                      <dl className="space-y-2 text-[13px]">
                        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                          <dt className="text-slate-500">주소</dt>
                          <dd className="min-w-0 break-words text-slate-700">
                            {address || "—"}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                          <dt className="text-slate-500">대표원장</dt>
                          <dd className="min-w-0 truncate text-slate-700">
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
