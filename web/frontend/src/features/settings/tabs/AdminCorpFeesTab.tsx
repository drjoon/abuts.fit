// change-log:
// - 2026-10-15: 제품 단위는 어벗츠 기공수가 항목 표시 + 50% 올림 제안가. 금액은 부가세 포함.
// - 2026-10-15: 법인→어벗츠기공소 정액 청구 단가 설정(플랫폼 사용료·CNC 장비 대여료·제품 단위 단가).
// related files:
// - web/backend/controllers/admin/adminCorpPlatformFee.controller.js
// - web/backend/services/corpPlatformFee.service.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
//
// 금액은 부가세 포함. 법인·기공소 협의로 언제든 바꾼다. 정률 입력은 없다.
// 저장 버튼으로 반영하고, 변경 이력은 서버가 보관한다.
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  type LabFeeItemUnit,
} from "@/shared/practice/labFeeSchedule";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";

type ProductUnitFee = {
  key: string;
  label: string;
  unit?: string;
  abutsPrice: number;
  suggestedPrice: number;
  /** null = 미결정 */
  unitPrice: number | null;
};

type CorpFeeHistoryEntry = {
  at?: string;
  by?: string;
  platformUsageMonthlyFee?: number;
  cncRentalMonthlyFee?: number;
  note?: string;
};

type CorpPlatformFees = {
  platformUsageMonthlyFee: number;
  cncRentalMonthlyFee: number;
  productUnitFees: ProductUnitFee[];
  note: string;
  updatedAt?: string | null;
  updatedBy?: string;
  history?: CorpFeeHistoryEntry[];
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  data?: { corpPlatformFees?: CorpPlatformFees };
};

const toWon = (value: string | number) =>
  Math.max(0, Math.round(Number(value) || 0));

const fmtWon = (n: number) => `${toWon(n).toLocaleString("ko-KR")}원`;

const fmtDate = (iso?: string | null) => {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
};

export const AdminCorpFeesTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [usageFee, setUsageFee] = useState("0");
  const [cncFee, setCncFee] = useState("0");
  const [products, setProducts] = useState<ProductUnitFee[]>([]);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<CorpPlatformFees | null>(null);

  const hydrate = useCallback((fees: CorpPlatformFees) => {
    setSaved(fees);
    setUsageFee(String(toWon(fees.platformUsageMonthlyFee)));
    setCncFee(String(toWon(fees.cncRentalMonthlyFee)));
    setProducts(
      (fees.productUnitFees || []).map((p) => ({
        ...p,
        unitPrice: p.unitPrice == null ? null : toWon(p.unitPrice),
      })),
    );
    setNote(fees.note || "");
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch<ApiResponse>({
          path: "/api/admin/settings/corp-fees",
          method: "GET",
          token,
          skipCache: true,
        });
        const fees = res.data?.data?.corpPlatformFees;
        if (!mounted || !res.ok || !fees) return;
        hydrate(fees);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token, hydrate]);

  const updateProduct = (index: number, patch: Partial<ProductUnitFee>) => {
    setProducts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await apiFetch<ApiResponse>({
        path: "/api/admin/settings/corp-fees",
        method: "PATCH",
        token,
        jsonBody: {
          platformUsageMonthlyFee: toWon(usageFee),
          cncRentalMonthlyFee: toWon(cncFee),
          productUnitFees: products
            .filter((p) => p.unitPrice != null)
            .map((p) => ({
              key: p.key,
              label: p.label,
              unitPrice: toWon(p.unitPrice ?? 0),
            })),
          note,
        },
      });
      const fees = res.data?.data?.corpPlatformFees;
      if (!res.ok || !fees) {
        toast({
          title: "저장 실패",
          description: res.data?.message || "저장에 실패했습니다.",
          variant: "destructive",
        });
        return;
      }
      hydrate(fees);
      toast({ title: "저장했습니다." });
    } catch {
      toast({
        title: "저장 실패",
        description: "저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsCardSkeleton />;

  const history = [...(saved?.history || [])].reverse().slice(0, 10);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">월 정액</CardTitle>
          <p className="text-[12px] leading-snug text-muted-foreground">
            기공사업은 어벗츠 주식회사 기공사업부입니다.
            <br />
            개인 기공소에 청구하지 않으며, 이 단가는 정산·계산서에 쓰이지 않습니다.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="corp-usage-fee">플랫폼 사용료 (월, VAT 포함)</Label>
            <Input
              id="corp-usage-fee"
              type="number"
              min={0}
              step={1000}
              value={usageFee}
              onChange={(e) => setUsageFee(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corp-cnc-fee">CNC 장비 대여료 (월, VAT 포함)</Label>
            <Input
              id="corp-cnc-fee"
              type="number"
              min={0}
              step={1000}
              value={cncFee}
              onChange={(e) => setCncFee(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">제품 단위 단가</CardTitle>
          <p className="text-[12px] leading-snug text-muted-foreground">
            어벗츠기공소 기공수가 항목입니다.
            <br />
            제안가는 어벗츠 금액의 50%를 1,000원 단위로 올림한 값입니다.
            <br />
            금액은 부가세 포함이며, 저장해야 확정됩니다.
          </p>
          {products.length > 0 ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setProducts((prev) =>
                    prev.map((p) =>
                      p.unitPrice == null
                        ? { ...p, unitPrice: p.suggestedPrice }
                        : p,
                    ),
                  )
                }
              >
                미결정 항목에 제안가 채우기
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              적용 중인 기공수가 항목이 없습니다.
            </p>
          ) : null}
          {products.map((row, index) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.label}</p>
                <p className="text-[12px] text-muted-foreground">
                  {LAB_FEE_ITEM_UNIT_LABELS[row.unit as LabFeeItemUnit] ||
                    row.unit ||
                    ""}{" "}
                  · 어벗츠 {fmtWon(row.abutsPrice)} · 제안 {fmtWon(row.suggestedPrice)}
                </p>
              </div>
              <Input
                type="number"
                min={0}
                step={1000}
                value={row.unitPrice ?? ""}
                placeholder="미결정"
                onChange={(e) =>
                  updateProduct(index, {
                    unitPrice:
                      e.target.value === "" ? null : toWon(e.target.value),
                  })
                }
                aria-label={`${row.label} 단가`}
                className="w-32 tabular-nums"
              />
              <span className="text-sm text-slate-500">원</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateProduct(index, { unitPrice: row.suggestedPrice })
                }
              >
                제안가
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">협의 메모</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="협의 일자·참석자 등"
            maxLength={500}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              마지막 저장 {fmtDate(saved?.updatedAt)}
              {saved?.updatedBy ? ` · ${saved.updatedBy}` : ""}
            </p>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">변경 이력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-4 py-3">
            {history.map((h, i) => (
              <p
                key={`${h.at}-${i}`}
                className="text-[12px] leading-snug text-muted-foreground"
              >
                {fmtDate(h.at)} · {h.by || "-"} · 사용료{" "}
                {fmtWon(h.platformUsageMonthlyFee || 0)} / 장비{" "}
                {fmtWon(h.cncRentalMonthlyFee || 0)}
                {h.note ? ` · ${h.note}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
