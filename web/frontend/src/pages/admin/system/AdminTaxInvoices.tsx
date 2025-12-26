import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { FileText } from "lucide-react";

type DraftStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

type TaxInvoiceDraft = {
  _id: string;
  chargeOrderId: string;
  organizationId: string;
  status: DraftStatus;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  buyer?: {
    bizNo?: string;
    corpName?: string;
    ceoName?: string;
    addr?: string;
    bizType?: string;
    bizClass?: string;
    contactName?: string;
    contactEmail?: string;
    contactTel?: string;
  };
  failReason?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function statusBadge(status: DraftStatus) {
  switch (status) {
    case "PENDING_APPROVAL":
      return <Badge>승인대기</Badge>;
    case "APPROVED":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          승인
        </Badge>
      );
    case "SENT":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          전송완료
        </Badge>
      );
    case "FAILED":
      return <Badge variant="destructive">실패</Badge>;
    case "REJECTED":
      return <Badge variant="secondary">반려</Badge>;
    case "CANCELLED":
      return <Badge variant="outline">취소</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtMoney(n: number) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("ko-KR");
}

export const AdminTaxInvoices = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [status, setStatus] = useState<DraftStatus>("PENDING_APPROVAL");
  const [items, setItems] = useState<TaxInvoiceDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const statusTabs = useMemo(
    () =>
      [
        "PENDING_APPROVAL",
        "APPROVED",
        "SENT",
        "FAILED",
        "REJECTED",
        "CANCELLED",
      ] as DraftStatus[],
    []
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      const res = await request<any>({
        path: `/api/admin/tax-invoices/drafts?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "세금계산서 목록 조회 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      const body: any = res.data || {};
      const data = body.data || body;
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast({
        title: "세금계산서 목록 조회 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [status, toast, token]);

  useEffect(() => {
    load();
  }, [load]);

  const postAction = useCallback(
    async ({
      id,
      action,
      body,
    }: {
      id: string;
      action: string;
      body?: any;
    }) => {
      if (!token) return;
      setActionLoadingId(id);
      try {
        const res = await request<any>({
          path: `/api/admin/tax-invoices/drafts/${id}/${action}`,
          method: "POST",
          token,
          jsonBody: body,
        });
        if (!res.ok) {
          toast({
            title: "처리 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
            duration: 5000,
          });
          return;
        }
        await load();
      } catch {
        toast({
          title: "처리 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [load, toast, token]
  );

  const openReject = (id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const submitReject = async () => {
    if (!rejectTargetId) return;
    await postAction({
      id: rejectTargetId,
      action: "reject",
      body: { reason: rejectReason },
    });
    setRejectOpen(false);
    setRejectTargetId(null);
    setRejectReason("");
  };

  return (
    <div className="p-4 space-y-4">
      <Tabs
        value={status}
        onValueChange={(v: string) => setStatus(v as DraftStatus)}
      >
        <TabsList className="flex flex-wrap">
          {statusTabs.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s === "PENDING_APPROVAL" && "승인대기"}
              {s === "APPROVED" && "승인"}
              {s === "SENT" && "전송완료"}
              {s === "FAILED" && "실패"}
              {s === "REJECTED" && "반려"}
              {s === "CANCELLED" && "취소"}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {loading && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              불러오는 중...
            </CardContent>
          </Card>
        )}

        {!loading && items.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              데이터가 없습니다.
            </CardContent>
          </Card>
        )}

        {!loading &&
          items.map((d) => {
            const canEdit = d.status !== "SENT";
            const isActionLoading = actionLoadingId === d._id;
            return (
              <Card key={d._id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(d.status)}
                        <span className="text-xs text-muted-foreground truncate">
                          {d._id}
                        </span>
                      </div>
                      <div className="text-sm font-medium truncate">
                        {d.buyer?.corpName || "(매입처 미기재)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {d.buyer?.bizNo ? `사업자번호: ${d.buyer.bizNo}` : ""}
                      </div>
                      {d.failReason ? (
                        <div className="text-xs text-destructive truncate">
                          {d.failReason}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {fmtMoney(d.totalAmount)}원
                      </div>
                      <div className="text-xs text-muted-foreground">
                        공급가 {fmtMoney(d.supplyAmount)} / VAT{" "}
                        {fmtMoney(d.vatAmount)}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap gap-2 justify-end">
                      {d.status === "PENDING_APPROVAL" && (
                        <>
                          <Button
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() =>
                              postAction({ id: d._id, action: "approve" })
                            }
                          >
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isActionLoading}
                            onClick={() => openReject(d._id)}
                          >
                            반려
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isActionLoading}
                            onClick={() =>
                              postAction({ id: d._id, action: "cancel" })
                            }
                          >
                            취소
                          </Button>
                        </>
                      )}

                      {d.status === "APPROVED" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isActionLoading}
                            onClick={() => openReject(d._id)}
                          >
                            승인 취소(반려)
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isActionLoading}
                            onClick={() =>
                              postAction({ id: d._id, action: "cancel" })
                            }
                          >
                            취소
                          </Button>
                        </>
                      )}

                      {d.status === "FAILED" && (
                        <>
                          <Button
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() =>
                              postAction({ id: d._id, action: "approve" })
                            }
                          >
                            재승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isActionLoading}
                            onClick={() =>
                              postAction({ id: d._id, action: "cancel" })
                            }
                          >
                            취소
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반려 사유</DialogTitle>
          </DialogHeader>
          <Input
            value={rejectReason}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setRejectReason(e.target.value)
            }
            placeholder="반려 사유를 입력하세요"
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setRejectOpen(false);
                setRejectTargetId(null);
                setRejectReason("");
              }}
            >
              취소
            </Button>
            <Button onClick={submitReject}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTaxInvoices;
