import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

type Item = {
  _id: string;
  role: string;
  amount: number;
  supplyAmount?: number | null;
  vatAmount?: number | null;
  status: string;
  payoutAccount?: { bankName?: string; accountNumber?: string; holderName?: string };
  businessAnchorId?: { name?: string };
  invoiceDraftId?: { _id?: string; status?: string } | null;
};
type Batch = {
  _id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  items?: Item[];
};

const money = (amount: number) => `₩${Number(amount || 0).toLocaleString("ko-KR")}`;
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(
    new Date(value),
  );

export default function AdminSettlementBatches() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await request<{ success?: boolean; data?: Batch[] }>({
      path: "/api/admin/settlement-batches",
      method: "GET",
      token,
    });
    if (res.ok) setBatches(res.data?.data || []);
  }, [token]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      const res = await request<{ success?: boolean; data?: Batch }>({
        path: `/api/admin/settlement-batches/${id}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data) setSelected(res.data.data);
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const action = async (path: string, message: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{ success?: boolean; message?: string }>({
        path,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.message || "처리 실패");
      toast({ title: message });
      await load();
      if (selected) await loadDetail(selected._id);
    } catch (error) {
      toast({
        title: "처리 실패",
        description: error instanceof Error ? error.message : "처리 실패",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">월 정산 배치</h1>
          <p className="text-sm text-muted-foreground">
            확정 후 실제 송금을 완료한 항목만 지급완료 처리합니다. 과세 관계사(제조사·딜러사·개발운영사) 금액은 VAT 포함 입금합계입니다.
          </p>
        </div>
        <Button onClick={() => void action("/api/admin/settlement-batches", "정산 배치를 생성했습니다.")} disabled={loading}>
          새 배치 생성
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">배치 목록</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {batches.map((batch) => (
              <button
                key={batch._id}
                className="w-full rounded-md border p-3 text-left hover:bg-muted"
                onClick={() => void loadDetail(batch._id)}
              >
                <div className="flex justify-between gap-2">
                  <span>{date(batch.periodStart)} ~ {date(batch.periodEnd)}</span>
                  <Badge variant="outline">{batch.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {money(batch.totalAmount)} · {batch.itemCount}건
                </div>
              </button>
            ))}
            {!batches.length && <p className="text-sm text-muted-foreground">생성된 배치가 없습니다.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">배치 상세</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!selected && <p className="text-sm text-muted-foreground">배치를 선택하세요.</p>}
            {selected && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selected.status}</Badge>
                  {selected.status === "DRAFT" && (
                    <Button size="sm" disabled={loading} onClick={() => void action(`/api/admin/settlement-batches/${selected._id}/confirm`, "정산 배치를 확정했습니다.")}>확정</Button>
                  )}
                  {selected.status === "CONFIRMED" && (
                    <Button size="sm" disabled={loading} onClick={() => void action(`/api/admin/settlement-batches/${selected._id}/mark-all-paid`, "모든 확정 항목을 지급완료 처리했습니다.")}>송금 완료 일괄처리</Button>
                  )}
                  {["DRAFT", "CONFIRMED"].includes(selected.status) && (
                    <Button size="sm" variant="outline" disabled={loading} onClick={() => void action(`/api/admin/settlement-batches/${selected._id}/cancel`, "정산 배치를 취소했습니다.")}>취소</Button>
                  )}
                </div>
                <div className="space-y-2">
                  {selected.items?.map((item) => (
                    <div key={item._id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>{item.businessAnchorId?.name || item.role} · {item.role}</span>
                        <span className="font-medium text-right">
                          {money(item.amount)}
                          {Number(item.vatAmount || 0) > 0 && (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              공급 {money(Number(item.supplyAmount ?? 0))} + VAT{" "}
                              {money(Number(item.vatAmount || 0))}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {item.status} · {item.payoutAccount?.bankName || "계좌 미등록"} {item.payoutAccount?.holderName || ""}
                        {item.invoiceDraftId && " · 세금계산서 초안 연결됨"}
                      </div>
                      {item.status === "CONFIRMED" && (
                        <Button className="mt-2" size="sm" disabled={loading} onClick={() => void action(`/api/admin/settlement-batches/${selected._id}/items/${item._id}/mark-paid`, "지급완료 처리했습니다.")}>
                          실제 송금 후 지급완료
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
