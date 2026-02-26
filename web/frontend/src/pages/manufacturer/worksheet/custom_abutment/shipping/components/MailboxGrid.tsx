import { useMemo, useState, useRef, useEffect } from "react";
import type { ManufacturerRequest } from "../../utils/request";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";

type MailboxGridProps = {
  requests: ManufacturerRequest[];
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
};

const HANJIN_DEV_TEST_PAYLOAD = {
  mailboxes: ["DEVTESTA1"],
  shipments: [
    {
      requestId: "DEV-REQ-0001",
      mongoId: "000000000000000000000001",
      mailboxAddress: "DEVTESTA1",
      clinicName: "테스트치과",
      patientName: "홍길동",
      tooth: "#11",
      receiverName: "테스트 담당자",
      receiverPhone: "02-0000-0000",
      receiverAddress: "서울특별시 강남구 테스트로 123",
      receiverZipCode: "06236",
      shippingMode: "normal",
    },
  ],
};

const HANJIN_DEV_TEST_WEBHOOK = {
  mock: true,
  trackingNumber: "DEVTEST123456",
  carrier: "hanjin",
  shippedAt: new Date().toISOString(),
  events: [
    {
      statusCode: "DLV",
      statusText: "배송완료",
      occurredAt: new Date().toISOString(),
      location: "서울강남",
      description: "테스트 배송 완료",
    },
  ],
};

const callHanjinApi = async ({
  path,
  mailboxAddresses,
  payload,
}: {
  path: string;
  mailboxAddresses?: string[];
  payload?: Record<string, any>;
}) => {
  const body: Record<string, unknown> = {};
  if (Array.isArray(mailboxAddresses)) {
    body.mailboxAddresses = mailboxAddresses;
  }
  if (payload) {
    body.payload = payload;
  }
  const response = await request<any>({
    path,
    method: "POST",
    jsonBody: body,
  });
  const responseBody = response.data as any;
  if (!response.ok || !responseBody?.success) {
    const message =
      responseBody?.message || `한진 API 호출 실패 (status=${response.status})`;
    throw new Error(message);
  }
  return responseBody?.data;
};

export const MailboxGrid = ({ requests, onBoxClick }: MailboxGridProps) => {
  const { toast } = useToast();
  // 선반: 가로 A~X (3개씩 묶음) / 세로 1~4
  // 서랍장(박스): 가로 A,B,C,D / 세로 1,2,3,4
  const shelfNames = Array.from({ length: 24 }, (_, i) =>
    String.fromCharCode(65 + i),
  ); // A to X
  const shelfGroups = useMemo(() => {
    const groups = [];
    // Limit to G-I (3 groups: A-C, D-F, G-I = 9 shelves A-I)
    for (let i = 0; i < Math.min(9, shelfNames.length); i += 3) {
      groups.push(shelfNames.slice(i, i + 3));
    }
    return groups;
  }, [shelfNames]);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [printedMailboxes, setPrintedMailboxes] = useState<Set<string>>(
    new Set(),
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [pickupRequested, setPickupRequested] = useState(false);
  const [devTestLoading, setDevTestLoading] = useState({
    label: false,
    order: false,
    webhook: false,
  });
  const [printerProfile, setPrinterProfile] = useState("");
  const [printerOptions, setPrinterOptions] = useState<string[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const storedProfile = localStorage.getItem("worksheet:printer:profile");
    if (storedProfile) setPrinterProfile(storedProfile);
  }, []);

  useEffect(() => {
    localStorage.setItem("worksheet:printer:profile", printerProfile);
  }, [printerProfile]);

  const shelfRows = ["1", "2", "3", "4"];
  const binCols = ["A", "B", "C", "D"];
  const binRows = ["1", "2", "3", "4"];

  const addressMap = useMemo(() => {
    const map = new Map<string, ManufacturerRequest[]>();
    for (const req of requests) {
      const addr = req.mailboxAddress;
      if (addr) {
        if (!map.has(addr)) map.set(addr, []);
        map.get(addr)!.push(req);
      }
    }
    return map;
  }, [requests]);

  // 발송일 기준으로 우편함 배경색 결정
  const getMailboxColorClass = (items: ManufacturerRequest[]) => {
    if (items.length === 0) return "bg-white border-slate-200";

    // 가장 빠른 발송 예정일 찾기
    const earliestShipDate = items.reduce((earliest, req) => {
      const shipYmd = req.timeline?.estimatedShipYmd;
      if (!shipYmd) return earliest;
      if (!earliest || shipYmd < earliest) return shipYmd;
      return earliest;
    }, "");

    if (!earliestShipDate) {
      // 발송일 정보 없음 - 기본 파란색
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    }

    // 오늘 날짜 (KST 기준 YYYY-MM-DD)
    const today = new Date();
    const kstOffset = 9 * 60; // KST = UTC+9
    const kstDate = new Date(today.getTime() + kstOffset * 60 * 1000);
    const todayYmd = kstDate.toISOString().split("T")[0];

    if (earliestShipDate === todayYmd) {
      // 오늘 발송 예정 - 파란색
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    } else if (earliestShipDate > todayYmd) {
      // 미래 발송 예정 - 회색
      return "bg-slate-50 border-slate-300 cursor-pointer hover:bg-slate-100 hover:shadow-md";
    } else {
      // 과거 발송 예정 (지연) - 빨간색
      return "bg-red-50 border-red-400 cursor-pointer hover:bg-red-100 hover:shadow-md";
    }
  };

  // Prevent browser back/forward on swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;

    // If swipe is less than 50px, prevent default (browser back/forward)
    if (Math.abs(diff) < 50) {
      e.preventDefault();
    }
  };

  // Scroll to selected group when button is clicked
  useEffect(() => {
    const currentGroup = shelfGroups[selectedGroupIdx];
    if (currentGroup && currentGroup.length > 0) {
      const firstShelfInGroup = currentGroup[0];
      const shelfElement = shelfRefs.current[firstShelfInGroup];
      if (shelfElement && scrollContainerRef.current) {
        const scrollLeft =
          shelfElement.offsetLeft - scrollContainerRef.current.offsetLeft - 16;
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, scrollLeft),
          behavior: "smooth",
        });
      }
    }
  }, [selectedGroupIdx, shelfGroups]);

  // Get all shelves up to I (first 9 shelves)
  const allShelvesToShow = shelfNames.slice(0, 9);

  // Get occupied mailbox addresses
  const occupiedAddresses = useMemo(() => {
    return Array.from(addressMap.keys());
  }, [addressMap]);

  const resolvePrintPayload = (payload: any) => {
    if (!payload) return null;
    if (typeof payload === "string" && payload.startsWith("http")) {
      return { url: payload };
    }

    const candidate = [
      payload.url,
      payload.pdfUrl,
      payload.labelUrl,
      payload.printUrl,
      payload.downloadUrl,
      payload.fileUrl,
      payload?.data?.url,
      payload?.data?.pdfUrl,
      payload?.data?.labelUrl,
      payload?.data?.printUrl,
      payload?.data?.downloadUrl,
    ].find((value) => typeof value === "string" && value.startsWith("http"));

    if (candidate) return { url: candidate };

    const base64 =
      payload.pdfBase64 ||
      payload.labelBase64 ||
      payload?.data?.pdfBase64 ||
      payload?.data?.labelBase64;
    if (typeof base64 === "string" && base64.length > 0) {
      return { base64 };
    }

    return null;
  };

  const fetchPrinters = async () => {
    setPrinterLoading(true);
    setPrinterError(null);
    try {
      const response = await fetch("http://localhost:5777/printers");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "프린터 목록을 불러올 수 없습니다.");
      }
      const printers = Array.isArray(data.printers) ? data.printers : [];
      setPrinterOptions(printers);
      if (!printerProfile && printers.length) {
        setPrinterProfile(printers[0]);
      }
    } catch (error) {
      setPrinterError((error as Error).message);
    } finally {
      setPrinterLoading(false);
    }
  };

  useEffect(() => {
    if (!printerModalOpen) return;
    if (!printerOptions.length) {
      void fetchPrinters();
    }
  }, [printerModalOpen, printerOptions.length]);

  const triggerLocalPrint = async (payload: any) => {
    const printPayload = resolvePrintPayload(payload);
    if (!printPayload) {
      toast({
        title: "출력 준비 실패",
        description: "운송장 응답에서 프린트 데이터를 찾지 못했습니다.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("http://localhost:5777/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...printPayload,
          printer: printerProfile || undefined,
          title: "Hanjin Label",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "로컬 프린터 출력에 실패했습니다.");
      }
    } catch (error) {
      toast({
        title: "로컬 출력 실패",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  // Handle printing shipping labels
  const handlePrintLabels = async () => {
    if (occupiedAddresses.length === 0) {
      toast({
        title: "우편함 없음",
        description: "운송장을 출력할 우편함이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const data = await callHanjinApi({
        path: "/api/requests/shipping/hanjin/print-labels",
        mailboxAddresses: occupiedAddresses,
      });
      await triggerLocalPrint(data);
      // Mark all occupied mailboxes as printed
      setPrintedMailboxes(new Set(occupiedAddresses));
      toast({
        title: "운송장 출력 완료",
        description: `${occupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`,
      });
    } catch (error) {
      console.error("운송장 출력 실패:", error);
      toast({
        title: "운송장 출력 실패",
        description: "운송장 출력에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Handle requesting or cancelling pickup
  const handlePickupAction = async () => {
    const printedAddresses = occupiedAddresses.filter((addr) =>
      printedMailboxes.has(addr),
    );

    if (!pickupRequested && printedAddresses.length === 0) {
      toast({
        title: "접수 불가",
        description:
          "택배 수거를 접수할 우편함이 없습니다. 먼저 운송장을 출력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    try {
      if (!pickupRequested) {
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup",
          mailboxAddresses: printedAddresses,
        });
        setPickupRequested(true);
        toast({
          title: "택배 수거 접수 완료",
          description: `${printedAddresses.length}개 우편함의 택배 수거가 접수되었습니다.`,
        });
      } else {
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup-cancel",
          mailboxAddresses: Array.from(printedMailboxes),
        });
        setPickupRequested(false);
        toast({
          title: "택배 수거 접수 취소",
          description: "택배 수거 접수가 취소되었습니다.",
        });
      }
    } catch (error) {
      console.error("택배 수거 처리 실패:", error);
      toast({
        title: pickupRequested ? "취소 실패" : "택배 수거 접수 실패",
        description: pickupRequested
          ? "택배 수거 접수 취소에 실패했습니다."
          : "택배 수거 접수에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
    }
  };

  const canRequestPickup =
    occupiedAddresses.filter((addr) => printedMailboxes.has(addr)).length > 0;

  const pickupButtonLabel = isRequestingPickup
    ? pickupRequested
      ? "취소 중..."
      : "접수 중..."
    : pickupRequested
      ? "↩️ 접수 취소"
      : "🚚 택배 접수";

  const runDevTest = async (
    kind: "label" | "order" | "webhook",
    task: () => Promise<void>,
  ) => {
    setDevTestLoading((prev) => ({ ...prev, [kind]: true }));
    try {
      await task();
      toast({
        title: "DEV 테스트 완료",
        description:
          kind === "webhook"
            ? "배송정보 수신 모의가 완료되었습니다."
            : kind === "order"
              ? "주문정보(수거) 송신이 완료되었습니다."
              : "운송장 출력 모의가 완료되었습니다.",
      });
    } catch (error) {
      console.error(`DEV 테스트(${kind}) 실패:`, error);
      toast({
        title: "DEV 테스트 실패",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDevTestLoading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const handleDevLabelTest = () =>
    runDevTest("label", async () => {
      await callHanjinApi({
        path: "/api/requests/shipping/hanjin/print-labels",
        payload: HANJIN_DEV_TEST_PAYLOAD,
      });
    });

  const handleDevOrderTest = () =>
    runDevTest("order", async () => {
      await callHanjinApi({
        path: "/api/requests/shipping/hanjin/pickup",
        payload: HANJIN_DEV_TEST_PAYLOAD,
      });
    });

  const handleDevWebhookTest = () =>
    runDevTest("webhook", async () => {
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/webhook-simulate",
        method: "POST",
        jsonBody: { payload: HANJIN_DEV_TEST_WEBHOOK },
      });
      const data = response.data as any;
      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || `Webhook 테스트 실패 (status=${response.status})`,
        );
      }
    });

  return (
    <div className="w-full flex flex-col h-full relative">
      {/* 고정 영역: 운송장 출력/택배 수거 접수 + 선반 그룹 버튼 */}
      <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        {/* DEV 테스트 버튼 */}
        <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 mt-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 uppercase tracking-wider">
            <span className="font-semibold">DEV API 테스트</span>
            <span className="text-[10px] text-slate-500">
              (한진 개발환경 주문/배송/웹훅 확인)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={handleDevOrderTest}
              disabled={devTestLoading.order}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${
                devTestLoading.order
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              {devTestLoading.order ? "송신 중..." : "① 주문정보 송신 테스트"}
              <div className="text-[11px] text-slate-500 mt-0.5">
                DEV API로 수거(ORDER) payload 전송
              </div>
            </button>
            <button
              onClick={handleDevWebhookTest}
              disabled={devTestLoading.webhook}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${
                devTestLoading.webhook
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              {devTestLoading.webhook ? "검증 중..." : "② 배송정보 수신 테스트"}
              <div className="text-[11px] text-slate-500 mt-0.5">
                webhook 시뮬레이터로 상태 업데이트 확인
              </div>
            </button>
            <button
              onClick={handleDevLabelTest}
              disabled={devTestLoading.label}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${
                devTestLoading.label
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              {devTestLoading.label ? "검수 중..." : "③ 운송장 인쇄 상태 검수"}
              <div className="text-[11px] text-slate-500 mt-0.5">
                DEV 라벨 API 응답 상태 확인
              </div>
            </button>
          </div>
        </div>
        {/* 운송장 출력 및 택배 수거 접수 버튼 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 pb-1 px-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrinterModalOpen(true)}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="프린터 설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2 justify-center">
            <button
              onClick={handlePrintLabels}
              disabled={isPrinting || occupiedAddresses.length === 0}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isPrinting || occupiedAddresses.length === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
              }`}
            >
              {isPrinting ? "출력 중..." : "📦 운송장 출력"}
            </button>
            <button
              onClick={handlePickupAction}
              disabled={
                isRequestingPickup || (!pickupRequested && !canRequestPickup)
              }
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isRequestingPickup || (!pickupRequested && !canRequestPickup)
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : pickupRequested
                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-sm"
                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
              }`}
            >
              {pickupButtonLabel}
            </button>
          </div>
        </div>

        <Dialog open={printerModalOpen} onOpenChange={setPrinterModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>프린터 설정</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-500">프로필</span>
                <select
                  value={printerProfile}
                  onChange={(e) => setPrinterProfile(e.target.value)}
                  className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={printerLoading}
                >
                  {printerLoading ? (
                    <option value="">프린터 목록 불러오는 중...</option>
                  ) : printerOptions.length ? (
                    printerOptions.map((printer) => (
                      <option key={printer} value={printer}>
                        {printer}
                      </option>
                    ))
                  ) : (
                    <option value="">사용 가능한 프린터가 없습니다.</option>
                  )}
                </select>
                {printerError ? (
                  <span className="text-xs text-rose-600">{printerError}</span>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 선반 그룹 선택 라디오/버튼 그룹 */}
        <div className="flex flex-wrap gap-1.5 justify-center pt-1 pb-4 px-2">
          {shelfGroups.map((group, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGroupIdx(idx)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border ${
                idx === selectedGroupIdx
                  ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {group[0]}-{group[group.length - 1]}
            </button>
          ))}
        </div>
      </div>

      {/* 모든 선반을 가로 스크롤로 표시 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex gap-3 sm:gap-4 overflow-x-auto overflow-y-auto pb-4 w-full justify-start px-2 scroll-smooth p-1 sm:p-2"
        style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {allShelvesToShow.map((shelf) => (
          <div
            key={shelf}
            ref={(el) => {
              if (el) shelfRefs.current[shelf] = el;
            }}
            className="flex flex-col gap-2 min-w-max"
          >
            {shelfRows.map((sRow) => (
              <div
                key={`${shelf}${sRow}`}
                className="flex flex-col gap-1 bg-white p-2 rounded-lg shadow-sm border border-slate-300"
              >
                <div className="text-[11px] font-bold text-slate-600 text-center leading-none mb-1">
                  {shelf}
                  {sRow}
                </div>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-md">
                  {binCols.map((bCol) => (
                    <div key={bCol} className="flex flex-col gap-1">
                      {binRows.map((bRow) => {
                        const address = `${shelf}${sRow}${bCol}${bRow}`;
                        const items = addressMap.get(address) || [];
                        const isOccupied = items.length > 0;

                        const handleClick = (
                          e: React.MouseEvent | React.TouchEvent,
                        ) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isOccupied && onBoxClick) {
                            onBoxClick(address, items);
                          }
                        };

                        return (
                          <div
                            key={address}
                            onClick={handleClick}
                            onTouchEnd={handleClick}
                            className={`
                              relative flex flex-col items-center justify-between p-1 rounded border transition-all select-none
                              ${
                                isOccupied
                                  ? getMailboxColorClass(items)
                                  : "bg-white border-slate-200"
                              }
                            `}
                            style={{
                              width: "48px",
                              height: "37px",
                              touchAction: "manipulation",
                            }}
                          >
                            {/* 상단 라벨 */}
                            <div
                              className={`font-mono font-bold leading-none text-center w-full pointer-events-none ${
                                isOccupied
                                  ? getMailboxColorClass(items).includes(
                                      "bg-blue",
                                    )
                                    ? "text-blue-800"
                                    : getMailboxColorClass(items).includes(
                                          "bg-red",
                                        )
                                      ? "text-red-800"
                                      : "text-slate-700"
                                  : "text-slate-400"
                              }`}
                              style={{ fontSize: "9px" }}
                            >
                              {address}
                            </div>
                            {/* 중앙 카운트 */}
                            <div className="flex-1 flex items-center justify-center pointer-events-none">
                              {isOccupied && (
                                <div
                                  className={`font-bold leading-none ${
                                    getMailboxColorClass(items).includes(
                                      "bg-blue",
                                    )
                                      ? "text-blue-700"
                                      : getMailboxColorClass(items).includes(
                                            "bg-red",
                                          )
                                        ? "text-red-700"
                                        : "text-slate-700"
                                  }`}
                                  style={{ fontSize: "16px" }}
                                >
                                  {items.length}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
