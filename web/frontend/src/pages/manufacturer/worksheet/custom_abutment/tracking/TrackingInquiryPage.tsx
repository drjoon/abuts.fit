import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
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
import type { DeliveryInfoSummary, RequestBase } from "@/types/request";

type InquiryTab = "process" | "shipping" | "udi";
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

const formatYmd = (d?: string) => {
  if (!d) return "-";
  const s = String(d);
  if (s.length >= 10) return s.slice(0, 10);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toISOString().slice(0, 10);
};

const normalizeLotNumberLabel = (req: ManufacturerRequest) => {
  const raw = String(
    req?.lotNumber?.final || req?.lotNumber?.part || "",
  ).trim();
  if (!raw) return "-";
  const cleaned = raw.replace(/^CA(P)?/i, "").trim();
  if (!cleaned) return "-";
  if (cleaned.includes("-")) return cleaned;
  if (cleaned.length > 6) return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  return cleaned;
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
  const defaultDateRangeByTab: Record<InquiryTab, DateRange> = {
    process: "recent30",
    shipping: "recent30",
    udi: "lastMonth",
  };
  const [dateRangeByTab, setDateRangeByTab] = useState<
    Record<InquiryTab, DateRange>
  >(defaultDateRangeByTab);
  const dateRange = dateRangeByTab[tab];

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

    const handleDownloadUdi = () => {
      const header = [
        "의뢰ID",
        "환자/치아",
        "출고일",
        "택배사",
        "송장번호",
        "원재료(Heat No.)",
        "반제품(CAP)",
        "완제품(CA)",
      ];

      const escapeCsv = (value: string) => {
        if (value == null) return "";
        const s = String(value);
        if (/[\",\\n]/.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const rows = udiRows.map((r) => {
        const ci: any = r.caseInfos || {};
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const shippedAt = di.shippedAt || di.deliveredAt || "";
        const shippedDate = shippedAt ? String(shippedAt).slice(0, 10) : "";
        const lotMaterial = String(r.lotNumber?.material || "");
        const lotPart = String(r.lotNumber?.part || "");
        const lotFinal = String(r.lotNumber?.final || "");
        return [
          r.requestId || "",
          `${ci.patientName || ""} / ${ci.tooth || ""}`,
          shippedDate,
          di.carrier || "",
          di.trackingNumber || "",
          lotMaterial,
          lotPart,
          lotFinal,
        ];
      });

      const csvRows: string[] = [];
      csvRows.push(header.map(escapeCsv).join(","));
      rows.forEach((row) => csvRows.push(row.map(escapeCsv).join(",")));
      const csvContent = "\uFEFF" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "UDI-지난달-출고내역.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      .filter((r) => {
        // 추적관리 단계는 '완료' 성격이므로, 완료포함 토글과 무관하게 항상 표시
        const stage = String(r.manufacturerStage || "").trim();
        if (stage === "추적관리") return true;
        return showCompleted ? true : !isDone(r);
      })
      .filter((r) => {
        // 추적관리 화면에서는 기본적으로 발송/출고된 건만 표시.
        // 단, DB상 제조사 단계가 '추적관리'로 이미 넘어간 건은 배송정보가 없어도 표시해야 한다.
        const stage = String(r.manufacturerStage || "").trim();
        if (stage === "추적관리") return true;
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        return Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt);
      })
      .filter((r) => {
        if (!fromDate && !toDate) return true;
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const base = di.shippedAt || di.deliveredAt || r.createdAt;
        if (!base) return false;
        const t = new Date(base);
        if (Number.isNaN(t.getTime())) return false;
        if (fromDate && t < fromDate) return false;
        if (toDate && t > toDate) return false;
        return true;
      })
      .filter((r) => {
        if (!searchLower) return true;

        const ci: any = r.caseInfos || {};
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const lotMaterial = String(r.lotNumber?.material || "");
        const lotPart = String(r.lotNumber?.part || "");
        const lotFinal = String(r.lotNumber?.final || "");
        const hay = (
          String(r.requestId || "") +
          String(r.assignedMachine || "") +
          lotMaterial +
          lotPart +
          lotFinal +
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

  const handlePrint = (type: InquiryTab) => {
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;

    let title = "생산공정일지";
    let headers: string[] = [];
    let rowsHtml = "";

    if (type === "process") {
      title = "생산공정일지";
      headers = [
        "의뢰ID",
        "환자/치아",
        "생산",
        "발송",
        "발송날짜",
        "장비",
        "원재료",
        "로트번호",
      ];
      rowsHtml = processRows
        .map((r) => {
          const ci: any = r.caseInfos || {};
          const lotMaterial = String(r.lotNumber?.material || "");
          const lotLabel = normalizeLotNumberLabel(r);
          const di = normalizeDeliveryInfo(r.deliveryInfoRef);
          const shippedDate = formatYmd(di.shippedAt || di.deliveredAt);
          return `<tr>
            <td>${r.requestId || ""}</td>
            <td>${ci.patientName || ""} / ${ci.tooth || ""}</td>
            <td>가공·탈지·연마·검사·세척·포장</td>
            <td>출하승인·출고</td>
            <td>${shippedDate}</td>
            <td>${r.assignedMachine || ""}</td>
            <td>${lotMaterial}</td>
            <td>${lotLabel}</td>
          </tr>`;
        })
        .join("");
    } else if (type === "udi") {
      title = "UDI 신고 내역";
      headers = [
        "의뢰ID",
        "환자/치아",
        "출고일",
        "택배사",
        "송장번호",
        "원재료",
        "로트번호",
      ];
      rowsHtml = udiRows
        .map((r) => {
          const ci: any = r.caseInfos || {};
          const di = normalizeDeliveryInfo(r.deliveryInfoRef);
          const shippedAt = di.shippedAt || di.deliveredAt || "";
          const shippedDate = shippedAt ? String(shippedAt).slice(0, 10) : "";
          const lotMaterial = String(r.lotNumber?.material || "");
          const lotLabel = normalizeLotNumberLabel(r);
          return `<tr>
            <td>${r.requestId || ""}</td>
            <td>${ci.patientName || ""} / ${ci.tooth || ""}</td>
            <td>${shippedDate}</td>
            <td>${di.carrier || ""}</td>
            <td>${di.trackingNumber || ""}</td>
            <td>${lotMaterial}</td>
            <td>${lotLabel}</td>
          </tr>`;
        })
        .join("");
    } else {
      title = "택배/배송 내역";
      headers = [
        "의뢰ID",
        "택배사",
        "송장번호",
        "접수(출고)",
        "배송완료",
        "상태",
      ];
      rowsHtml = shippingRows
        .map((r) => {
          const di = normalizeDeliveryInfo(r.deliveryInfoRef);
          const shippedAt = di.shippedAt ? String(di.shippedAt) : "";
          const deliveredAt = di.deliveredAt ? String(di.deliveredAt) : "";
          const status = deliveredAt
            ? "완료"
            : shippedAt || di.trackingNumber
              ? "배송중"
              : "-";
          return `<tr>
            <td>${r.requestId || ""}</td>
            <td>${di.carrier || ""}</td>
            <td>${di.trackingNumber || ""}</td>
            <td>${formatDateTime(shippedAt)}</td>
            <td>${formatDateTime(deliveredAt)}</td>
            <td>${status}</td>
          </tr>`;
        })
        .join("");
    }

    const headersHtml = headers.map((h) => `<th>${h}</th>`).join("");
    win.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h3>${title}</h3>
          <table>
            <thead>
              <tr>${headersHtml}</tr>
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

  const handleDownloadUdi = () => {
    const header = [
      "의뢰ID",
      "환자/치아",
      "출고일",
      "택배사",
      "송장번호",
      "원재료(Heat No.)",
      "반제품(CAP)",
      "완제품(CA)",
    ];

    const escapeCsv = (value: string) => {
      if (value == null) return "";
      const s = String(value);
      if (/[\",\\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const rows = udiRows.map((r) => {
      const ci: any = r.caseInfos || {};
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const shippedAt = di.shippedAt || di.deliveredAt || "";
      const shippedDate = shippedAt ? String(shippedAt).slice(0, 10) : "";
      const lotMaterial = String(r.lotNumber?.material || "");
      const lotPart = String(r.lotNumber?.part || "");
      const lotFinal = String(r.lotNumber?.final || "");
      return [
        r.requestId || "",
        `${ci.patientName || ""} / ${ci.tooth || ""}`,
        shippedDate,
        di.carrier || "",
        di.trackingNumber || "",
        lotMaterial,
        lotPart,
        lotFinal,
      ];
    });

    const csvRows: string[] = [];
    csvRows.push(header.map(escapeCsv).join(","));
    rows.forEach((row) => csvRows.push(row.map(escapeCsv).join(",")));
    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.download = `애크로덴트-UDI-${todayStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processRows = useMemo(() => {
    return baseFiltered.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  const lastMonthRange = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, []);

  const udiRows = useMemo(() => {
    const { from, to } = lastMonthRange;
    return baseFiltered
      .filter((r) => {
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const base =
          di.shippedAt ||
          di.deliveredAt ||
          r.createdAt ||
          new Date().toISOString();
        const t = new Date(base);
        if (Number.isNaN(t.getTime())) return false;
        return t >= from && t <= to;
      })
      .slice()
      .sort((a, b) => {
        const da = normalizeDeliveryInfo(a.deliveryInfoRef);
        const db = normalizeDeliveryInfo(b.deliveryInfoRef);
        const aTime = new Date(
          da.shippedAt || da.deliveredAt || a.createdAt || 0,
        ).getTime();
        const bTime = new Date(
          db.shippedAt || db.deliveredAt || b.createdAt || 0,
        ).getTime();
        return bTime - aTime;
      });
  }, [baseFiltered, lastMonthRange]);

  const shippingRows = useMemo(() => {
    const only = baseFiltered.filter((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      return Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt);
    });
    return only.slice().sort((a, b) => {
      const da = normalizeDeliveryInfo(a.deliveryInfoRef);
      const db = normalizeDeliveryInfo(b.deliveryInfoRef);
      const aTime = new Date(
        da.deliveredAt || da.shippedAt || a.createdAt || 0,
      ).getTime();
      const bTime = new Date(
        db.deliveredAt || db.shippedAt || b.createdAt || 0,
      ).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as InquiryTab)}>
        <div className="flex items-center gap-3">
          <TabsList className="flex-1 justify-center">
            <TabsTrigger value="process">생산공정일지</TabsTrigger>
            <TabsTrigger value="shipping">택배/배송</TabsTrigger>
            <TabsTrigger value="udi">UDI신고</TabsTrigger>
          </TabsList>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
                onClick={() =>
                  setDateRangeByTab((prev) => ({
                    ...prev,
                    [tab]: key as DateRange,
                  }))
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {tab === "udi" && (
              <Button
                variant="outline"
                size="sm"
                className="px-4"
                onClick={handleDownloadUdi}
              >
                다운로드
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              className="px-4"
              onClick={() => handlePrint(tab)}
            >
              프린트
            </Button>
          </div>
        </div>

        <TabsContent value="process" className="space-y-3 mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">의뢰ID</TableHead>
                  <TableHead className="text-center">환자/치아</TableHead>
                  <TableHead className="text-center">생산</TableHead>
                  <TableHead className="text-center">발송</TableHead>
                  <TableHead className="text-center">발송날짜</TableHead>
                  <TableHead className="text-center">장비</TableHead>
                  <TableHead className="text-center">원재료</TableHead>
                  <TableHead className="text-center">로트번호</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processRows.map((r) => {
                  const ci: any = r.caseInfos || {};
                  const di = normalizeDeliveryInfo(r.deliveryInfoRef);
                  const shippedDate = formatYmd(di.shippedAt || di.deliveredAt);
                  return (
                    <TableRow key={String(r._id || r.requestId)}>
                      <TableCell className="font-medium">
                        {r.requestId || "-"}
                      </TableCell>
                      <TableCell>
                        {ci.patientName || "-"} / {ci.tooth || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                          {["가공", "탈지", "연마", "검사", "세척", "포장"].map(
                            (step) => (
                              <label
                                key={step}
                                className="flex items-center gap-1 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  readOnly
                                  className="h-4 w-4 accent-primary"
                                />
                                <span>{step}</span>
                              </label>
                            ),
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-3">
                          {["출하승인", "출고"].map((step) => (
                            <label
                              key={step}
                              className="flex items-center gap-1 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked
                                readOnly
                                className="h-4 w-4 accent-primary"
                              />
                              <span>{step}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{shippedDate}</TableCell>
                      <TableCell>{r.assignedMachine || "-"}</TableCell>
                      <TableCell>{r.lotNumber?.material || "-"}</TableCell>
                      <TableCell>{normalizeLotNumberLabel(r)}</TableCell>
                    </TableRow>
                  );
                })}
                {!loading && processRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
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

        <TabsContent value="udi" className="space-y-3 mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>의뢰ID</TableHead>
                  <TableHead>환자/치아</TableHead>
                  <TableHead>출고일</TableHead>
                  <TableHead>택배사</TableHead>
                  <TableHead>송장번호</TableHead>
                  <TableHead>원재료</TableHead>
                  <TableHead>로트번호</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {udiRows.map((r) => {
                  const ci: any = r.caseInfos || {};
                  const di = normalizeDeliveryInfo(r.deliveryInfoRef);
                  const shippedAt = di.shippedAt || di.deliveredAt || "";
                  const shippedDate = shippedAt
                    ? String(shippedAt).slice(0, 10)
                    : "-";
                  return (
                    <TableRow key={String(r._id || r.requestId)}>
                      <TableCell className="font-medium">
                        {r.requestId || "-"}
                      </TableCell>
                      <TableCell>
                        {ci.patientName || "-"} / {ci.tooth || "-"}
                      </TableCell>
                      <TableCell>{shippedDate}</TableCell>
                      <TableCell>{di.carrier || "-"}</TableCell>
                      <TableCell>{di.trackingNumber || "-"}</TableCell>
                      <TableCell>{r.lotNumber?.material || "-"}</TableCell>
                      <TableCell>{normalizeLotNumberLabel(r)}</TableCell>
                    </TableRow>
                  );
                })}
                {!loading && udiRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      지난달 출고 내역이 없습니다.
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
