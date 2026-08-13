// change-log:
// - 2026-08-13: 디자인비 항목을 디자인+생산으로 교체. 생산만·디자인+생산을 멤버십/일반 단가로 분리.
// - 2026-08-13: 치과 멤버십 월 구독료(practiceMembershipMonthlyFee) 추가.
// - 2026-08-13: 디자인비(1어벗당) 입력 복구. 기본 생산 15,000 + 디자인 5,000.
// - 2026-08-13: 파트너 요금·크레딧 UI를 카드/아이콘/자동저장 스타일로 정리.
// - 2026-08-13: 저장/취소 버튼 제거 → 변경 시 디바운스 자동 저장.
// - 2026-08-13: 특별 공급가 — 의뢰자 검색 후 추가·금액 입력, 다수 지정 지원.
// - 2026-08-13: 카드 제목/설명 제거, 라벨을「커스텀 어벗 의뢰비」로 변경, 의뢰자별 특별 공급가 UI 추가.
// - 2026-08-10: 레이아웃·여백 정리, 긴 도움말은 툴팁으로 이동.
// - 2026-08-09: 디자인비 도움말에 출고 +1영업일(묶음·신속) 안내 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/creditSettingsDefaults.js
import { useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { CREDIT_SETTINGS_DEFAULTS } from "@/hooks/useSystemSettings";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronsUpDown,
  CircleHelp,
  Crown,
  Gift,
  Package,
  PenLine,
  Plus,
  Search,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { REQUESTOR_CAPABILITY_LABEL } from "@/shared/business/requestorCapabilities";

interface CreditSettings {
  minCreditForRequest: number;
  specialRequestorPrices: SpecialRequestorPrice[];
  shippingFee: number;
  expressFee: number;
  designFee: number;
  abutmentRetailPrice: number;
  practiceMembershipMonthlyFee: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
  membershipProductionPrice: number;
  regularProductionPrice: number;
  membershipDesignAndProductionPrice: number;
  regularDesignAndProductionPrice: number;
}

type SpecialRequestorPrice = {
  requestorAnchorId: string;
  amount: number;
};

type RequestorItem = {
  id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
  requestorKind?: "practice" | "lab" | null;
  status?: string | null;
};

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

type CreditPriceRequestorsApiResponse = {
  success?: boolean;
  data?: { items?: RequestorItem[] };
};

const AUTO_SAVE_DELAY_MS = 700;

function normalizeCreditSettings(
  raw: Partial<CreditSettings> | typeof CREDIT_SETTINGS_DEFAULTS,
  fallback: CreditSettings,
): CreditSettings {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...fallback,
    ...raw,
  });
  return {
    minCreditForRequest: abutmentPrices.membershipProductionPrice,
    specialRequestorPrices: Array.isArray(raw.specialRequestorPrices)
      ? raw.specialRequestorPrices.map((item) => ({
          requestorAnchorId: String(item.requestorAnchorId || ""),
          amount: Math.max(0, Number(item.amount) || 0),
        }))
      : fallback.specialRequestorPrices,
    shippingFee: Number(raw.shippingFee ?? fallback.shippingFee),
    expressFee: Number(raw.expressFee ?? fallback.expressFee),
    designFee: Math.max(
      0,
      abutmentPrices.membershipDesignAndProductionPrice -
        abutmentPrices.membershipProductionPrice,
    ),
    abutmentRetailPrice: Number(
      raw.abutmentRetailPrice ?? fallback.abutmentRetailPrice ?? 40000,
    ),
    practiceMembershipMonthlyFee: Number(
      raw.practiceMembershipMonthlyFee ??
        fallback.practiceMembershipMonthlyFee ??
        55000,
    ),
    defaultRequestFreeCredit: Number(
      raw.defaultRequestFreeCredit ?? fallback.defaultRequestFreeCredit,
    ),
    defaultShippingFreeCredit: Number(
      raw.defaultShippingFreeCredit ?? fallback.defaultShippingFreeCredit,
    ),
    ...abutmentPrices,
  };
}

function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-slate-400 transition-colors hover:text-slate-700"
          aria-label="도움말"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  disabled,
  help,
  icon: Icon,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  help?: string;
  icon?: typeof Gift;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
            <Icon className="h-4 w-4 text-slate-600" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={id} className="text-sm font-medium text-slate-800">
              {label}
            </Label>
            {help ? <FieldHelp text={help} /> : null}
          </div>
        </div>
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          disabled={disabled}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

function DualTierAmountField({
  label,
  membershipId,
  regularId,
  membershipValue,
  regularValue,
  onMembershipChange,
  onRegularChange,
  disabled,
  help,
  icon: Icon,
}: {
  label: string;
  membershipId: string;
  regularId: string;
  membershipValue: number;
  regularValue: number;
  onMembershipChange: (next: number) => void;
  onRegularChange: (next: number) => void;
  disabled?: boolean;
  help?: string;
  icon?: typeof Gift;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
            <Icon className="h-4 w-4 text-slate-600" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium text-slate-800">{label}</div>
            {help ? <FieldHelp text={help} /> : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label
            htmlFor={membershipId}
            className="mb-1.5 block text-[11px] font-medium text-slate-500"
          >
            멤버십
          </Label>
          <div className="relative">
            <Input
              id={membershipId}
              type="number"
              min="0"
              className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
              value={membershipValue}
              onChange={(e) =>
                onMembershipChange(Math.max(0, Number(e.target.value)))
              }
              disabled={disabled}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              원
            </span>
          </div>
        </div>
        <div>
          <Label
            htmlFor={regularId}
            className="mb-1.5 block text-[11px] font-medium text-slate-500"
          >
            일반
          </Label>
          <div className="relative">
            <Input
              id={regularId}
              type="number"
              min="0"
              className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
              value={regularValue}
              onChange={(e) =>
                onRegularChange(Math.max(0, Number(e.target.value)))
              }
              disabled={disabled}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              원
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: typeof Gift;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Icon className="h-5 w-5 text-primary-strong" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export const AdminCreditSettingsTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>({
    ...CREDIT_SETTINGS_DEFAULTS,
    specialRequestorPrices: [],
  });
  const [requestors, setRequestors] = useState<RequestorItem[]>([]);
  const [requestorPickerOpen, setRequestorPickerOpen] = useState(false);
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const requestorById = useMemo(() => {
    const map = new Map<string, RequestorItem>();
    requestors.forEach((item) => map.set(item.id, item));
    return map;
  }, [requestors]);

  const availableRequestors = useMemo(
    () =>
      requestors.filter(
        (requestor) =>
          !settings.specialRequestorPrices.some(
            (item) => item.requestorAnchorId === requestor.id,
          ),
      ),
    [requestors, settings.specialRequestorPrices],
  );

  const getRequestorLabel = (item: RequestorItem) => {
    const kindLabel =
      item.requestorKind === "practice" || item.requestorKind === "lab"
        ? REQUESTOR_CAPABILITY_LABEL[item.requestorKind]
        : "";
    const bn = String(item.businessNumber || "").trim();
    return [item.name, kindLabel, bn ? `(${bn})` : ""].filter(Boolean).join(" ");
  };

  const addSpecialRequestor = (requestor: RequestorItem) => {
    if (
      settings.specialRequestorPrices.some(
        (item) => item.requestorAnchorId === requestor.id,
      )
    ) {
      return;
    }
    setSettings({
      ...settings,
                  specialRequestorPrices: [
        ...settings.specialRequestorPrices,
        {
          requestorAnchorId: requestor.id,
          amount: settings.membershipProductionPrice,
        },
      ],
    });
    setRequestorPickerOpen(false);
  };

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      hydratedRef.current = false;
      const res = await apiFetch<CreditSettingsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "GET",
        token,
      });

      if (!res.ok) {
        throw new Error("설정 조회 실패");
      }

      const data = res.data?.data?.creditSettings || CREDIT_SETTINGS_DEFAULTS;
      const normalized = normalizeCreditSettings(data, {
        ...CREDIT_SETTINGS_DEFAULTS,
        specialRequestorPrices: [],
      });

      setSettings(normalized);
      savedSnapshotRef.current = JSON.stringify(normalized);
      hydratedRef.current = true;
    } catch (error) {
      toast({
        title: "설정 조회 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch<CreditPriceRequestorsApiResponse>({
        path: "/api/admin/settings/credits/requestors",
        method: "GET",
        token,
      });
      if (res.ok) {
        setRequestors(res.data?.data?.items || []);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!hydratedRef.current || !token || loading) return;
    const snapshot = JSON.stringify(settings);
    if (snapshot === savedSnapshotRef.current) return;

    const timer = window.setTimeout(async () => {
      const payload = settingsRef.current;
      const payloadSnap = JSON.stringify(payload);
      if (payloadSnap === savedSnapshotRef.current) return;

      try {
        const res = await apiFetch<CreditSettingsApiResponse>({
          path: "/api/admin/settings/credits",
          method: "PATCH",
          token,
          jsonBody: payload,
        });

        if (!res.ok) {
          throw new Error("설정 저장 실패");
        }

        const saved = res.data?.data?.creditSettings;
        const normalized = saved
          ? normalizeCreditSettings(saved, payload)
          : payload;
        savedSnapshotRef.current = JSON.stringify(normalized);

        if (JSON.stringify(settingsRef.current) === payloadSnap) {
          setSettings(normalized);
          savedSnapshotRef.current = JSON.stringify(normalized);
        }
      } catch (error) {
        toast({
          title: "설정 저장 실패",
          description:
            error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
          duration: 3000,
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [settings, token, loading, toast]);

  const expressHelp = `생산 의뢰는 건당, 디자인+생산은 커스텀어벗 수만큼 곱합니다. 기본 ${CREDIT_SETTINGS_DEFAULTS.expressFee.toLocaleString("ko-KR")}원.`;
  const productionHelp = `1어벗당. 멤버십 ${ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE.toLocaleString("ko-KR")}원, 일반 ${ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE.toLocaleString("ko-KR")}원.`;
  const designAndProductionHelp = `1어벗당. 멤버십 ${ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE.toLocaleString("ko-KR")}원, 일반 ${ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE.toLocaleString("ko-KR")}원.`;
  const membershipHelp =
    "치과(의뢰 발신자)만 적용합니다. 기공소에는 적용하지 않으며, 매달 유료 청구됩니다.";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-5">
        <Card className="app-glass-card app-glass-card--lg overflow-hidden">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <SectionHeader
              icon={Gift}
              title="환영 무료 크레딧"
              description="신규 의뢰자에게 지급되는 환영 크레딧입니다."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <AmountField
                id="defaultRequestFreeCredit"
                label="환영 무료크레딧 A"
                icon={Gift}
                value={settings.defaultRequestFreeCredit}
                onChange={(next) =>
                  setSettings({ ...settings, defaultRequestFreeCredit: next })
                }
                disabled={loading}
              />
              <AmountField
                id="defaultShippingFreeCredit"
                label="환영 무료크레딧 B"
                icon={Truck}
                value={settings.defaultShippingFreeCredit}
                onChange={(next) =>
                  setSettings({ ...settings, defaultShippingFreeCredit: next })
                }
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="app-glass-card app-glass-card--lg overflow-hidden">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <SectionHeader
              icon={Package}
              title="의뢰 · 배송"
              description="기본 요금입니다. 특별 공급가가 없으면 이 금액이 적용됩니다."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <DualTierAmountField
                label="생산만"
                icon={Package}
                membershipId="membershipProductionPrice"
                regularId="regularProductionPrice"
                membershipValue={settings.membershipProductionPrice}
                regularValue={settings.regularProductionPrice}
                onMembershipChange={(next) =>
                  setSettings({
                    ...settings,
                    membershipProductionPrice: next,
                    minCreditForRequest: next,
                    designFee: Math.max(
                      0,
                      settings.membershipDesignAndProductionPrice - next,
                    ),
                  })
                }
                onRegularChange={(next) =>
                  setSettings({ ...settings, regularProductionPrice: next })
                }
                disabled={loading}
                help={productionHelp}
              />
              <DualTierAmountField
                label="디자인+생산"
                icon={PenLine}
                membershipId="membershipDesignAndProductionPrice"
                regularId="regularDesignAndProductionPrice"
                membershipValue={settings.membershipDesignAndProductionPrice}
                regularValue={settings.regularDesignAndProductionPrice}
                onMembershipChange={(next) =>
                  setSettings({
                    ...settings,
                    membershipDesignAndProductionPrice: next,
                    designFee: Math.max(
                      0,
                      next - settings.membershipProductionPrice,
                    ),
                  })
                }
                onRegularChange={(next) =>
                  setSettings({
                    ...settings,
                    regularDesignAndProductionPrice: next,
                  })
                }
                disabled={loading}
                help={designAndProductionHelp}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AmountField
                id="practiceMembershipMonthlyFee"
                label="치과 멤버십 구독료"
                icon={Crown}
                value={settings.practiceMembershipMonthlyFee}
                onChange={(next) =>
                  setSettings({ ...settings, practiceMembershipMonthlyFee: next })
                }
                disabled={loading}
                help={membershipHelp}
              />
              <AmountField
                id="shippingFee"
                label="배송비"
                icon={Truck}
                value={settings.shippingFee}
                onChange={(next) =>
                  setSettings({ ...settings, shippingFee: next })
                }
                disabled={loading}
                help="박스단위 별도"
              />
              <AmountField
                id="expressFee"
                label="신속 배송비"
                icon={Zap}
                value={settings.expressFee}
                onChange={(next) =>
                  setSettings({ ...settings, expressFee: next })
                }
                disabled={loading}
                help={expressHelp}
              />
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-900">
                    특별 공급가
                  </h4>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    의뢰자를 검색해 추가한 뒤 커스텀어벗 가격을 입력하세요.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
                  {settings.specialRequestorPrices.length}곳
                </span>
              </div>

              <div className="space-y-3">
                {settings.specialRequestorPrices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-8 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
                      <Search className="h-4 w-4 text-slate-400" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      지정된 의뢰자가 없습니다
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      아래에서 검색해 특별 가격을 추가하세요.
                    </p>
                  </div>
                ) : (
                  settings.specialRequestorPrices.map((item) => {
                    const requestor = requestorById.get(item.requestorAnchorId);
                    const kindLabel =
                      requestor?.requestorKind === "practice" ||
                      requestor?.requestorKind === "lab"
                        ? REQUESTOR_CAPABILITY_LABEL[requestor.requestorKind]
                        : null;
                    return (
                      <div
                        key={item.requestorAnchorId}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {requestor?.name || "삭제된 의뢰자"}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[
                              kindLabel,
                              requestor?.representativeName
                                ? `대표 ${requestor.representativeName}`
                                : "",
                              requestor?.businessNumber || "",
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </div>
                        <div className="w-36">
                          <Label
                            htmlFor={`special-price-${item.requestorAnchorId}`}
                            className="sr-only"
                          >
                            커스텀어벗 가격
                          </Label>
                          <div className="relative">
                            <Input
                              id={`special-price-${item.requestorAnchorId}`}
                              type="number"
                              min="0"
                              className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
                              value={item.amount}
                              disabled={loading}
                              onChange={(event) => {
                                const amount = Math.max(
                                  0,
                                  Number(event.target.value),
                                );
                                setSettings({
                                  ...settings,
                                  specialRequestorPrices:
                                    settings.specialRequestorPrices.map(
                                      (price) =>
                                        price.requestorAnchorId ===
                                        item.requestorAnchorId
                                          ? { ...price, amount }
                                          : price,
                                    ),
                                });
                              }}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                              원
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          disabled={loading}
                          aria-label={`${requestor?.name || "의뢰자"} 특별 공급가 삭제`}
                          onClick={() =>
                            setSettings({
                              ...settings,
                              specialRequestorPrices:
                                settings.specialRequestorPrices.filter(
                                  (price) =>
                                    price.requestorAnchorId !==
                                    item.requestorAnchorId,
                                ),
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}

                <Popover
                  open={requestorPickerOpen}
                  onOpenChange={setRequestorPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={requestorPickerOpen}
                      disabled={loading}
                      className="h-11 w-full justify-between rounded-xl border-slate-200 bg-white hover:bg-slate-50 sm:max-w-md"
                    >
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Plus className="h-4 w-4" />
                        의뢰자 검색 후 추가…
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(28rem,calc(100vw-2rem))] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="사업자명·대표자·사업자번호 검색" />
                      <CommandList>
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {availableRequestors.map((requestor) => {
                            const meta = [
                              requestor.requestorKind === "practice" ||
                              requestor.requestorKind === "lab"
                                ? REQUESTOR_CAPABILITY_LABEL[
                                    requestor.requestorKind
                                  ]
                                : "",
                              requestor.representativeName
                                ? `대표 ${requestor.representativeName}`
                                : "",
                              requestor.businessNumber || "",
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            const searchValue = [
                              requestor.name,
                              requestor.representativeName,
                              requestor.businessNumber,
                              requestor.address,
                              requestor.id,
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <CommandItem
                                key={requestor.id}
                                value={searchValue}
                                onSelect={() => addSpecialRequestor(requestor)}
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm">
                                    {getRequestorLabel(requestor)}
                                  </div>
                                  {meta ? (
                                    <div className="truncate text-xs text-muted-foreground">
                                      {meta}
                                    </div>
                                  ) : null}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};
