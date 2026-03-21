import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import * as XLSX from "xlsx";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { generateModelNumber } from "@/utils/modelNumber";
import { request } from "@/shared/api/apiClient";
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
import type { DeliveryInfoSummary } from "@/types/request";
import { toKstYmd } from "@/shared/date/kst";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  deriveStageForFilter,
  type ManufacturerRequest,
} from "../utils/request";
import { useWorksheetRealtimeStatus } from "../hooks/useWorksheetRealtimeStatus";

type InquiryTab = "process" | "shipping" | "udi";
type DateRange =
  | "recent7"
  | "recent30"
  | "lastMonth"
  | "thisMonth"
  | "recent90";

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
  const stage = String(req.manufacturerStage || "").trim();
  const di = (req.deliveryInfoRef || null) as any;
  const deliveredAt = di?.deliveredAt ? new Date(di.deliveredAt) : null;
  const pickedUpAt = di?.pickedUpAt ? new Date(di.pickedUpAt) : null;
  const pickupCode = String(di?.tracking?.lastStatusCode || "").trim();
  return (
    stage === "추적관리" ||
    Boolean(deliveredAt || pickedUpAt || pickupCode === "11")
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
  return toKstYmd(dt) || "-";
};

const normalizeLotNumberLabel = (req: ManufacturerRequest) => {
  const raw = String(req?.lotNumber?.value || "").trim();
  if (!raw) return "-";
  const cleaned = raw.replace(/^CA(P)?/i, "").trim();
  if (!cleaned) return "-";
  let formatted = cleaned;
  if (!cleaned.includes("-") && cleaned.length > 6) {
    formatted = `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  }

  const modelNum = generateModelNumber((req as any)?.caseInfos, formatted);
  if (modelNum) {
    return `${formatted} (${modelNum})`;
  }
  return formatted;
};

const formatDateTime = (d?: string) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ko-KR");
};

const getShippingStatus = (req: ManufacturerRequest) => {
  const di = normalizeDeliveryInfo(req.deliveryInfoRef);
  const lastStatusText = String(di?.tracking?.lastStatusText || "").trim();
  if (di.deliveredAt) return "배송완료";
  if (lastStatusText) return lastStatusText;
  if (di.trackingNumber || di.shippedAt) return "접수";
  return "-";
};

export const TrackingInquiryPage = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();

  const [tab, setTab] = useState<InquiryTab>("shipping");
  const [visibleCount, setVisibleCount] = useState(30);
  const visibleCountRef = useRef(30);
  const totalCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onScrollRef = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [mockDelivering, setMockDelivering] = useState(false);
  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  // Network pagination per stage (tracking)
  const PAGE_LIMIT = 30;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const userScrolledRef = useRef(false);
  const defaultDateRangeByTab: Record<InquiryTab, DateRange> = {
    process: "recent30",
    shipping: "recent30",
    udi: "recent30",
  };
  const [dateRangeByTab, setDateRangeByTab] = useState<
    Record<InquiryTab, DateRange>
  >(defaultDateRangeByTab);
  const dateRange = dateRangeByTab[tab];

  const matchesCurrentPage = useCallback((req: ManufacturerRequest) => {
    const stage = deriveStageForFilter(req);
    const di = normalizeDeliveryInfo(req.deliveryInfoRef);
    return (
      stage === "추적관리" ||
      (stage === "포장.발송" &&
        Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt))
    );
  }, []);

  useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests,
    matchesCurrentPage,
  });

  useEffect(() => {
    if (!token) return;

    const run = async (silent = false, append = false) => {
      try {
        if (!silent) setLoading(true);
        const url = new URL("/api/requests/all", window.location.origin);
        url.searchParams.set("page", String(pageRef.current));
        url.searchParams.set("limit", String(PAGE_LIMIT));
        url.searchParams.set("view", "worksheet");
        url.searchParams.set("worksheetProfile", "tracking");
        url.searchParams.set("includeTotal", "0");
        url.searchParams.set("includeDelivery", "1");
        const res = await fetch(url.pathname + url.search, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "의뢰 목록 조회에 실패했습니다.");
        }
        const list = Array.isArray(body?.data?.requests)
          ? body.data.requests
          : [];
        if (append) {
          setRequests((prev) => {
            const map = new Map<string, any>();
            for (const r of prev)
              map.set(
                String(
                  (r as any)?._id || (r as any)?.requestId || Math.random(),
                ),
                r,
              );
            for (const r of list)
              map.set(
                String(
                  (r as any)?._id || (r as any)?.requestId || Math.random(),
                ),
                r,
              );
            return Array.from(map.values()) as any[];
          });
        } else {
          setRequests(list);
        }
        hasMoreRef.current = list.length >= PAGE_LIMIT;
      } catch (e: any) {
        toast({
          title: "조회 실패",
          description: e?.message || "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        if (!silent) setLoading(false);
      }
    };

    // initial load or token change → reset paging
    pageRef.current = 1;
    hasMoreRef.current = true;
    void run(false, false);
    // expose helpers on ref for pagination
    (window as any).__trackingFetchNext = async () => {
      if (isFetchingPageRef.current || !hasMoreRef.current) return;
      // throttle: min 500ms between fetches
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 500) return;
      lastFetchTimeRef.current = now;
      isFetchingPageRef.current = true;
      try {
        pageRef.current += 1;
        await run(true, true);
      } finally {
        isFetchingPageRef.current = false;
      }
    };
  }, [token, toast]);

  // Reset pagination on UI filter changes
  useEffect(() => {
    if (!token) return;
    const run = async (silent = false, append = false) => {
      try {
        if (!silent) setLoading(true);
        const url = new URL("/api/requests/all", window.location.origin);
        url.searchParams.set("page", String(pageRef.current));
        url.searchParams.set("limit", String(PAGE_LIMIT));
        url.searchParams.set("view", "worksheet");
        url.searchParams.set("worksheetProfile", "tracking");
        url.searchParams.set("includeTotal", "0");
        url.searchParams.set("includeDelivery", "1");
        const res = await fetch(url.pathname + url.search, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "의뢰 목록 조회에 실패했습니다.");
        }
        const list = Array.isArray(body?.data?.requests)
          ? body.data.requests
          : [];
        if (append) {
          setRequests((prev) => {
            const map = new Map<string, any>();
            for (const r of prev)
              map.set(
                String(
                  (r as any)?._id || (r as any)?.requestId || Math.random(),
                ),
                r,
              );
            for (const r of list)
              map.set(
                String(
                  (r as any)?._id || (r as any)?.requestId || Math.random(),
                ),
                r,
              );
            return Array.from(map.values()) as any[];
          });
        } else {
          setRequests(list);
        }
        hasMoreRef.current = list.length >= PAGE_LIMIT;
      } catch (e: any) {
        toast({
          title: "조회 실패",
          description: e?.message || "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        if (!silent) setLoading(false);
      }
    };

    pageRef.current = 1;
    hasMoreRef.current = true;
    void run(false, false);
  }, [tab, dateRange, worksheetSearch, showCompleted, token, toast]);

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
        // 추적관리 화면에서는 기본적으로 발송된 건만 표시.
        // 단, DB상 제조사 단계가 '추적관리'로 이미 넘어간 건은 배송정보가 없어도 표시해야 한다.
        const stage = String(r.manufacturerStage || "").trim();
        if (stage === "추적관리") return true;
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        return Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt);
      })
      .filter((r) => {
        if (!fromDate && !toDate) return true;
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const base = di.deliveredAt || di.shippedAt || r.createdAt;
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
        const lotValue = String(r.lotNumber?.value || "");
        const hay = (
          String(r.requestId || "") +
          String(r.assignedMachine || "") +
          String(ci.patientName || "") +
          String(ci.tooth || "") +
          String(ci.clinicName || "") +
          String(lotMaterial || "") +
          String(lotValue || "") +
          String(di.trackingNumber || "")
        ).toLowerCase();
        return hay.includes(searchLower);
      });
  }, [requests, searchLower, showCompleted, fromDate, toDate]);

  const dateRangeToPeriod = (dr: DateRange): PeriodFilterValue => {
    if (dr === "recent7") return "7d";
    if (dr === "recent30") return "30d";
    if (dr === "recent90") return "90d";
    if (dr === "lastMonth") return "lastMonth";
    return "thisMonth";
  };

  const periodToDateRange = (p: PeriodFilterValue): DateRange => {
    if (p === "7d") return "recent7";
    if (p === "30d") return "recent30";
    if (p === "90d") return "recent90";
    if (p === "lastMonth") return "lastMonth";
    return "thisMonth";
  };

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
        "상태",
        "발송날짜",
        "장비",
        "원재료",
        "로트번호",
      ];
      rowsHtml = processRows
        .map((r) => {
          const ci: any = r.caseInfos || {};
          const lotMaterial = String(r.lotNumber?.material || "");
          const di = normalizeDeliveryInfo(r.deliveryInfoRef);
          const shippedDate = formatYmd(di.deliveredAt || di.shippedAt);
          const shippingStatus = di.deliveredAt
            ? "배송완료"
            : di.pickedUpAt
              ? "집하완료"
              : di.shippedAt
                ? "발송완료"
                : "-";
          const machineLabel = String(
            r.assignedMachine || r.productionSchedule?.assignedMachine || "",
          ).trim();
          return `<tr>
            <td>${r.requestId || ""}</td>
            <td>${ci.patientName || ""} / ${ci.tooth || ""}</td>
            <td>가공·탈지·연마·검사·세척·포장</td>
            <td>${shippingStatus}</td>
            <td>${shippedDate}</td>
            <td>${machineLabel || "-"}</td>
            <td>${lotMaterial}</td>
            <td>${normalizeLotNumberLabel(r)}</td>
          </tr>`;
        })
        .join("");
    } else if (type === "udi") {
      title = "UDI 신고 내역";
      headers = [
        "의뢰ID",
        "환자/치아",
        "배송완료일",
        "택배사",
        "송장번호",
        "원재료",
        "로트번호",
      ];
      rowsHtml = udiRows
        .map((r) => {
          const ci: any = r.caseInfos || {};
          const di = normalizeDeliveryInfo(r.deliveryInfoRef);
          const deliveredAt = di.deliveredAt || "";
          const deliveredDate = deliveredAt
            ? String(deliveredAt).slice(0, 10)
            : "";
          const lotMaterial = String(r.lotNumber?.material || "");
          const lotValue = String(r.lotNumber?.value || "");
          return `<tr>
            <td>${r.requestId || ""}</td>
            <td>${ci.patientName || ""} / ${ci.tooth || ""}</td>
            <td>${deliveredDate}</td>
            <td>${di.carrier || ""}</td>
            <td>${di.trackingNumber || ""}</td>
            <td>${lotMaterial}</td>
            <td>${normalizeLotNumberLabel(r)}</td>
          </tr>`;
        })
        .join("");
    } else {
      title = "택배/배송 내역";
      headers = [
        "의뢰건수",
        "의뢰ID",
        "택배사",
        "송장번호",
        "접수(발송)",
        "배송완료",
        "상태",
      ];
      rowsHtml = shippingRows
        .map((box) => {
          const di = normalizeDeliveryInfo(box.deliveryInfoRef);
          const shippedAt = di.shippedAt ? String(di.shippedAt) : "";
          const pickedUpAt = di.pickedUpAt ? String(di.pickedUpAt) : "";
          const deliveredAt = di.deliveredAt ? String(di.deliveredAt) : "";
          const status = deliveredAt
            ? "배송완료"
            : pickedUpAt
              ? "집하완료"
              : shippedAt || di.trackingNumber
                ? "배송중"
                : "-";
          const requestCount = (box as any)?.requestCount || 1;
          const requests = (box as any)?.requests || [];
          const requestIds = requests
            .map((r: any) => String(r?.requestId || "").trim())
            .filter(Boolean)
            .join(", ");
          return `<tr>
            <td>${requestCount}건</td>
            <td>${requestIds || ""}</td>
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
    const ymd = toKstYmd(today) || "";
    const rows = shippingRows.filter((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const base =
        formatYmd((di as any)?.shippedAt) || formatYmd((di as any)?.createdAt);
      return String(base).slice(0, 10) === ymd;
    });

    const sheetRows = [
      [
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
      ],
      ...rows.map((box) => {
        const firstRequest = (box as any)?.requests?.[0];
        const ci: any = firstRequest?.caseInfos || {};
        const name =
          ci.clinicName ||
          firstRequest?.requestor?.business ||
          firstRequest?.requestor?.name ||
          "";
        const phone =
          (ci as any)?.phone || firstRequest?.requestor?.phone || "";
        const addr = (ci as any)?.address || "";
        return [
          name,
          phone,
          "",
          phone,
          addr,
          "",
          String(box.requestCount || 1),
          "의료기기",
          "",
          "신용",
        ];
      }),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "택배배송");
    XLSX.writeFile(workbook, `애크로덴트-${ymd}.xlsx`, {
      compression: true,
    });
  };

  const handleDownloadUdi = () => {
    const todayStr = (toKstYmd(new Date()) || "").replace(/-/g, "");
    const rows = [
      [
        "의뢰ID",
        "환자/치아",
        "배송완료일",
        "택배사",
        "송장번호",
        "원재료(Heat No.)",
        "제조번호(CA)",
        "표시용 LOT",
      ],
      ...udiRows.map((r) => {
        const ci: any = r.caseInfos || {};
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const deliveredDate = di.deliveredAt
          ? String(di.deliveredAt).slice(0, 10)
          : "";
        const lotMaterial = String(r.lotNumber?.material || "");
        const lotValue = String(r.lotNumber?.value || "");
        return [
          r.requestId || "",
          `${ci.patientName || ""} / ${ci.tooth || ""}`,
          deliveredDate,
          di.carrier || "",
          di.trackingNumber || "",
          lotMaterial,
          lotValue,
          normalizeLotNumberLabel(r),
        ];
      }),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "UDI신고");
    XLSX.writeFile(workbook, `애크로덴트-UDI-${todayStr}.xlsx`, {
      compression: true,
    });
  };

  const processRows = useMemo(() => {
    return baseFiltered.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  const udiRows = useMemo(() => {
    return baseFiltered
      .filter((r) => {
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const base = di.deliveredAt;
        if (!base) return false;
        const t = new Date(base);
        if (Number.isNaN(t.getTime())) return false;
        if (fromDate && t < fromDate) return false;
        if (toDate && t > toDate) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const da = normalizeDeliveryInfo(a.deliveryInfoRef);
        const db = normalizeDeliveryInfo(b.deliveryInfoRef);
        const aTime = new Date(da.deliveredAt || a.createdAt || 0).getTime();
        const bTime = new Date(db.deliveredAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [baseFiltered, fromDate, toDate]);

  const shippingRows = useMemo(() => {
    const only = baseFiltered.filter((r) => {
      const stage = String(r.manufacturerStage || "").trim();
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      return (
        stage === "추적관리" ||
        Boolean(
          di.pickedUpAt ||
          di.deliveredAt ||
          di.tracking?.lastStatusCode === "11",
        )
      );
    });

    // 우편함 단위로 그룹핑
    const boxMap = new Map<string, ManufacturerRequest[]>();
    for (const r of only) {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const mailboxAddress = String(r?.mailboxAddress || "").trim();
      const fallbackRequestId = String(r?.requestId || r?._id || "").trim();
      const boxKey = mailboxAddress || `request:${fallbackRequestId}`;
      if (!boxMap.has(boxKey)) {
        boxMap.set(boxKey, []);
      }
      boxMap.get(boxKey)!.push(r);
    }

    // 우편함별 대표 정보 생성 (첫 번째 의뢰건 기준)
    const boxes = Array.from(boxMap.entries()).map(([boxKey, requests]) => {
      const firstRequest = requests[0];
      const di = normalizeDeliveryInfo(firstRequest.deliveryInfoRef);
      const mailboxAddress = String(firstRequest?.mailboxAddress || "").trim();
      const trackingNumber = String(di?.trackingNumber || "").trim() || null;
      return {
        boxKey,
        mailboxAddress,
        trackingNumber,
        carrier: di.carrier,
        shippedAt: di.shippedAt,
        deliveredAt: di.deliveredAt,
        pickedUpAt: di.pickedUpAt,
        tracking: di.tracking,
        requestCount: requests.length,
        requests,
        _id: `mailbox-${boxKey}`,
        requestId: `[${requests.length}건] ${requests.map((r) => r.requestId).join(", ")}`,
        deliveryInfoRef: di,
        createdAt: firstRequest.createdAt,
      };
    });

    return boxes.slice().sort((a, b) => {
      const aTime = new Date(
        a.deliveredAt || a.shippedAt || a.createdAt || 0,
      ).getTime();
      const bTime = new Date(
        b.deliveredAt || b.shippedAt || b.createdAt || 0,
      ).getTime();
      return bTime - aTime;
    });
  }, [baseFiltered]);

  useEffect(() => {
    setExpandedBoxes((prev) => {
      if (!prev.size) return prev;
      const validIds = new Set(
        shippingRows.map((box: any) => String(box?._id || box?.boxKey || "")),
      );
      const next = new Set(
        Array.from(prev).filter((boxId) => validIds.has(String(boxId || ""))),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [shippingRows]);

  useEffect(() => {
    // 한 번만 실행 - 디버깅 로그 출력
    const only = baseFiltered.filter((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      return Boolean(di.trackingNumber || di.shippedAt || di.deliveredAt);
    });

    console.log(
      "[DEBUG_ONCE] shippingRows - baseFiltered count:",
      baseFiltered.length,
    );
    console.log(
      "[DEBUG_ONCE] shippingRows - only (with tracking) count:",
      only.length,
    );

    // 각 의뢰건의 deliveryInfoRef 상세 정보 출력
    only.forEach((r) => {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      console.log(`[DEBUG_ONCE] Request ${r.requestId}:`, {
        trackingNumber: di.trackingNumber,
        carrier: di.carrier,
        shippedAt: di.shippedAt,
        pickedUpAt: di.pickedUpAt,
        deliveredAt: di.deliveredAt,
      });
    });
  }, []);

  const handleSyncTracking = useCallback(async () => {
    if (!shippingRows.length) {
      toast({
        title: "동기화할 배송건 없음",
        description: "송장번호가 있는 배송건이 없습니다.",
      });
      return;
    }
    setSyncingTracking(true);
    try {
      const requestIds = shippingRows
        .map((row) => String(row.requestId || "").trim())
        .filter(Boolean);
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/tracking-sync",
        method: "POST",
        jsonBody: { requestIds },
      });
      const body = response.data as any;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "배송조회 동기화에 실패했습니다.");
      }
      toast({
        title: "배송조회 동기화 완료",
        description: `${Array.isArray(body?.data?.synced) ? body.data.synced.length : 0}건 상태를 확인했고, 집하 완료 전까지 10분 간격으로 재확인합니다.`,
      });
    } catch (error) {
      toast({
        title: "배송조회 동기화 실패",
        description:
          error instanceof Error ? error.message : "동기화에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSyncingTracking(false);
    }
  }, [shippingRows, toast]);

  const handleMockDeliveryComplete = useCallback(async () => {
    const mailboxAddresses = Array.from(
      new Set(
        shippingRows
          .filter((row: any) => {
            const di = normalizeDeliveryInfo(row.deliveryInfoRef);
            return !di.deliveredAt;
          })
          .map((row: any) => String(row.mailboxAddress || "").trim())
          .filter(Boolean),
      ),
    );

    if (!mailboxAddresses.length) {
      toast({
        title: "처리할 배송건 없음",
        description: "배송완료 처리할 우편함이 없습니다.",
      });
      return;
    }

    setMockDelivering(true);
    try {
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/mock-delivery-complete",
        method: "POST",
        jsonBody: { mailboxAddresses },
      });
      const body = response.data as any;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "MOCK 배송완료 처리에 실패했습니다.");
      }
      toast({
        title: "MOCK 배송완료 처리 완료",
        description: `${Number(body?.data?.deliveredCount || 0)}개 우편함을 배송완료 처리했습니다.`,
      });
    } catch (error) {
      toast({
        title: "MOCK 배송완료 실패",
        description:
          error instanceof Error
            ? error.message
            : "MOCK 배송완료 처리에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setMockDelivering(false);
    }
  }, [shippingRows, toast]);

  const currentRows =
    tab === "process"
      ? processRows
      : tab === "shipping"
        ? shippingRows
        : udiRows;
  totalCountRef.current = currentRows.length;

  useEffect(() => {
    visibleCountRef.current = 30;
    setVisibleCount(30);
  }, [tab, dateRange, worksheetSearch, showCompleted]);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    if (scrollRef.current && onScrollRef.current) {
      scrollRef.current.removeEventListener("scroll", onScrollRef.current);
      onScrollRef.current = null;
    }
    scrollRef.current = node;
    if (!node) return;

    const maybeLoadMore = () => {
      const nearBottom =
        node.scrollTop + node.clientHeight >= node.scrollHeight - 200;
      // Only after explicit user scroll
      if (
        nearBottom &&
        userScrolledRef.current &&
        visibleCountRef.current >= totalCountRef.current - 3 &&
        hasMoreRef.current
      ) {
        void (window as any).__trackingFetchNext?.();
      }

      if (!nearBottom || !userScrolledRef.current) return;

      if (visibleCountRef.current < totalCountRef.current) {
        visibleCountRef.current = Math.min(
          visibleCountRef.current + 30,
          totalCountRef.current,
        );
        setVisibleCount(visibleCountRef.current);
      }
    };

    const onScroll = () => {
      userScrolledRef.current = true;
      maybeLoadMore();
    };
    onScrollRef.current = onScroll;
    node.addEventListener("scroll", onScroll, { passive: true });
  }, []);

  useEffect(() => {
    // when filter/tab changes, reset visible rows count
    // Do not auto trigger load-more; wait for explicit user scroll
  }, [currentRows.length]);

  return (
    <div className="relative w-full text-gray-800 flex flex-col items-stretch">
      <div className="flex-1">
        <Tabs value={tab} onValueChange={(v) => setTab(v as InquiryTab)}>
          <div className="flex items-center gap-3">
            <TabsList className="flex-1 justify-center">
              <TabsTrigger value="shipping">택배/배송</TabsTrigger>
              <TabsTrigger value="process">생산공정일지</TabsTrigger>
              <TabsTrigger value="udi">UDI신고</TabsTrigger>
            </TabsList>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilter
                value={dateRangeToPeriod(dateRange)}
                onChange={(next) => {
                  const nextRange = periodToDateRange(next);
                  setDateRangeByTab((prev) => ({
                    ...prev,
                    [tab]: nextRange,
                  }));
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              {tab === "shipping" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-4"
                  onClick={handleMockDeliveryComplete}
                  disabled={mockDelivering || syncingTracking}
                >
                  {mockDelivering ? "처리 중..." : "MOCK 배송완료"}
                </Button>
              )}
              {tab === "shipping" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-4"
                  onClick={handleSyncTracking}
                  disabled={syncingTracking}
                >
                  {syncingTracking ? "동기화 중..." : "배송조회 동기화"}
                </Button>
              )}
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

          <TabsContent
            value="process"
            className="space-y-3 mt-4 flex-1 min-h-0 flex flex-col"
          >
            <div
              ref={setScrollContainer}
              className="rounded-md border bg-background overflow-auto flex-1 min-h-0"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">의뢰ID</TableHead>
                    <TableHead className="text-center">환자/치아</TableHead>
                    <TableHead className="text-center">생산</TableHead>
                    <TableHead className="text-center">상태</TableHead>
                    <TableHead className="text-center">발송날짜</TableHead>
                    <TableHead className="text-center">장비</TableHead>
                    <TableHead className="text-center">원재료</TableHead>
                    <TableHead className="text-center">로트번호</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processRows.slice(0, visibleCount).map((r) => {
                    const ci: any = r.caseInfos || {};
                    const di = normalizeDeliveryInfo(r.deliveryInfoRef);
                    const shippedDate = formatYmd(
                      di.deliveredAt || di.shippedAt,
                    );
                    const shippingStatus = di.deliveredAt
                      ? "배송완료"
                      : di.pickedUpAt
                        ? "집하완료"
                        : di.shippedAt
                          ? "발송완료"
                          : "-";
                    const machineLabel =
                      r.assignedMachine ||
                      r.productionSchedule?.assignedMachine ||
                      "-";
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
                            {[
                              "가공",
                              "탈지",
                              "연마",
                              "검사",
                              "세척",
                              "포장",
                            ].map((step) => (
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
                        <TableCell>{shippingStatus}</TableCell>
                        <TableCell>{shippedDate}</TableCell>
                        <TableCell>{machineLabel}</TableCell>
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

          <TabsContent
            value="udi"
            className="space-y-3 mt-4 flex-1 min-h-0 flex flex-col"
          >
            <div
              ref={setScrollContainer}
              className="rounded-md border bg-background overflow-auto flex-1 min-h-0"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>의뢰ID</TableHead>
                    <TableHead>환자/치아</TableHead>
                    <TableHead>배송완료일</TableHead>
                    <TableHead>택배사</TableHead>
                    <TableHead>송장번호</TableHead>
                    <TableHead>원재료</TableHead>
                    <TableHead>로트번호</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {udiRows.slice(0, visibleCount).map((r) => {
                    const ci: any = r.caseInfos || {};
                    const di = normalizeDeliveryInfo(r.deliveryInfoRef);
                    const deliveredAt = di.deliveredAt || "";
                    const deliveredDate = deliveredAt
                      ? String(deliveredAt).slice(0, 10)
                      : "-";
                    const trackingNumber = String(
                      di.trackingNumber || "",
                    ).trim();
                    return (
                      <TableRow key={String(r._id || r.requestId)}>
                        <TableCell className="font-medium">
                          {r.requestId || "-"}
                        </TableCell>
                        <TableCell>
                          {ci.patientName || "-"} / {ci.tooth || "-"}
                        </TableCell>
                        <TableCell>{deliveredDate}</TableCell>
                        <TableCell>{di.carrier || "-"}</TableCell>
                        <TableCell
                          className="max-w-[180px] truncate"
                          title={trackingNumber || "-"}
                        >
                          {trackingNumber || "-"}
                        </TableCell>
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
                        배송완료 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent
            value="shipping"
            className="space-y-3 mt-4 flex-1 min-h-0 flex flex-col"
          >
            <div
              ref={setScrollContainer}
              className="space-y-3 overflow-auto flex-1 min-h-0 pr-3"
            >
              {shippingRows.slice(0, visibleCount).map((box) => {
                const di = normalizeDeliveryInfo(box.deliveryInfoRef);
                const shippedAt = di.shippedAt ? String(di.shippedAt) : "";
                const deliveredAt = di.deliveredAt
                  ? String(di.deliveredAt)
                  : "";
                const pickedUpAt = di.pickedUpAt ? String(di.pickedUpAt) : "";
                const status = getShippingStatus(box);
                const requestCount = (box as any)?.requestCount || 1;
                const requests = (box as any)?.requests || [];
                const firstRequest = requests[0] || {};
                const mailboxCode = String(
                  box.mailboxAddress || box.boxKey || "",
                ).trim();
                const requestorBusiness = String(
                  firstRequest?.requestor?.business || "",
                ).trim();
                const boxId = String(box._id || box.trackingNumber);
                const isExpanded = expandedBoxes.has(boxId);

                const toggleExpanded = () => {
                  console.log(
                    `[DEBUG_CLICK] toggleExpanded called for boxId: ${boxId}, isExpanded: ${isExpanded}`,
                  );
                  const newSet = new Set(expandedBoxes);
                  if (newSet.has(boxId)) {
                    newSet.delete(boxId);
                    console.log(
                      `[DEBUG_CLICK] Removed ${boxId}, new size: ${newSet.size}`,
                    );
                  } else {
                    newSet.add(boxId);
                    console.log(
                      `[DEBUG_CLICK] Added ${boxId}, new size: ${newSet.size}`,
                    );
                  }
                  setExpandedBoxes(newSet);
                };

                return (
                  <div
                    key={boxId}
                    className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded();
                      }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded whitespace-nowrap">
                            {requestCount}건
                          </span>
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded whitespace-nowrap ${
                              status === "배송완료"
                                ? "bg-green-100 text-green-800"
                                : status === "집하완료"
                                  ? "bg-blue-100 text-blue-800"
                                  : status === "배송중"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {status}
                          </span>
                          <span className="text-sm text-gray-600">
                            {mailboxCode || "-"}
                            {requestorBusiness ? ` / ${requestorBusiness}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {di.carrier || "-"}
                          </span>
                          <button className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                            {isExpanded ? "▼" : "▶"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-4 space-y-3">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">
                              접수(발송)
                            </div>
                            <div className="text-sm font-medium">
                              {formatDateTime(shippedAt) || "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">
                              집하완료
                            </div>
                            <div className="text-sm font-medium">
                              {formatDateTime(pickedUpAt) || "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">
                              배송완료
                            </div>
                            <div className="text-sm font-medium">
                              {formatDateTime(deliveredAt) || "-"}
                            </div>
                          </div>
                        </div>

                        {requests.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-500 mb-2 font-medium">
                              포함된 의뢰
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                              {requests.map((req: any) => {
                                const ci: any = req.caseInfos || {};
                                return (
                                  <div
                                    key={String(req._id || req.requestId)}
                                    className="text-sm bg-white p-2 rounded border border-gray-200"
                                  >
                                    <div className="font-medium">
                                      {req.requestId || "-"}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      {ci.clinicName || "-"}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      {ci.patientName || "-"} /{" "}
                                      {ci.tooth || "-"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!loading && shippingRows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  조회 결과가 없습니다.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
