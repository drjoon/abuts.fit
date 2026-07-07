import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  callHanjinApi,
  callHanjinApiWithMeta,
  handleDownloadWaybillPdf,
  resolvePrintPayload,
  saveGeneratedWaybillPngs,
  printGeneratedWaybillPngs,
} from "./mailboxGrid.helpers";
import { MailboxActionHeader } from "./MailboxActionHeader";
import { MailboxShelfGrid } from "./MailboxShelfGrid";
import { MailboxPrintSettingsDialog } from "./MailboxPrintSettingsDialog";
import { MailboxShelfGroupTabs } from "./MailboxShelfGroupTabs";
import { MailboxStickyHeader } from "./MailboxStickyHeader";
import { useMailboxPrintSettings } from "./useMailboxPrintSettings";
import { ToastAction } from "@/components/ui/toast";
import { type MailboxShippingDayInfo } from "./shippingDay.helpers";

const MAILBOX_SHELF_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

type MailboxPickupStatus =
  | "none"
  | "printed"
  | "accepted"
  | "picked_up"
  | "completed"
  | "canceled"
  | "error";

export type MailboxSummaryItem = {
  mailboxAddress: string;
  requestCount: number;
  requestIds: string[];
  shippingPackageIds: string[];
  workflowCodes: string[];
  printed: boolean;
  forceTodayShipment: boolean;
  earliestEstimatedShipYmd?: string | null;
  shippingDayInfo?: MailboxShippingDayInfo | null;
};

type MailboxGridProps = {
  mailboxSummaries: MailboxSummaryItem[];
  forceTodayMailboxAddresses?: Set<string>;
  onBoxClick?: (address: string) => void | Promise<void>;
  onMailboxError?: (address: string, message: string) => void;
  onRefresh?: () => void | Promise<void>;
};

export const MailboxGrid = ({
  mailboxSummaries,
  forceTodayMailboxAddresses,
  onBoxClick,
  onMailboxError,
  onRefresh,
}: MailboxGridProps) => {
  const { toast } = useToast();
  const shelfGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i < MAILBOX_SHELF_NAMES.length; i += 3) {
      groups.push(MAILBOX_SHELF_NAMES.slice(i, i + 3));
    }
    return groups;
  }, []);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [activeHeaderAction, setActiveHeaderAction] = useState<
    "print" | "pickup" | "manual" | "reset" | "refresh" | null
  >(null);
  const [failedMailboxes, setFailedMailboxes] = useState<Set<string>>(
    new Set(),
  );
  const [mailboxChangeMeta, setMailboxChangeMeta] = useState<
    Record<
      string,
      {
        changed: boolean;
        printed: boolean;
        currentRequestIds: string[];
        previousRequestIds: string[];
      }
    >
  >({});
  const [workflowOverrideByRequestId, setWorkflowOverrideByRequestId] =
    useState<
      Record<
        string,
        {
          code: MailboxPickupStatus;
          label: string;
        }
      >
    >({});
  // 재출력 우편함 선택 다이얼로그
  const [reprintDialogOpen, setReprintDialogOpen] = useState(false);
  const [reprintSelectedAddresses, setReprintSelectedAddresses] = useState<
    Set<string>
  >(new Set());
  const [manualPickupDialogOpen, setManualPickupDialogOpen] = useState(false);
  const [manualPickupTrackingByAddress, setManualPickupTrackingByAddress] =
    useState<Record<string, string>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    printerProfile,
    setPrinterProfile,
    paperProfile,
    setPaperProfile,
    paperOptions,
    paperLoading,
    paperError,
    printerOptions,
    printerLoading,
    printerError,
    printerModalOpen,
    setPrinterModalOpen,
    shippingOutputMode,
    setShippingOutputMode,
    fetchPrinters,
  } = useMailboxPrintSettings();

  const shelfRows = ["1", "2", "3", "4"];
  const binCols = ["A", "B", "C"];
  const binRows = ["1", "2", "3", "4"];

  const mailboxSummaryMap = useMemo(() => {
    const map = new Map<string, MailboxSummaryItem>();
    for (const item of mailboxSummaries || []) {
      const addr = String(item?.mailboxAddress || "")
        .trim()
        .toUpperCase();
      if (!addr) continue;
      map.set(addr, {
        ...item,
        mailboxAddress: addr,
      });
    }
    return map;
  }, [mailboxSummaries]);

  const clearWorkflowOverridesForMailboxes = (mailboxAddresses: string[]) => {
    const targetMailboxSet = new Set(
      mailboxAddresses
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    if (targetMailboxSet.size === 0) return;
    setWorkflowOverrideByRequestId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [mailboxAddress, summary] of mailboxSummaryMap.entries()) {
        if (!targetMailboxSet.has(mailboxAddress)) continue;
        for (const requestId of summary.requestIds || []) {
          const normalizedRequestId = String(requestId || "").trim();
          if (!normalizedRequestId) continue;
          if (!(normalizedRequestId in next)) continue;
          delete next[normalizedRequestId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const applyWorkflowOverrideForMailboxes = (
    mailboxAddresses: string[],
    override: {
      code: MailboxPickupStatus;
      label: string;
    },
  ) => {
    const targetMailboxSet = new Set(
      mailboxAddresses
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    if (targetMailboxSet.size === 0) return;
    setWorkflowOverrideByRequestId((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [mailboxAddress, summary] of mailboxSummaryMap.entries()) {
        if (!targetMailboxSet.has(mailboxAddress)) continue;
        for (const requestId of summary.requestIds || []) {
          const normalizedRequestId = String(requestId || "").trim();
          if (!normalizedRequestId) continue;
          if (
            next[normalizedRequestId]?.code === override.code &&
            next[normalizedRequestId]?.label === override.label
          ) {
            continue;
          }
          next[normalizedRequestId] = override;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };
  const getMailboxColorClass = (summary: {
    requestCount: number;
    earliestEstimatedShipYmd?: string | null;
  }) => {
    if (!summary.requestCount) return "bg-white border-slate-200";
    const earliestShipDate = String(
      summary.earliestEstimatedShipYmd || "",
    ).trim();
    if (!earliestShipDate) {
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    }
    const today = new Date();
    const kstOffset = 9 * 60;
    const kstDate = new Date(today.getTime() + kstOffset * 60 * 1000);
    const todayYmd = kstDate.toISOString().split("T")[0];
    if (earliestShipDate === todayYmd) {
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    } else if (earliestShipDate > todayYmd) {
      return "bg-slate-50 border-slate-300 cursor-pointer hover:bg-slate-100 hover:shadow-md";
    } else {
      return "bg-red-50 border-red-400 cursor-pointer hover:bg-red-100 hover:shadow-md";
    }
  };

  const handlePrintOnly = async ({
    targetAddresses,
    modifyOnly = false,
  }: {
    targetAddresses?: string[];
    modifyOnly?: boolean;
  } = {}) => {
    const forcedTodaySet = forceTodayMailboxAddresses || new Set<string>();
    const effectiveTargetAddresses = Array.isArray(targetAddresses)
      ? targetAddresses.filter(
          (addr) => !notTodayAddressSet.has(addr) || forcedTodaySet.has(addr),
        )
      : todayShippableAddresses;
    if (effectiveTargetAddresses.length === 0) {
      toast({
        title: "우편함 없음",
        description: modifyOnly
          ? "재출력할 우편함이 없습니다."
          : "운송장을 출력할 우편함이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    setActiveHeaderAction("print");
    try {
      setFailedMailboxes((prev) => {
        const next = new Set(prev);
        effectiveTargetAddresses.forEach((addr) => next.delete(addr));
        return next;
      });
      toast({
        title: modifyOnly ? "운송장 재출력 시작" : "운송장 출력 시작",
        description: `${effectiveTargetAddresses.length}개 우편함의 운송장을 출력합니다. 한진 API 응답까지 10초 이상 걸릴 수 있습니다.`,
        duration: 10000,
      });
      // wbl_num은 한진 접수(pickup) 후 DB에 저장되므로,
      // accepted/picked_up이 아닌 우편함이 포함되면 pickup-and-print 사용 (접수 → 출력 통합)
      // 이미 모두 accepted/picked_up인 경우엔 print-labels로 DB의 wbl_num을 직접 조회해 출력
      const needsPickupBeforePrint = effectiveTargetAddresses.some((addr) => {
        const status = pickupRequestedMailboxes.get(addr);
        return status !== "accepted" && status !== "picked_up";
      });
      const response = needsPickupBeforePrint
        ? await callHanjinApiWithMeta({
            path: "/api/requests/shipping/hanjin/pickup-and-print",
            mailboxAddresses: effectiveTargetAddresses,
            forceTodayMailboxAddresses: effectiveTargetAddresses.filter(
              (addr) => forcedTodaySet.has(addr),
            ),
            wblPrintOptions: {
              printer: printerProfile || undefined,
              paperProfile,
              shippingOutputMode,
            } as any,
          })
        : await callHanjinApiWithMeta({
            path: "/api/requests/shipping/hanjin/print-labels",
            mailboxAddresses: effectiveTargetAddresses,
            forceTodayMailboxAddresses: effectiveTargetAddresses.filter(
              (addr) => forcedTodaySet.has(addr),
            ),
            wblPrintOptions: {
              printer: printerProfile || undefined,
              paperProfile,
              shippingOutputMode,
            } as any,
          });
      const { data, wblPrint } = response;

      const changedMailboxAddressSet = new Set(
        Array.isArray((data as any)?.changedMailboxAddresses)
          ? (data as any).changedMailboxAddresses
              .map((value: any) => String(value || "").trim())
              .filter(Boolean)
          : [],
      );
      const nextMailboxChangeMeta = Array.isArray((data as any)?.mailboxChanges)
        ? Object.fromEntries(
            (data as any).mailboxChanges.map((item: any) => {
              const mailboxAddress = String(item?.mailboxAddress || "").trim();
              return [
                mailboxAddress,
                {
                  changed:
                    changedMailboxAddressSet.size > 0
                      ? changedMailboxAddressSet.has(mailboxAddress)
                      : Boolean(item?.changed),
                  printed: Boolean(item?.printed),
                  currentRequestIds: Array.isArray(item?.currentRequestIds)
                    ? item.currentRequestIds
                        .map((value: any) => String(value || "").trim())
                        .filter(Boolean)
                    : [],
                  previousRequestIds: Array.isArray(item?.previousRequestIds)
                    ? item.previousRequestIds
                        .map((value: any) => String(value || "").trim())
                        .filter(Boolean)
                    : [],
                },
              ];
            }),
          )
        : null;
      if (nextMailboxChangeMeta) {
        setMailboxChangeMeta((prev) => ({
          ...prev,
          ...nextMailboxChangeMeta,
        }));
      }
      const pickupUpdatedMailboxAddresses = Array.isArray(
        (data as any)?.pickupUpdatedMailboxAddresses,
      )
        ? (data as any).pickupUpdatedMailboxAddresses
            .map((value: any) => String(value || "").trim())
            .filter(Boolean)
        : [];
      const workflowRefreshMailboxAddresses = modifyOnly
        ? effectiveTargetAddresses
        : pickupUpdatedMailboxAddresses;
      if (workflowRefreshMailboxAddresses.length > 0) {
        clearWorkflowOverridesForMailboxes(workflowRefreshMailboxAddresses);
      }

      const notifyPickupUpdated = async () => {
        if (onRefresh) {
          await onRefresh();
        }
        if (!modifyOnly || pickupUpdatedMailboxAddresses.length === 0) return;
        toast({
          title: "택배 접수 업데이트 완료",
          description: `${pickupUpdatedMailboxAddresses.length}개 우편함의 택배 접수가 업데이트되었습니다.`,
        });
      };
      const completedPrintCount =
        modifyOnly && changedMailboxAddressSet.size > 0
          ? changedMailboxAddressSet.size
          : effectiveTargetAddresses.length;
      const completedPrintDescriptionImage = `${completedPrintCount}개 우편함의 라벨을 저장했습니다.`;
      const completedPrintDescriptionPrint = `${completedPrintCount}개 우편함의 라벨 출력이 완료되었습니다.`;
      const queuedPrintDescription = `${completedPrintCount}개 우편함의 라벨 출력 요청을 접수했습니다.`;

      if (shippingOutputMode === "image") {
        if ((wblPrint as any)?.outputMode === "pdf") {
          await saveGeneratedWaybillPngs({
            addressList: (data as any)?.address_list || [],
            zplLabels: (data as any)?.zplLabels || [],
          });
          toast({
            title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
            description: completedPrintDescriptionImage,
          });
          notifyPickupUpdated();
          return;
        }

        if ((wblPrint as any)?.queued) {
          toast({
            title: modifyOnly
              ? "운송장 재출력 요청 완료"
              : "운송장 출력 요청 완료",
            description: queuedPrintDescription,
          });
          notifyPickupUpdated();
          return;
        }

        const candidatePayload =
          (wblPrint as any)?.data || wblPrint || (data as any)?.label || data;
        const printPayload = resolvePrintPayload(candidatePayload);

        if (printPayload) {
          await handleDownloadWaybillPdf(candidatePayload);
          toast({
            title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
            description: completedPrintDescriptionImage,
          });
          notifyPickupUpdated();
          return;
        }

        // 재출력 시 address_list가 빈 배열일 수 있으므로 zplLabels 존재 여부도 체크
        if (
          Array.isArray((data as any)?.zplLabels) &&
          (data as any).zplLabels.length > 0
        ) {
          await saveGeneratedWaybillPngs({
            addressList: (data as any).address_list || [],
            zplLabels: (data as any).zplLabels,
          });
          toast({
            title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
            description: completedPrintDescriptionImage,
          });
          notifyPickupUpdated();
          return;
        }

        if (
          Array.isArray((data as any)?.address_list) &&
          (data as any).address_list.length > 0
        ) {
          await saveGeneratedWaybillPngs({
            addressList: (data as any).address_list,
            zplLabels: (data as any).zplLabels,
          });
          toast({
            title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
            description: completedPrintDescriptionImage,
          });
          notifyPickupUpdated();
          return;
        }
      }

      if ((wblPrint as any)?.outputMode === "label-png") {
        await printGeneratedWaybillPngs({
          addressList: (data as any)?.address_list || [],
          zplLabels: (data as any)?.zplLabels || [],
          printer: (wblPrint as any)?.printer || printerProfile || undefined,
          paperProfile:
            (wblPrint as any)?.paperProfile || paperProfile || undefined,
        });
        toast({
          title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
          description: completedPrintDescriptionPrint,
        });
        notifyPickupUpdated();
        return;
      }

      if ((wblPrint as any)?.queued) {
        toast({
          title: modifyOnly
            ? "운송장 재출력 요청 완료"
            : "운송장 출력 요청 완료",
          description: queuedPrintDescription,
        });
        notifyPickupUpdated();
        return;
      }

      if (wblPrint?.success) {
        toast({
          title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
          description: completedPrintDescriptionPrint,
        });
        notifyPickupUpdated();
        return;
      }

      if (
        wblPrint?.skipped &&
        (wblPrint?.reason === "wbl_print_server_not_configured" ||
          wblPrint?.reason === "no_wbl_print_server_base")
      ) {
        await triggerLocalPrint(data);
        toast({
          title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
          description: completedPrintDescriptionPrint,
        });
        notifyPickupUpdated();
        return;
      }

      if (wblPrint?.skipped && wblPrint?.reason === "print_payload_not_found") {
        toast({
          title: "출력 데이터 없음",
          description:
            "한진 운송장 응답에 PDF(URL/Base64) 데이터가 포함되지 않아 자동 출력이 불가능합니다.",
          variant: "destructive",
        });
        return;
      }

      if (wblPrint && wblPrint?.success === false) {
        toast({
          title: "운송장 출력 실패",
          description:
            wblPrint?.message ||
            wblPrint?.reason ||
            "운송장 출력에 실패했습니다.",
          variant: "destructive",
        });
        return;
      }

      await triggerLocalPrint(data);
      toast({
        title: modifyOnly ? "운송장 재출력 완료" : "운송장 출력 완료",
        description: completedPrintDescriptionPrint,
      });
      notifyPickupUpdated();
    } catch (error) {
      console.error("운송장 출력 실패:", error);
      console.error("[shipping][print] error", {
        targetAddresses: effectiveTargetAddresses,
        modifyOnly,
        error,
      });
      const failedFromMsgKey = resolveFailedMailboxesFromError(error);
      const failedTargets = failedFromMsgKey.addresses.length
        ? failedFromMsgKey.addresses
        : effectiveTargetAddresses;
      setFailedMailboxes((prev) => {
        const next = new Set(prev);
        failedTargets.forEach((addr) => next.add(addr));
        return next;
      });
      if (onMailboxError) {
        if (failedFromMsgKey.messages.length) {
          failedFromMsgKey.messages.forEach((item) => {
            onMailboxError(item.address, item.message);
          });
        } else {
          const message = resolveHanjinFailureMessage(error);
          failedTargets.forEach((addr) => onMailboxError(addr, message));
        }
      }
      toast({
        title: modifyOnly ? "운송장 재출력 실패" : "운송장 출력 실패",
        description: resolveHanjinFailureMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
      setActiveHeaderAction(null);
    }
  };

  const openManualPickupDialog = () => {
    const mailboxCandidates = occupiedAddresses
      .map((address) => String(address || "").trim())
      .filter(Boolean);
    if (!mailboxCandidates.length) {
      toast({
        title: "수동 집하 대상 없음",
        description: "수동 집하 완료로 반영할 우편함이 없습니다.",
      });
      return;
    }

    const initialTrackingByAddress = Object.fromEntries(
      mailboxCandidates.map((address) => [address, ""]),
    ) as Record<string, string>;
    setManualPickupTrackingByAddress(initialTrackingByAddress);
    setManualPickupDialogOpen(true);
  };

  const handleManualPickupComplete = async () => {
    const selectedEntries = occupiedAddresses
      .map((address) => {
        const normalizedAddress = String(address || "").trim();
        const trackingNumber = String(
          manualPickupTrackingByAddress?.[normalizedAddress] || "",
        ).trim();
        return [normalizedAddress, trackingNumber] as const;
      })
      .filter(([mailboxAddress, trackingNumber]) =>
        Boolean(mailboxAddress && trackingNumber),
      );

    if (!selectedEntries.length) {
      toast({
        title: "수동 집하 입력 필요",
        description: "우편함별 운송장번호를 최소 1개 이상 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const mailboxAddresses = selectedEntries.map(([mailboxAddress]) =>
      String(mailboxAddress || "").trim(),
    );
    const trackingNumberByMailbox = Object.fromEntries(selectedEntries);

    // 우편함 요약에서 유효한 shippingPackageId만 전송한다.
    const targetMailboxSet = new Set(mailboxAddresses);
    const shippingPackageIds = Array.from(
      new Set(
        Array.from(mailboxSummaryMap.entries())
          .filter(([mailboxAddress]) => targetMailboxSet.has(mailboxAddress))
          .flatMap(([, summary]) => summary.shippingPackageIds || [])
          .map((value) => String(value || "").trim())
          .filter((value) => /^[a-f\d]{24}$/i.test(value)),
      ),
    );

    setIsRequestingPickup(true);
    setActiveHeaderAction("manual");
    try {
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/manual-pickup-complete",
        method: "POST",
        jsonBody: {
          mailboxAddresses,
          shippingPackageIds,
          trackingNumberByMailbox,
          trackingStatusCode: "11",
          trackingStatusText: "집하완료",
        },
      });
      const body = response.data as any;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "수동 집하 처리에 실패했습니다.");
      }

      applyWorkflowOverrideForMailboxes(mailboxAddresses, {
        code: "picked_up",
        label: "집하완료",
      });

      if (onRefresh) {
        await onRefresh();
      }

      setManualPickupDialogOpen(false);
      toast({
        title: "수동 집하 완료",
        description: `${mailboxAddresses.length}개 우편함을 수동 집하 완료로 반영했습니다.`,
      });
    } catch (error) {
      toast({
        title: "수동 집하 실패",
        description:
          error instanceof Error ? error.message : "수동 집하에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
      setActiveHeaderAction(null);
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;
    if (Math.abs(diff) < 50) {
      e.preventDefault();
    }
  };
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
  const allShelvesToShow = MAILBOX_SHELF_NAMES;
  const occupiedAddresses = useMemo(() => {
    return Array.from(mailboxSummaryMap.keys());
  }, [mailboxSummaryMap]);

  const mailboxShippingDayMap = useMemo(() => {
    const map = new Map<string, MailboxShippingDayInfo>();
    for (const [address, summary] of mailboxSummaryMap.entries()) {
      map.set(
        address,
        summary.shippingDayInfo || { notToday: false, nextDayLabel: null },
      );
    }
    return map;
  }, [mailboxSummaryMap]);

  const notTodayAddressSet = useMemo(() => {
    const set = new Set<string>();
    for (const [address, info] of mailboxShippingDayMap.entries()) {
      if (info.notToday) set.add(address);
    }
    return set;
  }, [mailboxShippingDayMap]);

  const persistedForceTodayAddressSet = useMemo(() => {
    const set = new Set<string>();
    for (const [address, summary] of mailboxSummaryMap.entries()) {
      if (summary.forceTodayShipment) {
        set.add(address);
      }
    }
    return set;
  }, [mailboxSummaryMap]);

  const forceTodayAddressSet = useMemo(() => {
    const next = new Set<string>(persistedForceTodayAddressSet);
    for (const value of forceTodayMailboxAddresses || []) {
      const normalized = String(value || "").trim();
      if (normalized) next.add(normalized);
    }
    return next;
  }, [forceTodayMailboxAddresses, persistedForceTodayAddressSet]);

  // 오늘 발송 대상: 기본 요일이 오늘이거나, 오늘 발송 강제(forceToday)된 우편함 포함
  const todayShippableAddresses = useMemo(
    () =>
      occupiedAddresses.filter(
        (addr) =>
          !notTodayAddressSet.has(addr) || forceTodayAddressSet.has(addr),
      ),
    [forceTodayAddressSet, notTodayAddressSet, occupiedAddresses],
  );

  const pickupRequestedMailboxes = useMemo(() => {
    const map = new Map<string, MailboxPickupStatus>();

    for (const [mailboxAddress, summary] of mailboxSummaryMap.entries()) {
      const codes = new Set<string>(
        (summary.workflowCodes || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      );

      for (const requestId of summary.requestIds || []) {
        const normalizedRequestId = String(requestId || "").trim();
        if (!normalizedRequestId) continue;
        const overrideCode = String(
          workflowOverrideByRequestId[normalizedRequestId]?.code || "",
        ).trim();
        if (overrideCode) codes.add(overrideCode);
      }

      let nextStatus: MailboxPickupStatus = "none";
      if (codes.has("error")) nextStatus = "error";
      else if (codes.has("canceled")) nextStatus = "canceled";
      else if (codes.has("completed")) nextStatus = "completed";
      else if (codes.has("picked_up")) nextStatus = "picked_up";
      else if (codes.has("printed")) nextStatus = "printed";
      else if (codes.has("accepted")) nextStatus = "accepted";

      map.set(mailboxAddress, nextStatus);
    }

    return map;
  }, [mailboxSummaryMap, workflowOverrideByRequestId]);

  const printedMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const [mailbox, summary] of mailboxSummaryMap.entries()) {
      if (summary.printed) {
        set.add(mailbox);
      }
    }
    return set;
  }, [mailboxSummaryMap]);

  useEffect(() => {
    if (failedMailboxes.size === 0) return;
    setFailedMailboxes((prev) => {
      const next = new Set(prev);
      for (const mailbox of prev) {
        const printedSuccessfully = Boolean(
          mailboxSummaryMap.get(mailbox)?.printed,
        );
        if (printedSuccessfully) next.delete(mailbox);
      }
      return next;
    });
  }, [failedMailboxes.size, mailboxSummaryMap]);

  function resolveHanjinFailureMessage(error: unknown) {
    const anyErr = error as any;
    const data = anyErr?.data;
    const resultMessage =
      typeof data?.resultMessage === "string" ? data.resultMessage.trim() : "";
    if (resultMessage) return resultMessage;
    const resultMessageSnake =
      typeof data?.result_message === "string"
        ? data.result_message.trim()
        : "";
    if (resultMessageSnake) return resultMessageSnake;
    const addressList = Array.isArray(data?.address_list)
      ? data.address_list
      : [];
    const firstFailed = addressList.find(
      (row: any) =>
        String(row?.result_code || row?.resultCode || "OK").trim() !== "OK",
    );
    const failedMsg = String(
      firstFailed?.result_msg ||
        firstFailed?.resultMessage ||
        firstFailed?.result_message ||
        "",
    ).trim();
    if (failedMsg) return failedMsg;
    return anyErr instanceof Error && anyErr.message
      ? anyErr.message
      : "택배 접수 및 라벨 출력에 실패했습니다.";
  }

  function resolveFailedMailboxesFromError(error: unknown) {
    const anyErr = error as any;
    const data = anyErr?.data;
    const addressList = Array.isArray(data?.address_list)
      ? data.address_list
      : [];
    const failedRows = addressList.filter(
      (row: any) =>
        String(row?.result_code || row?.resultCode || "OK").trim() !== "OK",
    );
    if (!failedRows.length) {
      return {
        addresses: [],
        messages: [] as Array<{ address: string; message: string }>,
      };
    }
    const messages = failedRows
      .map((row: any) => {
        const address = String(row?.msg_key || row?.msgKey || "").trim();
        const message = String(
          row?.result_msg || row?.resultMessage || row?.result_message || "",
        ).trim();
        return address && message ? { address, message } : null;
      })
      .filter(Boolean) as Array<{ address: string; message: string }>;
    return {
      addresses: messages.map((m) => m.address),
      messages,
    };
  }

  async function triggerLocalPrint(payload: any) {
    const addressList = payload?.address_list;
    if (!Array.isArray(addressList) || addressList.length === 0) {
      toast({
        title: "출력 준비 실패",
        description:
          "운송장 응답에서 ZPL 생성에 필요한 address_list를 찾지 못했습니다.",
        variant: "destructive",
      });
      return;
    }

    const escapeZplText = (value: any) =>
      String(value || "")
        .replace(/\^/g, "")
        .replace(/~/g, "")
        .replace(/[\r\n]+/g, " ")
        .trim();

    const zplLabels = Array.isArray(payload?.zplLabels)
      ? payload.zplLabels.filter((v: any) => typeof v === "string" && v.trim())
      : [];
    const zpl = zplLabels.join("\n");

    if (!zpl) {
      toast({
        title: "로컬 출력 실패",
        description: "운송장 응답에서 ZPL 데이터를 찾지 못했습니다.",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await request<any>({
        path: "/api/requests/packing/print-zpl",
        method: "POST",
        jsonBody: {
          zpl,
          printer: printerProfile || undefined,
          title: "Hanjin Label",
          paperProfile,
        },
      });
      const data = response.data as any;
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "로컬 라벨 출력에 실패했습니다.");
      }
    } catch (error) {
      toast({
        title: "로컬 출력 실패",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  // accepted 상태 제거: 더 이상 사용하지 않음
  // const acceptedAddresses = useMemo(
  //   () =>
  //     occupiedAddresses.filter(
  //       (addr) => pickupRequestedMailboxes.get(addr) === "accepted",
  //     ),
  //   [occupiedAddresses, pickupRequestedMailboxes],
  // );

  const printedWorkflowAddresses = useMemo(
    () =>
      occupiedAddresses.filter((addr) => {
        const status = pickupRequestedMailboxes.get(addr);
        // printed/picked_up/completed를 출력 완료 상태로 간주
        return (
          status === "printed" ||
          status === "picked_up" ||
          status === "completed" ||
          printedMailboxes.has(addr)
        );
      }),
    [occupiedAddresses, pickupRequestedMailboxes, printedMailboxes],
  );

  const printedWorkflowAddressSet = useMemo(
    () => new Set(printedWorkflowAddresses),
    [printedWorkflowAddresses],
  );

  // 미출력 우편함: 점유됐지만 아직 운송장 출력 안 된 것
  const unprintedMailboxAddresses = useMemo(
    () =>
      occupiedAddresses.filter((addr) => !printedWorkflowAddressSet.has(addr)),
    [occupiedAddresses, printedWorkflowAddressSet],
  );

  const printedMailboxChanges = useMemo(
    () =>
      printedWorkflowAddresses.map((address) => {
        const backendMeta = mailboxChangeMeta[address];
        return {
          address,
          changed: backendMeta ? backendMeta.changed : false,
        };
      }),
    [mailboxChangeMeta, printedWorkflowAddresses],
  );

  const hasModifiedPrintedMailbox = useMemo(
    () => printedMailboxChanges.some((item) => item.changed),
    [printedMailboxChanges],
  );

  const handleTemporaryReset = async () => {
    if (!occupiedAddresses.length) {
      toast({
        title: "리셋 불가",
        description: "초기화할 우편함이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    setActiveHeaderAction("reset");
    try {
      await request<any>({
        path: "/api/requests/shipping/mailbox-reset-working-state",
        method: "POST",
        jsonBody: {
          mailboxAddresses: occupiedAddresses,
        },
      });

      // 로컬 상태 초기화 (refresh 전후 모두 초기화하여 stale override 방지)
      setMailboxChangeMeta({});
      setWorkflowOverrideByRequestId({});
      setFailedMailboxes(new Set());

      // 백엔드 상태 다시 조회
      if (onRefresh) {
        await onRefresh();
      }

      // refresh 완료 후 혹시 남은 override 재초기화
      setWorkflowOverrideByRequestId({});

      toast({
        title: "임시 리셋 완료",
        description: `${occupiedAddresses.length}개 우편함을 포장.발송 초기 상태처럼 되돌렸습니다.`,
      });
    } catch (error) {
      toast({
        title: "임시 리셋 실패",
        description:
          error instanceof Error && error.message
            ? error.message
            : "포장.발송 테스트 리셋에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
      setActiveHeaderAction(null);
    }
  };

  const handlePickupAction = async (explicitTargetAddresses?: string[]) => {
    const normalizedExplicitTargets = Array.isArray(explicitTargetAddresses)
      ? explicitTargetAddresses.filter(Boolean)
      : [];
    const acceptedTargetAddresses = normalizedExplicitTargets.length
      ? normalizedExplicitTargets.filter(
          (addr) => pickupRequestedMailboxes.get(addr) === "accepted",
        )
      : todayShippableAddresses;
    const hasAcceptedTarget = acceptedTargetAddresses.length > 0;
    const printedAddresses = normalizedExplicitTargets.length
      ? normalizedExplicitTargets.filter(
          (addr) => pickupRequestedMailboxes.get(addr) === "printed",
        )
      : printedWorkflowAddresses;
    const hasPrintedTarget = printedAddresses.length > 0;

    const targetAddresses = hasAcceptedTarget
      ? acceptedTargetAddresses
      : hasPrintedTarget
        ? printedAddresses
        : normalizedExplicitTargets.length
          ? normalizedExplicitTargets.filter(
              (addr) =>
                !notTodayAddressSet.has(addr) || forceTodayAddressSet.has(addr),
            )
          : todayShippableAddresses;

    if (!targetAddresses.length) {
      toast({
        title: "접수 불가",
        description: "택배 접수 또는 취소할 우편함이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    setActiveHeaderAction("pickup");
    try {
      if (!hasAcceptedTarget) {
        const pickupResponse = await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup",
          mailboxAddresses: targetAddresses,
        });
        const pickupResults = Array.isArray((pickupResponse as any)?.results)
          ? (pickupResponse as any).results
          : [];
        const successfulMailboxAddresses = pickupResults
          .filter((item: any) => item?.success !== false)
          .map((item: any) => String(item?.mailbox || "").trim())
          .filter(Boolean);
        const failedMailboxAddresses = pickupResults
          .filter((item: any) => item?.success === false)
          .map((item: any) => String(item?.mailbox || "").trim())
          .filter(Boolean);
        if (successfulMailboxAddresses.length) {
          setFailedMailboxes((prev) => {
            const next = new Set(prev);
            successfulMailboxAddresses.forEach((addr) => next.delete(addr));
            return next;
          });
        }
        if (failedMailboxAddresses.length) {
          setFailedMailboxes((prev) => {
            const next = new Set(prev);
            failedMailboxAddresses.forEach((addr) => next.add(addr));
            return next;
          });
        }
        if (onRefresh) {
          await onRefresh();
        }
        toast({
          title:
            failedMailboxAddresses.length > 0
              ? "택배 수거 접수 부분 완료"
              : "택배 수거 접수 완료",
          description:
            failedMailboxAddresses.length > 0
              ? `${successfulMailboxAddresses.length}개 성공, ${failedMailboxAddresses.length}개 실패`
              : `${successfulMailboxAddresses.length}개 우편함의 택배 수거가 접수되었습니다.`,
        });
      } else {
        const cancelResponse = await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup-cancel",
          mailboxAddresses: targetAddresses,
        });
        const cancelResults = Array.isArray((cancelResponse as any)?.results)
          ? (cancelResponse as any).results
          : [];
        const successfulMailboxAddresses = cancelResults
          .filter((item: any) => item?.success !== false)
          .map((item: any) => String(item?.mailbox || "").trim())
          .filter(Boolean);
        const failedMailboxAddresses = cancelResults
          .filter((item: any) => item?.success === false)
          .map((item: any) => String(item?.mailbox || "").trim())
          .filter(Boolean);
        setMailboxChangeMeta((prev) => {
          const next = { ...prev };
          successfulMailboxAddresses.forEach((address) => {
            delete next[address];
          });
          return next;
        });
        if (successfulMailboxAddresses.length) {
          applyWorkflowOverrideForMailboxes(successfulMailboxAddresses, {
            code: "canceled",
            label: "취소",
          });
        }
        setFailedMailboxes((prev) => {
          const next = new Set(prev);
          successfulMailboxAddresses.forEach((addr) => next.delete(addr));
          failedMailboxAddresses.forEach((addr) => next.add(addr));
          return next;
        });
        if (onRefresh) {
          await onRefresh();
        }
        toast({
          title:
            failedMailboxAddresses.length > 0
              ? "택배 수거 취소 부분 완료"
              : "택배 수거 취소 완료",
          description:
            failedMailboxAddresses.length > 0
              ? `${successfulMailboxAddresses.length}개 성공, ${failedMailboxAddresses.length}개 실패`
              : `${successfulMailboxAddresses.length}개 우편함의 택배 수거를 취소했습니다.`,
        });
      }
    } catch (error) {
      console.error("택배 수거 처리 실패:", error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : hasAcceptedTarget
            ? "택배 수거 접수 취소에 실패했습니다."
            : "택배 수거 접수에 실패했습니다.";
      toast({
        title: hasAcceptedTarget ? "취소 실패" : "택배 수거 접수 실패",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
      setActiveHeaderAction(null);
    }
  };

  // 백엔드 상태 기반 버튼 로직 (accepted 상태 제거)
  // const hasAcceptedMailbox = acceptedAddresses.length > 0;
  const hasAnyOccupiedMailbox = occupiedAddresses.length > 0;

  // 운송장 출력 라벨
  const printLabel = "🖨️ 운송장 출력";
  const printLoadingLabel = "출력 중...";

  // 운송장 출력 다이얼로그에서 선택된 주소로 출력 실행
  const handlePrintConfirm = useCallback(() => {
    const selectedList = Array.from(reprintSelectedAddresses);
    if (!selectedList.length) return;
    setReprintDialogOpen(false);

    // 신규 우편함이 있으면 pickup-and-print (운송장번호 신청+출력)
    // 기출력 우편함만 있으면 print-labels (재출력만)
    const hasUnprinted = selectedList.some(
      (addr) => !printedWorkflowAddressSet.has(addr),
    );

    if (hasUnprinted) {
      // 신규 우편함 포함: 운송장번호 신청 후 출력
      void handlePrintOnly({
        targetAddresses: selectedList,
        modifyOnly: false,
      });
    } else {
      // 기출력 우편함만: 재출력만
      void handlePrintOnly({
        targetAddresses: selectedList,
        modifyOnly: true,
      });
    }
  }, [printedWorkflowAddressSet, reprintSelectedAddresses]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionButtons = [
    {
      label: "",
      ariaLabel: "우편함 새로고침",
      icon: <RefreshCw className="h-4 w-4" />,
      iconOnly: true,
      loading: activeHeaderAction === "refresh" && isRequestingPickup,
      loadingLabel: "...",
      disabled: false,
      variant: "white" as const,
      onClick: async () => {
        if (!onRefresh) return;
        setIsRequestingPickup(true);
        setActiveHeaderAction("refresh");
        try {
          await onRefresh();
          toast({
            title: "새로고침 완료",
            description: "우편함 데이터를 다시 불러왔습니다.",
          });
        } catch (error) {
          toast({
            title: "새로고침 실패",
            description:
              error instanceof Error
                ? error.message
                : "우편함 데이터를 다시 불러오지 못했습니다.",
            variant: "destructive",
          });
        } finally {
          setIsRequestingPickup(false);
          setActiveHeaderAction(null);
        }
      },
    },
    {
      // 운송장 출력: 항상 다이얼로그로 대상 선택 후 출력
      label: "🖨️ 운송장 출력",
      loading:
        (activeHeaderAction === "pickup" || activeHeaderAction === "print") &&
        isRequestingPickup,
      loadingLabel: "출력 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "slate" as const,
      onClick: () => {
        // 항상 선택 다이얼로그 오픈: 신규/기출력 구분 선택
        // 초기 선택: 오늘 발송 가능한(의뢰자 요일 설정상 허용) 미출력 우편함
        const defaultPool =
          unprintedMailboxAddresses.length > 0
            ? unprintedMailboxAddresses
            : occupiedAddresses;
        const initialSelected = new Set(
          defaultPool.filter(
            (addr) =>
              !notTodayAddressSet.has(addr) || forceTodayAddressSet.has(addr),
          ),
        );
        setReprintSelectedAddresses(initialSelected);
        setReprintDialogOpen(true);
      },
    },
    {
      label: "📦 수동 집하",
      loading: activeHeaderAction === "manual" && isRequestingPickup,
      loadingLabel: "반영 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "white" as const,
      onClick: () => {
        openManualPickupDialog();
      },
    },
    {
      label: "🔄 리셋",
      loading: activeHeaderAction === "reset" && isRequestingPickup,
      loadingLabel: "리셋 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "white" as const,
      onClick: () => {
        void handleTemporaryReset();
      },
    },
  ];

  // 재출력 다이얼로그용 주소 파싱: "A1A2" → { shelfCol:"A", shelfRow:"1", binCol:"A", binRow:"2" }
  const parsedTargetAddresses = useMemo(() => {
    return occupiedAddresses.map((addr) => ({
      addr,
      shelfCol: addr[0] ?? "",
      shelfRow: addr[1] ?? "",
      binCol: addr[2] ?? "",
      binRow: addr[3] ?? "",
    }));
  }, [occupiedAddresses]);

  const parsedTargetAddressByBinCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of parsedTargetAddresses) {
      map.set(`${item.binCol}:${item.binRow}`, item.addr);
    }
    return map;
  }, [parsedTargetAddresses]);

  // 열(BinCol) / 행(BinRow) 그룹
  const reprintBinCols = useMemo(
    () => [...new Set(parsedTargetAddresses.map((p) => p.binCol))].sort(),
    [parsedTargetAddresses],
  );
  const reprintBinRows = useMemo(
    () => [...new Set(parsedTargetAddresses.map((p) => p.binRow))].sort(),
    [parsedTargetAddresses],
  );

  const toggleReprintByBinCol = (col: string) => {
    const colAddrs = parsedTargetAddresses
      .filter((p) => p.binCol === col)
      .map((p) => p.addr);
    const allSelected = colAddrs.every((a) => reprintSelectedAddresses.has(a));
    setReprintSelectedAddresses((prev) => {
      const next = new Set(prev);
      colAddrs.forEach((a) => (allSelected ? next.delete(a) : next.add(a)));
      return next;
    });
  };

  const toggleReprintByBinRow = (row: string) => {
    const rowAddrs = parsedTargetAddresses
      .filter((p) => p.binRow === row)
      .map((p) => p.addr);
    const allSelected = rowAddrs.every((a) => reprintSelectedAddresses.has(a));
    setReprintSelectedAddresses((prev) => {
      const next = new Set(prev);
      rowAddrs.forEach((a) => (allSelected ? next.delete(a) : next.add(a)));
      return next;
    });
  };

  const toggleReprintAll = () => {
    if (reprintSelectedAddresses.size === occupiedAddresses.length) {
      setReprintSelectedAddresses(new Set());
    } else {
      setReprintSelectedAddresses(new Set(occupiedAddresses));
    }
  };

  const mailboxShelfSummaryMap = useMemo(
    () =>
      new Map(
        Array.from(mailboxSummaryMap.entries()).map(([address, summary]) => [
          address,
          {
            requestCount: Number(summary.requestCount || 0),
            earliestEstimatedShipYmd: summary.earliestEstimatedShipYmd || null,
          },
        ]),
      ),
    [mailboxSummaryMap],
  );

  return (
    <div className="w-full flex flex-col h-full relative">
      {/* 운송장 출력 우편함 선택 다이얼로그 */}
      {reprintDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16">
          <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[75vh] flex flex-col overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <div className="font-semibold text-base text-slate-800">
                  운송장 출력 우편함 선택
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  총 {occupiedAddresses.length}개 우편함 (신규{" "}
                  {unprintedMailboxAddresses.length}개) ·{" "}
                  {reprintSelectedAddresses.size}개 선택됨
                </div>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                onClick={() => setReprintDialogOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* 엑셀 스타일 테이블: 행=BinRow, 열=BinCol */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full border-collapse select-none">
                <thead>
                  <tr>
                    {/* 좌상단 코너: 전체선택/해제 */}
                    <th className="w-14 h-10 border border-slate-200 bg-slate-50 rounded-tl">
                      <button
                        onClick={toggleReprintAll}
                        className="w-full h-full flex items-center justify-center group"
                        title="전체 선택/해제"
                      >
                        <span
                          className={`w-4 h-4 border-2 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${
                            occupiedAddresses.length > 0 &&
                            reprintSelectedAddresses.size ===
                              occupiedAddresses.length
                              ? "bg-blue-500 border-blue-500 text-white"
                              : reprintSelectedAddresses.size > 0
                                ? "bg-blue-100 border-blue-400 text-blue-600"
                                : "border-slate-300 group-hover:border-blue-400"
                          }`}
                        >
                          {occupiedAddresses.length > 0 &&
                          reprintSelectedAddresses.size ===
                            occupiedAddresses.length
                            ? "✓"
                            : reprintSelectedAddresses.size > 0
                              ? "−"
                              : ""}
                        </span>
                      </button>
                    </th>
                    {/* 열 헤더: BinCol — 클릭 시 열 전체 선택/해제 */}
                    {reprintBinCols.map((col) => {
                      const colAddrs = parsedTargetAddresses
                        .filter((p) => p.binCol === col)
                        .map((p) => p.addr)
                        .filter((a) => occupiedAddresses.includes(a));
                      const allSel =
                        colAddrs.length > 0 &&
                        colAddrs.every((a) => reprintSelectedAddresses.has(a));
                      const someSel =
                        !allSel &&
                        colAddrs.some((a) => reprintSelectedAddresses.has(a));
                      return (
                        <th
                          key={col}
                          onClick={() => toggleReprintByBinCol(col)}
                          className={`h-10 border border-slate-200 text-xs font-semibold font-mono cursor-pointer transition-colors px-2 ${
                            allSel
                              ? "bg-blue-500 text-white"
                              : someSel
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          }`}
                        >
                          {col}열
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {reprintBinRows.map((row) => {
                    const rowAddrs = parsedTargetAddresses
                      .filter((p) => p.binRow === row)
                      .map((p) => p.addr)
                      .filter((a) => occupiedAddresses.includes(a));
                    const allRowSel =
                      rowAddrs.length > 0 &&
                      rowAddrs.every((a) => reprintSelectedAddresses.has(a));
                    const someRowSel =
                      !allRowSel &&
                      rowAddrs.some((a) => reprintSelectedAddresses.has(a));
                    return (
                      <tr key={row}>
                        {/* 행 헤더: BinRow — 클릭 시 행 전체 선택/해제 */}
                        <td
                          onClick={() => toggleReprintByBinRow(row)}
                          className={`h-12 border border-slate-200 text-xs font-semibold font-mono cursor-pointer transition-colors text-center ${
                            allRowSel
                              ? "bg-blue-500 text-white"
                              : someRowSel
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          }`}
                        >
                          {row}행
                        </td>
                        {/* 셀: 각 BinCol × BinRow 교차점 */}
                        {reprintBinCols.map((col) => {
                          const addr = parsedTargetAddressByBinCell.get(
                            `${col}:${row}`,
                          );
                          const exists =
                            addr !== undefined &&
                            occupiedAddresses.includes(addr);
                          const selected =
                            exists && reprintSelectedAddresses.has(addr!);
                          const isPrinted =
                            exists && printedWorkflowAddressSet.has(addr!);
                          const isForceToday =
                            exists && forceTodayAddressSet.has(addr!);
                          const isNotToday =
                            exists &&
                            notTodayAddressSet.has(addr!) &&
                            !isForceToday;
                          const nextDayLabel = isNotToday
                            ? (mailboxShippingDayMap.get(addr!)?.nextDayLabel ??
                              null)
                            : null;
                          const count = exists
                            ? Number(
                                mailboxSummaryMap.get(addr!)?.requestCount || 0,
                              )
                            : 0;
                          return (
                            <td
                              key={col}
                              title={
                                isNotToday && nextDayLabel
                                  ? `다음 발송: ${nextDayLabel}요일`
                                  : undefined
                              }
                              onClick={() => {
                                if (!exists) return;
                                if (isNotToday && !selected) return;
                                setReprintSelectedAddresses((prev) => {
                                  const next = new Set(prev);
                                  if (selected) next.delete(addr!);
                                  else next.add(addr!);
                                  return next;
                                });
                              }}
                              className={`h-12 border border-slate-200 text-center transition-colors ${
                                !exists
                                  ? "bg-slate-50"
                                  : isNotToday
                                    ? "bg-amber-50 border-dashed border-amber-400 cursor-not-allowed opacity-70"
                                    : selected
                                      ? "bg-blue-500 cursor-pointer"
                                      : isPrinted
                                        ? "bg-slate-100 hover:bg-slate-50 cursor-pointer"
                                        : "bg-white hover:bg-blue-50 cursor-pointer"
                              }`}
                            >
                              {exists && (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  {isNotToday && nextDayLabel && (
                                    <div className="text-[9px] font-semibold text-amber-700 mb-0.5">
                                      다음 {nextDayLabel}요일
                                    </div>
                                  )}
                                  {isPrinted && !isNotToday && (
                                    <div className="text-[9px] font-semibold text-slate-500 mb-0.5">
                                      ✓ 출력됨
                                    </div>
                                  )}
                                  <span
                                    className={`text-xs font-mono font-semibold ${
                                      selected
                                        ? "text-white"
                                        : isPrinted
                                          ? "text-slate-600"
                                          : "text-slate-700"
                                    }`}
                                  >
                                    {addr}
                                  </span>
                                  {count > 0 && (
                                    <span
                                      className={`text-[10px] ${
                                        selected
                                          ? "text-blue-100"
                                          : isPrinted
                                            ? "text-slate-400"
                                            : "text-slate-400"
                                      }`}
                                    >
                                      {count}건
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 푸터 */}
            <div className="flex gap-2 justify-between items-center px-6 py-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                {reprintSelectedAddresses.size}개 선택됨
              </span>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 border border-slate-200"
                  onClick={() => setReprintDialogOpen(false)}
                >
                  취소
                </button>
                <button
                  className="px-5 py-2 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 font-medium"
                  disabled={reprintSelectedAddresses.size === 0}
                  onClick={handlePrintConfirm}
                >
                  운송장 출력 ({reprintSelectedAddresses.size}개)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {manualPickupDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <div className="font-semibold text-base text-slate-800">
                  수동 집하 반영
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  실제 택배사 접수 후 운송장 정보를 입력하면 추적관리로
                  반영됩니다.
                </div>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                onClick={() => setManualPickupDialogOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div className="text-xs text-slate-500">
                우편함별 운송장번호를 입력하세요. 집하 시각은 자동으로 당일
                16:00(KST)로 기록됩니다.
              </div>
              <div className="max-h-[360px] overflow-auto space-y-2 pr-1">
                {occupiedAddresses.map((addr) => {
                  const count = Number(
                    mailboxSummaryMap.get(addr)?.requestCount || 0,
                  );
                  return (
                    <div
                      key={addr}
                      className="grid grid-cols-[88px_1fr] items-center gap-2"
                    >
                      <div className="text-xs font-semibold text-slate-700">
                        {addr} ({count}건)
                      </div>
                      <input
                        value={manualPickupTrackingByAddress?.[addr] || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setManualPickupTrackingByAddress((prev) => ({
                            ...prev,
                            [addr]: value,
                          }));
                        }}
                        placeholder="운송장번호 입력"
                        className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 justify-end items-center px-6 py-4 border-t border-slate-100">
              <button
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 border border-slate-200"
                onClick={() => setManualPickupDialogOpen(false)}
              >
                취소
              </button>
              <button
                className="px-5 py-2 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 font-medium"
                disabled={isRequestingPickup}
                onClick={() => {
                  void handleManualPickupComplete();
                }}
              >
                {isRequestingPickup ? "반영 중..." : "수동 집하 반영"}
              </button>
            </div>
          </div>
        </div>
      )}

      <MailboxStickyHeader>
        <MailboxActionHeader
          isRequestingPickup={isRequestingPickup}
          actionButtons={actionButtons}
          onOpenPrinterSettings={() => setPrinterModalOpen(true)}
        />

        <MailboxPrintSettingsDialog
          open={printerModalOpen}
          onOpenChange={setPrinterModalOpen}
          printerProfile={printerProfile}
          setPrinterProfile={setPrinterProfile}
          paperProfile={paperProfile}
          setPaperProfile={setPaperProfile}
          paperOptions={paperOptions}
          paperLoading={paperLoading}
          paperError={paperError}
          printerOptions={printerOptions}
          printerLoading={printerLoading}
          printerError={printerError}
          shippingOutputMode={shippingOutputMode}
          setShippingOutputMode={setShippingOutputMode}
          onRefreshPrinters={() => void fetchPrinters()}
        />

        <MailboxShelfGroupTabs
          shelfGroups={shelfGroups}
          selectedGroupIdx={selectedGroupIdx}
          setSelectedGroupIdx={setSelectedGroupIdx}
        />
      </MailboxStickyHeader>

      <MailboxShelfGrid
        allShelvesToShow={allShelvesToShow}
        shelfRows={shelfRows}
        binCols={binCols}
        binRows={binRows}
        mailboxSummaryMap={mailboxShelfSummaryMap}
        printedMailboxes={printedMailboxes}
        pickupRequestedMailboxes={pickupRequestedMailboxes}
        failedMailboxes={failedMailboxes}
        mailboxShippingDayMap={mailboxShippingDayMap}
        forceTodayAddressSet={forceTodayAddressSet}
        shelfRefs={shelfRefs}
        scrollContainerRef={scrollContainerRef}
        handleTouchStart={handleTouchStart}
        handleTouchEnd={handleTouchEnd}
        getMailboxColorClass={getMailboxColorClass}
        onBoxClick={onBoxClick}
      />
    </div>
  );
};
