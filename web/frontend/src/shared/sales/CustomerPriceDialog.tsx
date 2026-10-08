// related files:
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// change-log:
// - 2026-10-09: 선택 카드의 건당 판매가 입력을 더 크게.
// - 2026-10-09: 상단 판매가 카드 제거. 선택한 거래처 카드에서 건당 판매가를 입력한다.
// - 2026-10-08: 거래처 판매가 설정은 거래처 페이지. 대시보드·성과에서는 뺀다.
// - 2026-10-08: 딜러·영업팀 거래처별 의뢰비 설정(1.2~1.5만). 거래처 본인에게만 보이고 외부 비공개.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export type CustomerPriceRow = {
  anchorId: string;
  name: string;
  requestorKind: "practice" | "lab" | null;
  unitPrice: number;
  isCustom: boolean;
  approvalStatus?: "approved" | "pending" | "rejected";
  requestedPrice?: number | null;
  rejectReason?: string;
  representativeName?: string;
  phone?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  usesOralScan?: boolean;
  updatedAt?: string | null;
};

type Row = CustomerPriceRow;

const KIND_LABEL: Record<string, string> = { practice: "치과", lab: "기공소" };

function CustomerPriceLead() {
  return (
    <>
      {formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}~
      {formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원 안에서 정합니다.
      <br />
      거래처 본인에게만 보이고 외부에는 공개되지 않습니다.
    </>
  );
}

export function useCustomerPrices(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id || "");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["salesman-customer-prices", userId],
    enabled: Boolean(enabled && token && userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const res = await request<any>({
        path: "/api/salesman/customer-prices",
        method: "GET",
        token,
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "거래처를 불러오지 못했습니다.");
      }
      return (body.data?.items || []) as Row[];
    },
  });

  const patch = (next: Row) => {
    queryClient.setQueryData<Row[]>(
      ["salesman-customer-prices", userId],
      (prev) =>
        (prev || []).map((r) => (r.anchorId === next.anchorId ? next : r)),
    );
  };

  const loadError =
    query.error instanceof Error
      ? query.error.message
      : query.isError
        ? "다시 시도해주세요."
        : "";

  return {
    rows: query.isError ? [] : query.data === undefined ? null : query.data,
    loadError,
    patch,
  };
}

function CustomerPriceRows({
  rows,
  loadError,
  onSaved,
  wide = false,
}: {
  rows: Row[] | null;
  loadError: string;
  onSaved: (next: Row) => void;
  wide?: boolean;
}) {
  if (rows === null) {
    return <p className="text-sm text-slate-500">불러오는 중…</p>;
  }
  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">소개한 거래처가 없습니다.</p>;
  }
  return (
    <div
      className={
        wide
          ? "grid gap-2 px-1.5 py-1.5 lg:grid-cols-2"
          : "space-y-2 px-1.5 py-1.5"
      }
    >
      {rows.map((row) => (
        <PriceRow key={row.anchorId} row={row} onSaved={onSaved} />
      ))}
    </div>
  );
}

function useCustomerPriceDraft(row: Row, onSaved: (next: Row) => void) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [value, setValue] = useState(String(row.unitPrice));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(row.unitPrice));
    setError("");
  }, [row.anchorId, row.unitPrice]);

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

  return {
    value,
    setValue,
    error,
    setError,
    saving,
    dirty,
    checkedPrice,
    save,
    commission: dealerCommissionOf(checkedPrice ?? row.unitPrice),
  };
}

function PriceStatus({ row }: { row: Row }) {
  if (row.approvalStatus === "pending") {
    return (
      <p className="text-xs text-amber-700">
        승인 대기 {formatRequestorWon(row.requestedPrice ?? 0)}원입니다.
        <br />
        승인 전에는 의뢰할 수 없습니다.
      </p>
    );
  }
  if (row.approvalStatus === "rejected") {
    return (
      <p className="text-xs text-destructive">
        반려되었습니다.
        {row.rejectReason ? (
          <>
            <br />
            {row.rejectReason}
          </>
        ) : null}
      </p>
    );
  }
  return null;
}

function PriceControls({
  row,
  onSaved,
  label,
  prominent,
}: {
  row: Row;
  onSaved: (next: Row) => void;
  label: string;
  prominent?: boolean;
}) {
  const draft = useCustomerPriceDraft(row, onSaved);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="space-y-1">
          <Input
            inputMode="numeric"
            value={draft.value}
            onChange={(e) => {
              draft.setValue(e.target.value);
              const next = validateDealerUnitPrice(e.target.value);
              draft.setError("message" in next ? next.message : "");
            }}
            className={
              prominent
                ? "h-11 w-36 rounded-xl bg-white text-right text-base font-semibold tabular-nums"
                : "h-9 w-28 text-right tabular-nums"
            }
            aria-invalid={Boolean(draft.error)}
            aria-label={label}
          />
          {draft.error ? (
            <p className="max-w-[12rem] text-[11px] leading-tight text-destructive">
              {draft.error}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className={prominent ? "h-11 rounded-xl px-4" : "h-9"}
          disabled={!draft.dirty || draft.saving}
          onClick={() =>
            draft.checkedPrice != null && void draft.save(draft.checkedPrice)
          }
        >
          저장
        </Button>
        {row.isCustom ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={prominent ? "h-11 rounded-xl" : "h-9"}
            disabled={draft.saving}
            onClick={() => void draft.save(null)}
          >
            기본가
          </Button>
        ) : null}
      </div>
      <p
        className={
          prominent
            ? "inline-flex rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-white"
            : "text-xs tabular-nums text-slate-500"
        }
      >
        수수료 {formatRequestorWon(draft.commission)}원
      </p>
      <PriceStatus row={row} />
    </div>
  );
}

/** 선택한 거래처 카드. 미설정이면 기본가 15,000원. */
export function CustomerPriceFields({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: (next: Row) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold tracking-tight text-slate-900">
        판매가격
      </div>
      <PriceControls
        row={row}
        onSaved={onSaved}
        label="판매가격"
        prominent
      />
      <p className="text-xs leading-relaxed text-slate-500">
        {formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}~
        {formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원입니다.
        <br />
        배송비는 딜러 부담입니다.
      </p>
    </div>
  );
}

function PriceRow({ row, onSaved }: { row: Row; onSaved: (next: Row) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
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
      <PriceControls
        row={row}
        onSaved={onSaved}
        label={`${row.name} 건당 의뢰비`}
      />
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
  const { rows, loadError, patch } = useCustomerPrices(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GUIDE_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            거래처 판매가
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            <CustomerPriceLead />
          </DialogDescription>
        </DialogHeader>
        <div className={GUIDE_DIALOG_BODY_CLASS}>
          <CustomerPriceRows
            rows={rows}
            loadError={loadError}
            onSaved={patch}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
