import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { generateModelNumber } from "@/utils/modelNumber";
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
import { FlaskConical, Trash2 } from "lucide-react";
import type { DeliveryInfoSummary } from "@/types/request";
import { toKstYmd, formatKstDateTimeToKo } from "@/shared/date/kst";
import { usePeriodStore } from "@/store/usePeriodStore";
import {
  deriveStageForFilter,
  type ManufacturerRequest,
} from "../utils/request";
import { useWorksheetRealtimeStatus } from "../hooks/useWorksheetRealtimeStatus";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";

type InquiryTab = "process" | "shipping" | "udi";

type ProcessStage = "전체" | "의뢰" | "CAM" | "생산" | "발송" | "추적관리";
type RecallStartStage = "의뢰" | "CAM" | "가공";

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

  const modelNum = generateModelNumber((req as any)?.caseInfos);
  if (modelNum) {
    return `${formatted} (${modelNum})`;
  }
  return formatted;
};

const formatDateTime = (d?: string) => {
  return formatKstDateTimeToKo(d);
};

const TRACKING_ELIGIBLE_WORKFLOW_CODES = new Set([
  "accepted",
  "picked_up",
  "completed",
]);

/**
 * 추적관리 카드 노출 기준(SSOT)
 *
 * - 추적관리 단계로 넘어간 건은 항상 노출
 * - 포장.발송 단계라도 한진 접수(accepted) 이후 건만 노출
 * - printed(운송장만 출력) 상태는 아직 우편함 내부 작업이므로 노출하지 않음
 *
 * 주의: trackingNumber 존재만으로는 노출하지 않는다.
 * 운송장 출력 시점에도 trackingNumber가 선발급될 수 있기 때문.
 */
const isTrackingEligible = (req: ManufacturerRequest) => {
  const stage = String(req.manufacturerStage || "").trim();
  if (stage === "추적관리") return true;

  const di = normalizeDeliveryInfo(req.deliveryInfoRef);
  const workflowCode = String(
    (req as any)?.shippingWorkflow?.code || "",
  ).trim();

  if (TRACKING_ELIGIBLE_WORKFLOW_CODES.has(workflowCode)) return true;
  if (di.pickedUpAt || di.deliveredAt) return true;

  // 예기치 않은 데이터(배송 이벤트는 있는데 workflow가 비정상) 진단용 로그
  if (di.shippedAt && !workflowCode) {
    console.error("[tracking][ineligible-shipped-without-workflow]", {
      requestId: String(req?.requestId || "").trim() || null,
      stage,
      shippedAt: di.shippedAt,
      mailboxAddress: String((req as any)?.mailboxAddress || "").trim() || null,
    });
  }

  return false;
};

const getShippingStatus = (req: ManufacturerRequest) => {
  const di = normalizeDeliveryInfo(req.deliveryInfoRef);
  const lastStatusText = String(di?.tracking?.lastStatusText || "").trim();
  if (di.deliveredAt) return "배송완료";
  if (lastStatusText) return lastStatusText;

  const workflowCode = String(
    (req as any)?.shippingWorkflow?.code || "",
  ).trim();
  if (
    TRACKING_ELIGIBLE_WORKFLOW_CODES.has(workflowCode) ||
    di.pickedUpAt ||
    di.shippedAt
  ) {
    return "접수";
  }
  return "-";
};

export const TrackingInquiryPage = () => {
  const { token } = useAuthStore();
  const { period } = usePeriodStore();
  const { toast } = useToast();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();

  const [tab, setTab] = useState<InquiryTab>("shipping");
  const [visibleCount, setVisibleCount] = useState(12);
  const visibleCountRef = useRef(12);
  const totalCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onScrollRef = useRef<(() => void) | null>(null);
  const onWheelRef = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [recallMode, setRecallMode] = useState(false);
  const [recallStartStage, setRecallStartStage] =
    useState<RecallStartStage>("의뢰");
  const [recallFromDate, setRecallFromDate] = useState("");
  const [recallToDate, setRecallToDate] = useState("");
  const [selectedRecallRequestIds, setSelectedRecallRequestIds] = useState<
    Set<string>
  >(new Set());
  const [recallSubmitting, setRecallSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    null | (() => Promise<void> | void)
  >(null);
  const fetchSequenceRef = useRef(0);
  // Network pagination per stage (tracking)
  const PAGE_LIMIT = 50;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const userScrolledRef = useRef(false);

  const matchesCurrentPage = useCallback((req: ManufacturerRequest) => {
    // 추적관리 화면은 원본(normal) 의뢰만 노출
    if (String((req as any)?.source || "").trim() === "manufacturer_sample") {
      return false;
    }

    const stage = deriveStageForFilter(req);
    if (stage === "추적관리") return true;
    if (stage !== "포장.발송") return false;
    return isTrackingEligible(req);
  }, []);

  useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests,
    matchesCurrentPage,
  });

  const getStableRequestKey = useCallback((item: ManufacturerRequest) => {
    const key = String((item as any)?._id || item?.requestId || "").trim();
    if (!key) {
      console.error("[tracking][missing-request-key]", {
        requestId: String(item?.requestId || "").trim() || null,
        stage: String(item?.manufacturerStage || "").trim() || null,
      });
    }
    return key;
  }, []);

  const fetchTrackingPage = useCallback(
    async (page: number) => {
      if (!token) return [] as ManufacturerRequest[];
      const url = new URL("/api/requests/all", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(PAGE_LIMIT));
      url.searchParams.set("view", "worksheet");
      url.searchParams.set("worksheetProfile", "tracking");
      url.searchParams.set("includeTotal", "0");
      url.searchParams.set("includeDelivery", "1");
      const res = await fetch(url.pathname + url.search, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-cache",
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "의뢰 목록 조회에 실패했습니다.");
      }
      return Array.isArray(body?.data?.requests)
        ? (body.data.requests as ManufacturerRequest[])
        : [];
    },
    [token],
  );

  const runTrackingFetch = useCallback(
    async ({
      silent = false,
      append = false,
    }: { silent?: boolean; append?: boolean } = {}) => {
      if (!token) return;
      const fetchSeq = ++fetchSequenceRef.current;
      isFetchingPageRef.current = true;
      try {
        if (!silent) setLoading(true);

        const list = await fetchTrackingPage(pageRef.current);

        // 늦게 도착한 이전 응답은 폐기
        if (fetchSeq !== fetchSequenceRef.current) return;

        if (append) {
          setRequests((prev) => {
            const map = new Map<string, ManufacturerRequest>();
            for (const r of prev) {
              const key = getStableRequestKey(r);
              if (!key) continue;
              map.set(key, r);
            }
            for (const r of list) {
              const key = getStableRequestKey(r);
              if (!key) continue;
              map.set(key, r);
            }
            return Array.from(map.values());
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
        if (fetchSeq === fetchSequenceRef.current) {
          isFetchingPageRef.current = false;
        }
        if (!silent) setLoading(false);
      }
    },
    [fetchTrackingPage, getStableRequestKey, token, toast],
  );

  useEffect(() => {
    if (!token) return;

    // initial load or token change → reset paging
    pageRef.current = 1;
    hasMoreRef.current = true;
    lastFetchTimeRef.current = 0;
    void runTrackingFetch({ silent: false, append: false });

    (window as any).__trackingFetchNext = async () => {
      if (isFetchingPageRef.current || !hasMoreRef.current) return;
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 500) return;
      lastFetchTimeRef.current = now;
      pageRef.current += 1;
      await runTrackingFetch({ silent: true, append: true });
    };

    return () => {
      delete (window as any).__trackingFetchNext;
    };
  }, [runTrackingFetch, token]);

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

    if (period === "7d") {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { fromDate: startOfDay(from), toDate: endOfDay(today) };
    }
    if (period === "30d") {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { fromDate: startOfDay(from), toDate: endOfDay(today) };
    }
    if (period === "90d") {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      return { fromDate: startOfDay(from), toDate: endOfDay(today) };
    }
    if (period === "lastMonth") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0);
      return { fromDate: startOfDay(from), toDate: endOfDay(to) };
    }

    const year = today.getFullYear();
    const month = today.getMonth();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    return { fromDate: startOfDay(from), toDate: endOfDay(to) };
  }, [period]);

  const requestSearchTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      const key = getStableRequestKey(r);
      if (!key) continue;
      const ci: any = r.caseInfos || {};
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const lotMaterial = String(r.lotNumber?.material || "");
      const lotValue = String(r.lotNumber?.value || "");
      map.set(
        key,
        (
          String(r.requestId || "") +
          String(r.assignedMachine || "") +
          String(ci.patientName || "") +
          String(ci.tooth || "") +
          String(ci.clinicName || "") +
          lotMaterial +
          lotValue +
          String(di.trackingNumber || "")
        ).toLowerCase(),
      );
    }
    return map;
  }, [getStableRequestKey, requests]);

  const baseFiltered = useMemo(() => {
    const fromTs = fromDate ? fromDate.getTime() : null;
    const toTs = toDate ? toDate.getTime() : null;
    const out: ManufacturerRequest[] = [];

    for (const r of requests) {
      if (String((r as any)?.source || "").trim() === "manufacturer_sample") {
        continue;
      }

      const stage = String(r.manufacturerStage || "").trim();

      // 추적관리 단계는 '완료' 성격이므로, 완료포함 토글과 무관하게 항상 표시
      if (stage !== "추적관리" && !showCompleted && isDone(r)) {
        continue;
      }

      // 추적관리 노출 기준 SSOT
      if (stage !== "추적관리" && !isTrackingEligible(r)) {
        continue;
      }

      if (fromTs !== null || toTs !== null) {
        const di = normalizeDeliveryInfo(r.deliveryInfoRef);
        const base = di.deliveredAt || di.shippedAt || r.createdAt;
        if (!base) continue;
        const t = new Date(base).getTime();
        if (!Number.isFinite(t)) continue;
        if (fromTs !== null && t < fromTs) continue;
        if (toTs !== null && t > toTs) continue;
      }

      if (searchLower) {
        const key = getStableRequestKey(r);
        const hay = key ? requestSearchTextMap.get(key) || "" : "";
        if (!hay.includes(searchLower)) continue;
      }

      out.push(r);
    }

    return out;
  }, [
    fromDate,
    getStableRequestKey,
    requestSearchTextMap,
    requests,
    searchLower,
    showCompleted,
    toDate,
  ]);

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

  const handleDownloadTodayShipping = async () => {
    const XLSX = await import("xlsx");
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

  const handleDownloadUdi = async () => {
    const XLSX = await import("xlsx");
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

  const executeDeleteSampleRequest = useCallback(
    async (r: ManufacturerRequest) => {
      if (!r?._id) return;

      try {
        const res = await fetch(`/api/requests/${r._id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "삭제에 실패했습니다.");
        }

        toast({
          title: "삭제 완료",
          description: `의뢰 ${r.requestId}가 삭제되었습니다.`,
        });

        setRequests((prev) =>
          prev.filter(
            (item) => String(item?._id || "") !== String(r._id || ""),
          ),
        );
      } catch (e: any) {
        toast({
          title: "삭제 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [token, toast],
  );

  const handleDeleteSampleRequest = useCallback(
    (r: ManufacturerRequest) => {
      if (!r?._id) return;
      setConfirmTitle("R&D 샘플 삭제");
      setConfirmDescription(`의뢰 ${r.requestId}를 삭제하시겠습니까?`);
      setConfirmAction(() => async () => {
        await executeDeleteSampleRequest(r);
      });
      setConfirmOpen(true);
    },
    [executeDeleteSampleRequest],
  );

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
    const only = baseFiltered;

    // 우편함 단위로 그룹핑
    // 집하 단위 SSOT: trackingNumber가 있으면 같은 송장 = 같은 집하 박스
    // trackingNumber 없는 경우: mailboxAddress + (집하일/발송일) 날짜(KST) 조합으로 묶어
    // 날짜 정보가 없으면 절대 mailboxAddress 단독으로 묶지 않고 개별 의뢰로 분리한다.
    // (기간이 넓을 때 서로 다른 날짜 의뢰가 한 카드로 합쳐져 누락처럼 보이는 현상 방지)
    const boxMap = new Map<string, ManufacturerRequest[]>();
    for (const r of only) {
      const di = normalizeDeliveryInfo(r.deliveryInfoRef);
      const trackingNumber = String(di?.trackingNumber || "").trim();
      const shippingPackageId = String(
        (r as any)?.shippingPackageId?._id ||
          (r as any)?.shippingPackageId ||
          "",
      ).trim();
      const mailboxAddress = String(r?.mailboxAddress || "").trim();
      const pickedUpAt = String(di?.pickedUpAt || "").trim();
      const shippedAt = String(di?.shippedAt || "").trim();
      const pickedUpYmd = pickedUpAt
        ? toKstYmd(new Date(pickedUpAt)) || pickedUpAt.slice(0, 10)
        : "";
      const shippedYmd = shippedAt
        ? toKstYmd(new Date(shippedAt)) || shippedAt.slice(0, 10)
        : "";
      const dayKey = pickedUpYmd || shippedYmd;
      const fallbackRequestId = String(r?.requestId || r?._id || "").trim();

      // 서로 다른 기공소 건이 같은 카드로 섞이지 않도록 사업자 앵커 기준 키를 항상 먼저 만든다.
      // request.businessAnchorId가 SSOT이고, 과거 데이터 보정 전에는 requestor.businessAnchorId를 보조로 사용한다.
      const requestAnchorId = String(
        (r as any)?.businessAnchorId?._id || (r as any)?.businessAnchorId || "",
      ).trim();
      const requestorAnchorId = String(
        (r as any)?.requestor?.businessAnchorId || "",
      ).trim();
      const ownerAnchorId = requestAnchorId || requestorAnchorId;
      if (!ownerAnchorId) {
        // business 문자열 fallback으로 묶지 않는다.
        // 앵커가 없으면 병합 대신 개별 카드로 분리해 오염 전파를 막는다.
        console.error("[tracking][missing-owner-anchor]", {
          requestId: fallbackRequestId || null,
          requestAnchorId: requestAnchorId || null,
          requestorAnchorId: requestorAnchorId || null,
          mailboxAddress: mailboxAddress || null,
          trackingNumber: trackingNumber || null,
          shippingPackageId: shippingPackageId || null,
        });
      }

      const ownerKey = ownerAnchorId || `request:${fallbackRequestId}`;

      // 카드 그룹핑 SSOT 우선순위
      // 1) trackingNumber: 실제 배송 단위를 가장 잘 대표 (중복 shippingPackageId가 있어도 하나로 묶어야 함)
      // 2) shippingPackageId: trackingNumber가 없을 때만 사용
      // 3) mailboxAddress + dayKey
      // 4) fallback request 단위
      const boxKey = trackingNumber
        ? `tn:${ownerKey}:${trackingNumber}`
        : shippingPackageId
          ? `sp:${ownerKey}:${shippingPackageId}`
          : mailboxAddress && dayKey
            ? `mb:${ownerKey}:${mailboxAddress}:${dayKey}`
            : `request:${fallbackRequestId}`;
      if (!boxMap.has(boxKey)) {
        boxMap.set(boxKey, []);
      }
      boxMap.get(boxKey)!.push(r);
    }

    // 우편함별 대표 정보 생성 (첫 번째 의뢰건 기준)
    const boxes = Array.from(boxMap.entries()).map(([boxKey, requests]) => {
      const firstRequest = requests[0];
      const di = normalizeDeliveryInfo(firstRequest.deliveryInfoRef);
      const shippingPackageId = String(
        firstRequest?.shippingPackageId || "",
      ).trim();
      const mailboxAddress = String(firstRequest?.mailboxAddress || "").trim();
      const trackingNumber = String(di?.trackingNumber || "").trim() || null;
      return {
        boxKey,
        shippingPackageId,
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

    const getLatestBoxTime = (box: any) => {
      const shippedAt = String(box?.shippedAt || "").trim();
      const pickedUpAt = String(box?.pickedUpAt || "").trim();
      const deliveredAt = String(box?.deliveredAt || "").trim();

      // 정렬 기준은 '접수(발송)' 시각을 최우선으로 사용한다.
      // (사용자 눈에 보이는 카드 순서가 접수 시간 최신순과 일치하도록)
      const primary = shippedAt || pickedUpAt || deliveredAt;
      if (primary) {
        const t = new Date(primary).getTime();
        if (Number.isFinite(t) && t > 0) return t;
      }

      // 배송 이벤트가 없으면 포함 의뢰의 생성시각 중 가장 최신값을 사용한다.
      const requests = Array.isArray(box?.requests) ? box.requests : [];
      let latestCreatedAt = 0;
      for (const req of requests) {
        const t = new Date(String(req?.createdAt || 0)).getTime();
        if (Number.isFinite(t) && t > latestCreatedAt) {
          latestCreatedAt = t;
        }
      }
      if (latestCreatedAt > 0) return latestCreatedAt;

      const fallback = new Date(String(box?.createdAt || 0)).getTime();
      return Number.isFinite(fallback) ? fallback : 0;
    };

    return boxes.slice().sort((a, b) => {
      return getLatestBoxTime(b) - getLatestBoxTime(a);
    });
  }, [baseFiltered]);

  const shippingColumns = useMemo(() => {
    type ShippingColumnItem = {
      box: any;
      summaryDate: string;
    };

    const grouped: Record<
      "accepted" | "pickedUp" | "delivered",
      ShippingColumnItem[]
    > = {
      accepted: [],
      pickedUp: [],
      delivered: [],
    };

    for (const box of shippingRows.slice(0, visibleCount) as any[]) {
      const di = normalizeDeliveryInfo(box.deliveryInfoRef);
      const shippedAt = String(di?.shippedAt || "").trim();
      const pickedUpAt = String(di?.pickedUpAt || "").trim();
      const deliveredAt = String(di?.deliveredAt || "").trim();
      const requests = Array.isArray(box?.requests) ? box.requests : [];

      const createdAtYmdList: string[] = requests
        .map((req: any) => formatYmd(String(req?.createdAt || "")))
        .filter((v: string) => v && v !== "-");
      const uniqueCreatedAtYmd: string[] = Array.from(
        new Set<string>(createdAtYmdList),
      ).sort();
      const requestDateLabel =
        uniqueCreatedAtYmd.length === 0
          ? "-"
          : uniqueCreatedAtYmd.length === 1
            ? uniqueCreatedAtYmd[0]
            : `${uniqueCreatedAtYmd[0]} ~ ${
                uniqueCreatedAtYmd[uniqueCreatedAtYmd.length - 1]
              }`;

      if (deliveredAt) {
        grouped.delivered.push({ box, summaryDate: formatYmd(deliveredAt) });
        continue;
      }

      if (pickedUpAt) {
        grouped.pickedUp.push({ box, summaryDate: formatYmd(pickedUpAt) });
        continue;
      }

      const shippedDate = formatYmd(shippedAt);
      grouped.accepted.push({
        box,
        summaryDate: shippedDate !== "-" ? shippedDate : requestDateLabel,
      });
    }

    return [
      { key: "accepted", title: "발송접수", items: grouped.accepted },
      { key: "pickedUp", title: "집하완료", items: grouped.pickedUp },
      { key: "delivered", title: "배송완료", items: grouped.delivered },
    ];
  }, [shippingRows, visibleCount]);

  const recallSelectableRequests = useMemo(() => {
    const map = new Map<string, ManufacturerRequest>();
    for (const box of shippingRows as any[]) {
      const reqs = Array.isArray(box?.requests) ? box.requests : [];
      for (const req of reqs) {
        const key = String(req?._id || "").trim();
        if (!key) continue;
        map.set(key, req);
      }
    }
    return Array.from(map.values());
  }, [shippingRows]);

  const applyRecallPeriodSelection = useCallback(() => {
    if (!recallFromDate || !recallToDate) {
      toast({
        title: "기간 선택 필요",
        description: "from/to 날짜를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const from = new Date(`${recallFromDate}T00:00:00`);
    const to = new Date(`${recallToDate}T23:59:59.999`);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from > to
    ) {
      toast({
        title: "기간 오류",
        description: "올바른 기간을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setSelectedRecallRequestIds((prev) => {
      const next = new Set(prev);
      for (const req of recallSelectableRequests) {
        const di = normalizeDeliveryInfo(req.deliveryInfoRef);
        const base = di.deliveredAt || di.shippedAt || req.createdAt;
        const key = String(req?._id || "").trim();
        if (!base || !key) continue;
        const t = new Date(base);
        if (Number.isNaN(t.getTime())) continue;
        if (t >= from && t <= to) {
          next.add(key);
        }
      }
      return next;
    });
  }, [recallFromDate, recallToDate, recallSelectableRequests, toast]);

  const executeRecallClone = useCallback(
    async (ids: string[], startStage: RecallStartStage) => {
      if (recallSubmitting) return;
      try {
        setRecallSubmitting(true);
        const res = await fetch(`/api/requests/remake-clone`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestIds: ids,
            startStage,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "재제작 복사에 실패했습니다.");
        }

        const successCount = Number(data?.data?.successCount || 0);
        const failedCount = Number(data?.data?.failedCount || 0);
        toast({
          title: "재제작 복사 완료",
          description: `${successCount}건 성공${failedCount ? `, ${failedCount}건 실패` : ""}`,
        });

        setRecallMode(false);
        setSelectedRecallRequestIds(new Set());
        setRecallFromDate("");
        setRecallToDate("");
        setRecallStartStage("의뢰");
      } catch (e: any) {
        toast({
          title: "재제작 복사 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      } finally {
        setRecallSubmitting(false);
      }
    },
    [recallSubmitting, toast, token],
  );

  const handleRecallClone = useCallback(() => {
    const ids = Array.from(selectedRecallRequestIds);
    if (!ids.length) {
      toast({
        title: "선택 필요",
        description: "재제작할 의뢰를 선택하거나 기간 선택을 적용해주세요.",
        variant: "destructive",
      });
      return;
    }

    const stageSnapshot = recallStartStage;
    setConfirmTitle("재제작 복사 실행");
    setConfirmDescription(
      `선택한 ${ids.length}건을 ${stageSnapshot} 공정으로 복사할까요?\n(원본 의뢰는 그대로 유지됩니다.)`,
    );
    setConfirmAction(() => async () => {
      await executeRecallClone(ids, stageSnapshot);
    });
    setConfirmOpen(true);
  }, [executeRecallClone, recallStartStage, selectedRecallRequestIds, toast]);

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
    setSelectedRecallRequestIds((prev) => {
      if (!prev.size) return prev;
      const valid = new Set(
        recallSelectableRequests
          .map((r) => String(r?._id || "").trim())
          .filter(Boolean),
      );
      const next = new Set(
        Array.from(prev).filter((id) => valid.has(String(id || ""))),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [recallSelectableRequests]);

  useEffect(() => {
    if (tab === "shipping") return;
    if (!recallMode) return;
    setRecallMode(false);
    setSelectedRecallRequestIds(new Set());
    setRecallFromDate("");
    setRecallToDate("");
    setRecallStartStage("의뢰");
  }, [tab, recallMode]);

  const currentRows =
    tab === "process"
      ? processRows
      : tab === "shipping"
        ? shippingRows
        : udiRows;
  totalCountRef.current = currentRows.length;

  useEffect(() => {
    visibleCountRef.current = 12;
    setVisibleCount(12);
    userScrolledRef.current = false;

    setSelectedRecallRequestIds(new Set());
    setRecallFromDate("");
    setRecallToDate("");
    setRecallStartStage("의뢰");
    if (tab !== "shipping") {
      setRecallMode(false);
    }
  }, [tab, period, worksheetSearch, showCompleted]);

  // 목표 표시 건수(visibleCount)를 채울 때까지 페이지를 추가 로드한다.
  // - 초기 로드: 12건 채울 때까지
  // - 스크롤 하단 도달: +12 목표를 채울 때까지
  useEffect(() => {
    if (!token) return;
    if (loading) return;
    if (currentRows.length >= visibleCount) return;
    if (!hasMoreRef.current || isFetchingPageRef.current) return;

    void (window as any).__trackingFetchNext?.();
  }, [
    token,
    loading,
    currentRows.length,
    visibleCount,
    tab,
    period,
    worksheetSearch,
    showCompleted,
  ]);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    if (scrollRef.current && onScrollRef.current) {
      scrollRef.current.removeEventListener("scroll", onScrollRef.current);
      onScrollRef.current = null;
    }
    if (scrollRef.current && onWheelRef.current) {
      scrollRef.current.removeEventListener("wheel", onWheelRef.current);
      onWheelRef.current = null;
    }
    scrollRef.current = node;
    if (!node) return;

    const maybeLoadMore = () => {
      const nearBottom =
        node.scrollTop + node.clientHeight >= node.scrollHeight - 200;
      // Only after explicit user scroll
      if (!nearBottom || !userScrolledRef.current) return;

      // 이미 가진 데이터 범위 내에서만 표시 건수 증가 (불필요한 re-render 방지)
      if (visibleCountRef.current < totalCountRef.current) {
        visibleCountRef.current = Math.min(
          visibleCountRef.current + 12,
          totalCountRef.current,
        );
        setVisibleCount(visibleCountRef.current);
      }

      // 현재 보유 데이터가 부족하면 다음 페이지 로드
      if (
        visibleCountRef.current >= totalCountRef.current - 3 &&
        hasMoreRef.current
      ) {
        void (window as any).__trackingFetchNext?.();
      }
    };

    const onScroll = () => {
      userScrolledRef.current = true;
      maybeLoadMore();
    };
    const onWheel = () => {
      userScrolledRef.current = true;
      maybeLoadMore();
    };
    onScrollRef.current = onScroll;
    onWheelRef.current = onWheel;
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("wheel", onWheel, { passive: true });
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
            <div className="ml-auto flex items-center gap-2">
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
              {tab === "shipping" && (
                <Button
                  variant={recallMode ? "default" : "outline"}
                  size="sm"
                  className="px-4"
                  onClick={() => {
                    if (recallSubmitting) return;
                    setRecallMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setSelectedRecallRequestIds(new Set());
                        setRecallFromDate("");
                        setRecallToDate("");
                        setRecallStartStage("의뢰");
                      }
                      return next;
                    });
                  }}
                >
                  재제작
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
                    <TableHead className="text-center">액션</TableHead>
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
                    const stage = String(r.manufacturerStage || "").trim();
                    const isDelivered = !!di.deliveredAt;
                    const isTrackingStage = stage === "추적관리";
                    const isSampleRequest =
                      String((r as any)?.source || "").trim() ===
                      "manufacturer_sample";
                    const canCloneAsSample =
                      !isSampleRequest && (isTrackingStage || isDelivered);
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {canCloneAsSample && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(
                                      `/api/requests/${r._id}/clone-as-sample`,
                                      {
                                        method: "POST",
                                        headers: {
                                          Authorization: `Bearer ${token}`,
                                          "Content-Type": "application/json",
                                        },
                                      },
                                    );
                                    const data = await res.json();
                                    if (data.success) {
                                      toast({
                                        title: "R&D 샘플 복사 완료",
                                        description: `새 의뢰ID: ${data.data.requestId}`,
                                      });
                                    } else {
                                      toast({
                                        title: "복사 실패",
                                        description:
                                          data.message || "알 수 없는 오류",
                                        variant: "destructive",
                                      });
                                    }
                                  } catch (e: any) {
                                    toast({
                                      title: "복사 실패",
                                      description:
                                        e?.message || "네트워크 오류",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <FlaskConical className="h-4 w-4 mr-1" />
                                R&D
                              </Button>
                            )}
                            {isSampleRequest && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                  void handleDeleteSampleRequest(r)
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                삭제
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!loading && processRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
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
              {recallMode && (
                <div className="rounded-lg border bg-amber-50 p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      재제작 시작 공정:
                    </span>
                    {(["의뢰", "CAM", "가공"] as RecallStartStage[]).map(
                      (stage) => (
                        <Button
                          key={stage}
                          type="button"
                          size="sm"
                          variant={
                            recallStartStage === stage ? "default" : "outline"
                          }
                          onClick={() => setRecallStartStage(stage)}
                          disabled={recallSubmitting}
                        >
                          {stage}
                        </Button>
                      ),
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">기간 선택:</span>
                    <input
                      type="date"
                      value={recallFromDate}
                      onChange={(e) => setRecallFromDate(e.target.value)}
                      className="h-8 rounded-md border px-2 text-sm"
                      disabled={recallSubmitting}
                    />
                    <span className="text-sm text-gray-500">~</span>
                    <input
                      type="date"
                      value={recallToDate}
                      onChange={(e) => setRecallToDate(e.target.value)}
                      className="h-8 rounded-md border px-2 text-sm"
                      disabled={recallSubmitting}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={applyRecallPeriodSelection}
                      disabled={recallSubmitting}
                    >
                      기간 의뢰 선택
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const ids = recallSelectableRequests
                          .map((r) => String(r?._id || "").trim())
                          .filter(Boolean);
                        setSelectedRecallRequestIds(new Set(ids));
                      }}
                      disabled={recallSubmitting}
                    >
                      전체선택
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedRecallRequestIds(new Set())}
                      disabled={recallSubmitting}
                    >
                      선택취소
                    </Button>
                    <span className="text-sm text-gray-600">
                      선택 {selectedRecallRequestIds.size}건 / 전체{" "}
                      {recallSelectableRequests.length}건
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (recallSubmitting) return;
                          setRecallMode(false);
                          setSelectedRecallRequestIds(new Set());
                          setRecallFromDate("");
                          setRecallToDate("");
                          setRecallStartStage("의뢰");
                        }}
                        disabled={recallSubmitting}
                      >
                        종료
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleRecallClone()}
                        disabled={recallSubmitting}
                      >
                        {recallSubmitting ? "재제작 복사 중..." : "재제작 실행"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                {shippingColumns.map((column) => (
                  <div
                    key={column.key}
                    className="rounded-lg border bg-slate-50/60 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-sm font-semibold text-gray-700">
                        {column.title}
                      </h4>
                      <span className="text-xs text-gray-500">
                        {column.items.length}건
                      </span>
                    </div>

                    <div className="space-y-2">
                      {column.items.map(({ box, summaryDate }) => {
                        const di = normalizeDeliveryInfo(box.deliveryInfoRef);
                        const shippedAt = di.shippedAt
                          ? String(di.shippedAt)
                          : "";
                        const deliveredAt = di.deliveredAt
                          ? String(di.deliveredAt)
                          : "";
                        const pickedUpAt = di.pickedUpAt
                          ? String(di.pickedUpAt)
                          : "";
                        const requestCount = (box as any)?.requestCount || 1;
                        const requests = (box as any)?.requests || [];
                        const cardRequestIds = requests
                          .map((req: any) => String(req?._id || "").trim())
                          .filter(Boolean);
                        const allCardSelected =
                          cardRequestIds.length > 0 &&
                          cardRequestIds.every((id: string) =>
                            selectedRecallRequestIds.has(id),
                          );
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
                          const newSet = new Set(expandedBoxes);
                          if (newSet.has(boxId)) {
                            newSet.delete(boxId);
                          } else {
                            newSet.add(boxId);
                          }
                          setExpandedBoxes(newSet);
                        };

                        return (
                          <div
                            key={boxId}
                            className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow"
                          >
                            <div
                              className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded();
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {recallMode && (
                                      <label
                                        className="inline-flex items-center gap-1 text-[11px] text-gray-700"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={allCardSelected}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setSelectedRecallRequestIds(
                                              (prev) => {
                                                const next = new Set(prev);
                                                if (allCardSelected) {
                                                  cardRequestIds.forEach(
                                                    (id: string) =>
                                                      next.delete(id),
                                                  );
                                                } else {
                                                  cardRequestIds.forEach(
                                                    (id: string) =>
                                                      next.add(id),
                                                  );
                                                }
                                                return next;
                                              },
                                            );
                                          }}
                                        />
                                      </label>
                                    )}
                                    <span
                                      className="text-sm font-medium text-gray-700 truncate"
                                      title={mailboxCode || "-"}
                                    >
                                      {mailboxCode || "-"}
                                    </span>
                                  </div>
                                  <div
                                    className="text-xs text-gray-500 truncate"
                                    title={requestorBusiness || "-"}
                                  >
                                    {requestorBusiness || "-"}
                                  </div>
                                </div>
                                <button className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs">
                                  {isExpanded ? "▼" : "▶"}
                                </button>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                <span className="inline-block bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded whitespace-nowrap">
                                  {requestCount}건
                                </span>
                                <span className="text-gray-500 truncate">
                                  {summaryDate || "-"}
                                </span>
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
                                        const recallReqId = String(
                                          req?._id || "",
                                        ).trim();
                                        const recallChecked =
                                          recallReqId &&
                                          selectedRecallRequestIds.has(
                                            recallReqId,
                                          );
                                        const stage = String(
                                          req.manufacturerStage || "",
                                        ).trim();
                                        const di = normalizeDeliveryInfo(
                                          req.deliveryInfoRef,
                                        );
                                        const isDelivered = !!di.deliveredAt;
                                        const isTrackingStage =
                                          stage === "추적관리";
                                        const isSampleRequest =
                                          String(
                                            (req as any)?.source || "",
                                          ).trim() === "manufacturer_sample";
                                        const canCloneAsSample =
                                          !isSampleRequest &&
                                          (isTrackingStage || isDelivered);
                                        return (
                                          <div
                                            key={String(
                                              req._id || req.requestId,
                                            )}
                                            className="text-sm bg-white p-2 rounded border border-gray-200"
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                {recallMode && (
                                                  <input
                                                    type="checkbox"
                                                    checked={Boolean(
                                                      recallChecked,
                                                    )}
                                                    onChange={(e) => {
                                                      e.stopPropagation();
                                                      if (!recallReqId) return;
                                                      setSelectedRecallRequestIds(
                                                        (prev) => {
                                                          const next = new Set(
                                                            prev,
                                                          );
                                                          if (
                                                            next.has(
                                                              recallReqId,
                                                            )
                                                          ) {
                                                            next.delete(
                                                              recallReqId,
                                                            );
                                                          } else {
                                                            next.add(
                                                              recallReqId,
                                                            );
                                                          }
                                                          return next;
                                                        },
                                                      );
                                                    }}
                                                  />
                                                )}
                                                <div className="font-medium">
                                                  {req.requestId || "-"}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                {canCloneAsSample && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        const res = await fetch(
                                                          `/api/requests/${req._id}/clone-as-sample`,
                                                          {
                                                            method: "POST",
                                                            headers: {
                                                              Authorization: `Bearer ${token}`,
                                                              "Content-Type":
                                                                "application/json",
                                                            },
                                                          },
                                                        );
                                                        const data =
                                                          await res.json();
                                                        if (data.success) {
                                                          toast({
                                                            title:
                                                              "R&D 샘플 복사 완료",
                                                            description: `새 의뢰ID: ${data.data.requestId}`,
                                                          });
                                                        } else {
                                                          toast({
                                                            title: "복사 실패",
                                                            description:
                                                              data.message ||
                                                              "알 수 없는 오류",
                                                            variant:
                                                              "destructive",
                                                          });
                                                        }
                                                      } catch (e: any) {
                                                        toast({
                                                          title: "복사 실패",
                                                          description:
                                                            e?.message ||
                                                            "네트워크 오류",
                                                          variant:
                                                            "destructive",
                                                        });
                                                      }
                                                    }}
                                                  >
                                                    <FlaskConical className="h-3 w-3 mr-1" />
                                                    R&D
                                                  </Button>
                                                )}
                                                {isSampleRequest && (
                                                  <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      void handleDeleteSampleRequest(
                                                        req,
                                                      );
                                                    }}
                                                  >
                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                    삭제
                                                  </Button>
                                                )}
                                              </div>
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

                      {column.items.length === 0 && (
                        <div className="rounded-md border border-dashed bg-white/70 px-3 py-6 text-center text-xs text-gray-400">
                          데이터 없음
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!loading && shippingRows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  조회 결과가 없습니다.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="확인"
        cancelLabel="취소"
        onConfirm={async () => {
          if (!confirmAction) return;
          const action = confirmAction;
          setConfirmOpen(false);
          setConfirmAction(null);
          try {
            await action();
          } catch (error) {
            console.error("Confirm action failed:", error);
          }
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
};
