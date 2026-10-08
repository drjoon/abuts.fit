// related files:
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// change-log:
// - 2026-10-08: 딜러·영업팀 거래처별 의뢰비 설정(1.2~1.5만). 거래처 본인에게만 보이고 외부 비공개.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  GUIDE_DIALOG_BODY_CLASS,
  GUIDE_DIALOG_CONTENT_CLASS,
  GUIDE_DIALOG_HEADER_CLASS,
} from "@/shared/settlement/settlementUi";
import {
  REQUESTOR_UNIT_PRICE_BASE,
  REQUESTOR_UNIT_PRICE_MIN,
  dealerCommissionOf,
  formatRequestorWon,
  validateDealerUnitPrice,
} from "@/shared/pricing/requestorUnitPricePolicy";

type Row = {
  anchorId: string;
  name: string;
  requestorKind: "practice" | "lab" | null;
  unitPrice: number;
  isCustom: boolean;
  approvalStatus?: "approved" | "pending" | "rejected";
  requestedPrice?: number | null;
  rejectReason?: string;
};

const KIND_LABEL: Record<string, string> = { practice: "치과", lab: "기공소" };

function PriceRow({ row, onSaved }: { row: Row; onSaved: (next: Row) => void }) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [value, setValue] = useState(String(row.unitPrice));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(row.unitPrice));
    setError("");
  }, [row.unitPrice]);

  const checked = validateDealerUnitPrice(value);
  const checkedPrice = "price" in checked ? checked.price : null;
  const dirty = checkedPrice != null && checkedPrice !== row.unitPrice;

  const save = async (unitPrice: number | null) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await request<any>({
        path: `/api/salesman/customer-prices/${encodeURIComponent(row.anchorId)}`,
        method: "PUT",
        token,
        jsonBody: { unitPrice },
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "저장에 실패했습니다.");
      }
      onSaved({
        ...row,
        unitPrice:
          body.data?.approvalStatus === "pending"
            ? row.unitPrice
            : Number(body.data?.unitPrice ?? REQUESTOR_UNIT_PRICE_BASE),
        isCustom: Boolean(body.data?.isCustom),
        approvalStatus: body.data?.approvalStatus || "approved",
        requestedPrice: body.data?.requestedPrice ?? null,
        rejectReason: "",
      });
      toast({
        title:
          body.data?.approvalStatus === "pending"
            ? "본사 승인을 요청했습니다."
            : "거래처 가격을 저장했습니다.",
        duration: 2000,
      });
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {row.name || "이름 없음"}
          </span>
          {row.requestorKind ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {KIND_LABEL[row.requestorKind]}
            </Badge>
          ) : null}
        </div>
        <div className="text-xs tabular-nums text-slate-500">
          수수료 {formatRequestorWon(dealerCommissionOf(checkedPrice ?? row.unitPrice))}원
        </div>
        {row.approvalStatus === "pending" ? (
          <div className="text-xs text-amber-700">
            승인 대기 {formatRequestorWon(row.requestedPrice ?? 0)}원 · 승인 전에는 의뢰할 수 없습니다.
          </div>
        ) : null}
        {row.approvalStatus === "rejected" ? (
          <div className="text-xs text-destructive">
            반려됨{row.rejectReason ? ` · ${row.rejectReason}` : ""}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-2">
        <div className="space-y-1">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              const next = validateDealerUnitPrice(e.target.value);
              setError("message" in next ? next.message : "");
            }}
            className="h-9 w-28 text-right tabular-nums"
            aria-invalid={Boolean(error)}
            aria-label={`${row.name} 건당 의뢰비`}
          />
          {error ? (
            <p className="max-w-[12rem] text-[11px] leading-tight text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={!dirty || saving}
          onClick={() => checkedPrice != null && void save(checkedPrice)}
        >
          저장
        </Button>
        {row.isCustom ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9"
            disabled={saving}
            onClick={() => void save(null)}
          >
            기본가
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerPriceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await request<any>({
        path: "/api/salesman/customer-prices",
        method: "GET",
        token,
        skipCache: true,
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "거래처를 불러오지 못했습니다.");
      }
      setRows((body.data?.items || []) as Row[]);
    } catch (e: any) {
      setLoadError(e?.message || "다시 시도해주세요.");
      setRows([]);
    }
  }, [token]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GUIDE_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            거래처별 의뢰비
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}~
            {formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원 안에서 정합니다.
            <br />
            거래처 본인에게만 보이고 외부에는 공개되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <div className={GUIDE_DIALOG_BODY_CLASS}>
          {rows === null ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">소개한 거래처가 없습니다.</p>
          ) : (
            <div className="space-y-2 px-1.5 py-1.5">
              {rows.map((row) => (
                <PriceRow
                  key={row.anchorId}
                  row={row}
                  onSaved={(next) =>
                    setRows((prev) =>
                      (prev || []).map((r) =>
                        r.anchorId === next.anchorId ? next : r,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
