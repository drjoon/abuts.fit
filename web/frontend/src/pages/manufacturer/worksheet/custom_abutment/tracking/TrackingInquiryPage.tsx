import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { DeliveryInfoSummary, RequestBase } from "@/types/request";

type InquiryTab = "process" | "lot" | "shipping";
type DateRange =
  | "recent7"
  | "recent30"
  | "lastMonth"
  | "thisMonth"
  | "recent90"
  | "all";

type ManufacturerRequest = RequestBase;

type ProcessStage = "전체" | "의뢰" | "CAM" | "생산" | "발송" | "추적관리";

const getStage = (req: ManufacturerRequest): ProcessStage | "" => {
  const s = String(req.manufacturerStage || "").trim();
  if (s === "의뢰") return "의뢰";
  if (s === "CAM") return "CAM";
  if (s === "생산") return "생산";
  if (s === "발송") return "발송";
  if (s === "추적관리") return "추적관리";
  return "";
};

const isDone = (req: ManufacturerRequest) => {
  const status = String(req.status || "").trim();
  const status2 = String((req as any).status2 || "").trim();
  const di = (req.deliveryInfoRef || null) as any;
  const deliveredAt = di?.deliveredAt ? new Date(di.deliveredAt) : null;
  const shippedAt = di?.shippedAt ? new Date(di.shippedAt) : null;
  return (
    status === "완료" || status2 === "완료" || Boolean(deliveredAt || shippedAt)
  );
};

const normalizeDeliveryInfo = (ref?: string | DeliveryInfoSummary) => {
  if (!ref || typeof ref === "string") return {} as DeliveryInfoSummary;
  return ref;
};

const formatDateTime = (d?: string) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ko-KR");
};

export const TrackingInquiryPage = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();

  const [tab, setTab] = useState<InquiryTab>("process");
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [stageFilter, setStageFilter] = useState<ProcessStage>("전체");
  const [dateRange, setDateRange] = useState<DateRange>("recent30");

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/requests/all?limit=500", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "의뢰 목록 조회에 실패했습니다.");
        }
        const list = Array.isArray(body?.data?.requests)
          ? body.data.requests
          : [];
        setRequests(list);
      } catch (e: any) {
        toast({
          title: "조회 실패",
          description: e?.message || "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [token, toast]);

  const searchLower = String(worksheetSearch || "")
    .trim()
    .toLowerCase();

  const { fromDate, toDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfDay = (d: Date) => {
      const c = new Date(d);
      c.setHours(0, 0, 0, 0);
      return c;
    };
    const endOfDay = (d: Date) => {
      const c = new Date(d);
      c.setHours(23, 59, 59, 999);
      return c;
    };

    switch (dateRange) {
      case "recent7": {
        const from = new Date(today);
        from.setDate(from.getDate() - 6);
        return { fromDate: startOfDay(from), toDate: endOfDay(today) };
      }
      case "recent30": {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        return { fromDate: startOfDay(from), toDate: endOfDay(today) };
      }
      case "recent90": {
        const from = new Date(today);
        from.setDate(from.getDate() - 89);
        return { fromDate: startOfDay(from), toDate: endOfDay(today) };
      }
      case "lastMonth": {
        const year = today.getFullYear();
        const month = today.getMonth(); // 0-based, this month
        const from = new Date(year, month - 1, 1);
        const to = new Date(year, month, 0); // last day of previous month
        return { fromDate: startOfDay(from), toDate: endOfDay(to) };
      }
      case "thisMonth": {
        const year = today.getFullYear();
        const month = today.getMonth();
        const from = new Date(year, month, 1);
        const to = new Date(year, month + 1, 0); // last day of this month
        return { fromDate: startOfDay(from), toDate: endOfDay(to) };
      }
      case "all":
      default:
        return { fromDate: null, toDate: null };
    }
  }, [dateRange]);

  const baseFiltered = useMemo(() => {
    return requests
      .filter((r) => (showCompleted ? true : !isDone(r)))
      .filter((r) => {
        if (!fromDate && !toDate) return true;
        if (!r.createdAt) return false;
        const t = new Date(r.createdAt);
        if (Number.isNaN(t.getTime())) return false;
        if (fromDate && t < fromDate) return false;
        if (toDate && t > toDate) return false;
        return true;
      })
      .filter((r) => {
        if (!searchLower) return true;

        const ci: any = r.caseInfos || {};
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const hay = (
          String(r.requestId || "") +
          String(r.assignedMachine || "") +
          String(r.lotNumber || "") +
          String(r.rawMaterialHeatNo || "") +
          String(r.finishedLotNumber || "") +
          String(ci.clinicName || "") +
          String(ci.patientName || "") +
          String(ci.tooth || "") +
          String(ci.workType || "") +
          String(di.trackingNumber || "") +
          String(di.carrier || "")
        ).toLowerCase();
        return hay.includes(searchLower);
      });
  }, [requests, searchLower, showCompleted, fromDate, toDate]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      의뢰: 0,
      CAM: 0,
      생산: 0,
      발송: 0,
      추적관리: 0,
      기타: 0,
    };
    for (const r of baseFiltered) {
      const s = getStage(r);
      if (!s) counts.기타 += 1;
      else counts[s] += 1;
    }
    return counts;
  }, [baseFiltered]);

  const handlePrintLot = () => {
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;
    const rowsHtml = lotRows
      .map((r) => {
        const ci: any = r.caseInfos || {};
        return `<tr>
          <td>${r.requestId || ""}</td>
          <td>${r.rawMaterialHeatNo || ""}</td>
          <td>${r.lotNumber || ""}</td>
          <td>${r.finishedLotNumber || ""}</td>
          <td>${ci.patientName || ""}</td>
          <td>${ci.tooth || ""}</td>
          <td>${getStage(r) || ""}</td>
        </tr>`;
      })
      .join("");
    win.document.write(`
      <html>
        <head>
          <title>로트번호 추적</title>
          <style>
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h3>로트번호 추적</h3>
          <table>
            <thead>
              <tr>
                <th>의뢰ID</th>
                <th>Heat No.</th>
                <th>CAP</th>
                <th>CA</th>
                <th>환자</th>
                <th>치아</th>
                <th>공정</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleDownloadTodayShipping = () => {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    const rows = shippingRows.filter((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const base =
        di.shippedAt ||
        di.deliveredAt ||
        r.createdAt ||
        new Date().toISOString();
      return String(base).slice(0, 10) === ymd;
    });

    const escapeCsv = (value: string) => {
      if (value == null) return "";
      const s = String(value);
      if (/[",\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const header = [
      "기공소명",
      "전화1",
      "",
      "전화2",
      "",
      "주소",
      "박스수량",
      "종류",
      "",
      "결제",
    ];

    const csvRows: string[] = [];
    csvRows.push(header.map(escapeCsv).join(","));

    for (const r of rows) {
      const ci: any = r.caseInfos || {};
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const name =
        ci.clinicName || r.requestor?.organization || r.requestor?.name || "";
      const phone = (ci as any)?.phone || r.requestor?.phone || "";
      const addr = (ci as any)?.address || "";
      const cols = [
        name,
        phone,
        "",
        phone,
        addr,
        "",
        "1",
        "의료기기",
        "",
        "신용",
      ];

      csvRows.push(cols.map(escapeCsv).join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `애크로덴트-${ymd}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processRows = useMemo(() => {
    const filtered =
      stageFilter === "전체"
        ? baseFiltered
        : baseFiltered.filter((r) => getStage(r) === stageFilter);

    return filtered.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered, stageFilter]);

  const lotRows = useMemo(() => {
    return baseFiltered.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  const shippingRows = useMemo(() => {
    const only = baseFiltered.filter((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      return Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt);
    });
    return only.slice().sort((a, b) => {
      const da = normalizeDeliveryInfo(a.deliveryInfoRef);
      const db = normalizeDeliveryInfo(b.deliveryInfoRef);
      const aTime = new Date(
        da.deliveredAt || da.shippedAt || a.createdAt || 0
      ).getTime();
      const bTime = new Date(
        db.deliveredAt || db.shippedAt || b.createdAt || 0
      ).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as InquiryTab)}>
        <div className="flex items-center justify-between gap-3">
          <TabsList className="justify-start">
            <TabsTrigger value="process">생산 공정별</TabsTrigger>
            <TabsTrigger value="lot">로트번호 추적</TabsTrigger>
            <TabsTrigger value="shipping">택배/배송</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {tab === "lot" && (
              <Button
                variant="default"
                size="sm"
                className="px-4"
                onClick={handlePrintLot}
              >
                프린트
              </Button>
            )}
            {tab === "shipping" && (
              <Button
                variant="default"
                size="sm"
                className="px-4"
                onClick={handleDownloadTodayShipping}
              >
                오늘 접수할 내역
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">기간</span>
          {(
            [
              ["recent7", "최근 7일"],
              ["recent30", "최근 30일"],
              ["recent90", "최근 90일"],
              ["lastMonth", "지난달"],
              ["thisMonth", "이번달"],
              ["all", "전체"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={dateRange === key ? "default" : "outline"}
              size="sm"
              className="rounded-full px-3"
              onClick={() => setDateRange(key as DateRange)}
            >
              {label}
            </Button>
          ))}
        </div>

        <TabsContent value="process" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["의뢰", stageCounts.의뢰],
                  ["CAM", stageCounts.CAM],
                  ["생산", stageCounts.생산],
                  ["발송", stageCounts.발송],
                  ["추적관리", stageCounts.추적관리],
                ] as const
              ).map(([k, v]) => (
                <Badge key={k} variant="secondary">
                  {k}: {v}
                </Badge>
              ))}
            </div>

            <div className="w-[160px]">
              <Select
                value={stageFilter}
                onValueChange={(v) => setStageFilter(v as ProcessStage)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="전체">전체</SelectItem>
                  <SelectItem value="의뢰">의뢰</SelectItem>
                  <SelectItem value="CAM">CAM</SelectItem>
                  <SelectItem value="생산">생산</SelectItem>
                  <SelectItem value="발송">발송</SelectItem>
                  <SelectItem value="추적관리">추적관리</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>의뢰ID</TableHead>
                  <TableHead>환자/치아</TableHead>
                  <TableHead>공정</TableHead>
                  <TableHead>장비</TableHead>
                  <TableHead>반제품(CAP)</TableHead>
                  <TableHead>완제품(CA)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processRows.map((r) => {
                  const ci: any = r.caseInfos || {};
                  return (
                    <TableRow key={String(r._id || r.requestId)}>
                      <TableCell className="font-medium">
                        {r.requestId || "-"}
                      </TableCell>
                      <TableCell>
                        {ci.patientName || "-"} / {ci.tooth || "-"}
                      </TableCell>
                      <TableCell>{getStage(r) || "-"}</TableCell>
                      <TableCell>{r.assignedMachine || "-"}</TableCell>
                      <TableCell>{r.lotNumber || "-"}</TableCell>
                      <TableCell>{r.finishedLotNumber || "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {!loading && processRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="lot" className="space-y-3 mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>의뢰ID</TableHead>
                  <TableHead>원재료(Heat No.)</TableHead>
                  <TableHead>반제품(CAP)</TableHead>
                  <TableHead>완제품(CA)</TableHead>
                  <TableHead>현재공정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotRows.map((r) => {
                  const ci: any = r.caseInfos || {};
                  const stage = getStage(r) || "-";
                  return (
                    <TableRow key={String(r._id || r.requestId)}>
                      <TableCell className="font-medium">
                        {r.requestId || "-"}
                        <div className="text-xs text-muted-foreground">
                          {ci.patientName || "-"} / {ci.tooth || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{r.rawMaterialHeatNo || "-"}</TableCell>
                      <TableCell>{r.lotNumber || "-"}</TableCell>
                      <TableCell>{r.finishedLotNumber || "-"}</TableCell>
                      <TableCell>{stage}</TableCell>
                    </TableRow>
                  );
                })}
                {!loading && lotRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="shipping" className="space-y-3 mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>의뢰ID</TableHead>
                  <TableHead>택배사</TableHead>
                  <TableHead>송장번호</TableHead>
                  <TableHead>접수(출고)</TableHead>
                  <TableHead>배송완료</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shippingRows.map((r) => {
                  const di = normalizeDeliveryInfo(r.deliveryInfoRef);
                  const shippedAt = di.shippedAt ? String(di.shippedAt) : "";
                  const deliveredAt = di.deliveredAt
                    ? String(di.deliveredAt)
                    : "";
                  const status = deliveredAt
                    ? "완료"
                    : shippedAt || di.trackingNumber
                    ? "배송중"
                    : "-";

                  return (
                    <TableRow key={String(r._id || r.requestId)}>
                      <TableCell className="font-medium">
                        {r.requestId || "-"}
                      </TableCell>
                      <TableCell>{di.carrier || "-"}</TableCell>
                      <TableCell>{di.trackingNumber || "-"}</TableCell>
                      <TableCell>{formatDateTime(shippedAt)}</TableCell>
                      <TableCell>{formatDateTime(deliveredAt)}</TableCell>
                      <TableCell>{status}</TableCell>
                    </TableRow>
                  );
                })}
                {!loading && shippingRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
