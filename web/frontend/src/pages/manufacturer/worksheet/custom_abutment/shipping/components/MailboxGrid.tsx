import { useMemo, useState, useRef, useEffect } from "react";
import type { ManufacturerRequest } from "../../utils/request";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  callHanjinApi,
  callHanjinApiWithMeta,
  handleDownloadWaybillPdf,
  resolvePrintPayload,
  saveGeneratedWaybillPngs,
} from "./mailboxGrid.helpers";
import { MailboxActionHeader } from "./MailboxActionHeader";
import { MailboxShelfGrid } from "./MailboxShelfGrid";
import { MailboxPrintSettingsDialog } from "./MailboxPrintSettingsDialog";
import { MailboxShelfGroupTabs } from "./MailboxShelfGroupTabs";
import { MailboxStickyHeader } from "./MailboxStickyHeader";
import { useMailboxPrintSettings } from "./useMailboxPrintSettings";

type MailboxPickupStatus =
  | "none"
  | "printed"
  | "accepted"
  | "picked_up"
  | "completed"
  | "canceled"
  | "error";

type MailboxGridProps = {
  requests: ManufacturerRequest[];
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
  onMailboxError?: (address: string, message: string) => void;
};

export const MailboxGrid = ({
  requests,
  onBoxClick,
  onMailboxError,
}: MailboxGridProps) => {
  const { toast } = useToast();
  const shelfNames = Array.from({ length: 24 }, (_, i) =>
    String.fromCharCode(65 + i),
  );
  const shelfGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i < Math.min(9, shelfNames.length); i += 3) {
      groups.push(shelfNames.slice(i, i + 3));
    }
    return groups;
  }, [shelfNames]);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [activeHeaderAction, setActiveHeaderAction] = useState<
    "print" | "pickup" | null
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
  const lastRealtimeSampleSigRef = useRef<string>("");
  const lastRealtimeSampleAtRef = useRef<number>(0);
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

  useEffect(() => {
    if (!requests.length) return;
    const sampleRaw = requests
      .filter((req) => String(req?.mailboxAddress || "").trim())
      .slice(0, 12)
      .map((req) => ({
        requestId: String(req?.requestId || "").trim(),
        mailboxAddress: String(req?.mailboxAddress || "").trim(),
        shippingWorkflowCode: String(req?.shippingWorkflow?.code || "").trim(),
        shippingWorkflowLabel: String(
          req?.shippingWorkflow?.label || "",
        ).trim(),
        shippingLabelPrinted: Boolean(
          (req as any)?.shippingLabelPrinted?.printed,
        ),
      }));

    const sig = JSON.stringify(sampleRaw);
    const now = Date.now();
    const shouldEmit =
      sig !== lastRealtimeSampleSigRef.current &&
      now - lastRealtimeSampleAtRef.current > 2000;
    if (!shouldEmit) return;

    lastRealtimeSampleSigRef.current = sig;
    lastRealtimeSampleAtRef.current = now;
    console.log("[shipping][mailbox][realtime] requests sample", {
      size: requests.length,
      sample: sampleRaw,
    });
  }, [requests]);
  const getMailboxColorClass = (items: ManufacturerRequest[]) => {
    if (items.length === 0) return "bg-white border-slate-200";
    const earliestShipDate = items.reduce((earliest, req) => {
      const shipYmd = req.timeline?.estimatedShipYmd;
      if (!shipYmd) return earliest;
      if (!earliest || shipYmd < earliest) return shipYmd;
      return earliest;
    }, "");
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
    targetAddresses = occupiedAddresses,
    modifyOnly = false,
  }: {
    targetAddresses?: string[];
    modifyOnly?: boolean;
  } = {}) => {
    if (targetAddresses.length === 0) {
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
      console.log("[shipping][print] start", {
        targetAddresses,
        modifyOnly,
      });
      setFailedMailboxes((prev) => {
        const next = new Set(prev);
        targetAddresses.forEach((addr) => next.delete(addr));
        return next;
      });
      toast({
        title: modifyOnly ? "운송장 재출력 시작" : "운송장 출력 시작",
        description: `${targetAddresses.length}개 우편함의 운송장을 출력합니다.`,
      });
      const { data, wblPrint } = await callHanjinApiWithMeta({
        path: "/api/requests/shipping/hanjin/print-labels",
        mailboxAddresses: targetAddresses,
        wblPrintOptions: {
          printer: printerProfile || undefined,
          paperProfile,
        },
      });

      console.log("[shipping][print] api response", {
        mailboxAddresses: targetAddresses,
        changedMailboxAddresses: (data as any)?.changedMailboxAddresses,
        mailboxChanges: (data as any)?.mailboxChanges,
        pickupUpdatedMailboxAddresses: (data as any)
          ?.pickupUpdatedMailboxAddresses,
        wblPrint,
      });

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

      const notifyPickupUpdated = () => {
        if (!modifyOnly || pickupUpdatedMailboxAddresses.length === 0) return;
        toast({
          title: "택배 접수 업데이트 완료",
          description: `${pickupUpdatedMailboxAddresses.length}개 우편함의 접수 정보를 갱신했습니다.`,
        });
      };
      const completedPrintCount =
        modifyOnly && changedMailboxAddressSet.size > 0
          ? changedMailboxAddressSet.size
          : targetAddresses.length;
      const completedPrintDescriptionImage = `${completedPrintCount}개 우편함의 라벨을 저장했습니다.`;
      const completedPrintDescriptionPrint = `${completedPrintCount}개 우편함의 라벨 출력이 완료되었습니다.`;

      if (shippingOutputMode === "image") {
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

        if (Array.isArray((data as any)?.address_list)) {
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
        targetAddresses,
        modifyOnly,
        error,
      });
      const failedFromMsgKey = resolveFailedMailboxesFromError(error);
      const failedTargets = failedFromMsgKey.addresses.length
        ? failedFromMsgKey.addresses
        : targetAddresses;
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
  const allShelvesToShow = shelfNames.slice(0, 9);
  const occupiedAddresses = useMemo(() => {
    return Array.from(addressMap.keys());
  }, [addressMap]);

  const pickupRequestedMailboxes = useMemo(() => {
    const map = new Map<string, MailboxPickupStatus>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const workflowCode = String(req?.shippingWorkflow?.code || "").trim();

      let nextStatus: MailboxPickupStatus = "none";
      if (workflowCode === "error") nextStatus = "error" as MailboxPickupStatus;
      else if (workflowCode === "canceled") nextStatus = "canceled";
      else if (workflowCode === "completed") nextStatus = "completed";
      else if (workflowCode === "picked_up") nextStatus = "picked_up";
      else if (workflowCode === "accepted") nextStatus = "accepted";
      else if (workflowCode === "printed") nextStatus = "printed";

      const prevStatus = map.get(mailbox);
      const priority: Record<MailboxPickupStatus, number> = {
        none: 0,
        printed: 1,
        accepted: 2,
        picked_up: 3,
        completed: 4,
        canceled: 5,
        error: 6,
      };
      if (!prevStatus || priority[nextStatus] >= priority[prevStatus]) {
        map.set(mailbox, nextStatus);
      }
    }
    return map;
  }, [requests]);

  const printedMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const printed = Boolean((req as any)?.shippingLabelPrinted?.printed);
      if (printed) {
        set.add(mailbox);
      }
    }
    return set;
  }, [requests]);

  useEffect(() => {
    if (failedMailboxes.size === 0) return;
    setFailedMailboxes((prev) => {
      const next = new Set(prev);
      for (const mailbox of prev) {
        const mailboxRequests = requests.filter(
          (req) => String(req?.mailboxAddress || "").trim() === mailbox,
        );
        const printedSuccessfully =
          mailboxRequests.length > 0 &&
          mailboxRequests.every((req) =>
            Boolean((req as any)?.shippingLabelPrinted?.printed),
          );
        if (printedSuccessfully) next.delete(mailbox);
      }
      return next;
    });
  }, [failedMailboxes.size, requests]);

  const resolveHanjinFailureMessage = (error: unknown) => {
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
  };

  const resolveFailedMailboxesFromError = (error: unknown) => {
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
  };

  const acceptedAddresses = useMemo(
    () =>
      occupiedAddresses.filter(
        (addr) => pickupRequestedMailboxes.get(addr) === "accepted",
      ),
    [occupiedAddresses, pickupRequestedMailboxes],
  );

  const printedWorkflowAddresses = useMemo(
    () =>
      occupiedAddresses.filter((addr) => {
        const status = pickupRequestedMailboxes.get(addr);
        return status === "printed";
      }),
    [occupiedAddresses, pickupRequestedMailboxes],
  );

  const printedMailboxChanges = useMemo(() => {
    return printedWorkflowAddresses.map((address) => {
      const backendMeta = mailboxChangeMeta[address];
      return {
        address,
        changed: backendMeta ? backendMeta.changed : false,
      };
    });
  }, [mailboxChangeMeta, printedWorkflowAddresses]);

  const hasModifiedPrintedMailbox = useMemo(
    () => printedMailboxChanges.some((item) => item.changed),
    [printedMailboxChanges],
  );

  const triggerLocalPrint = async (payload: any) => {
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

  const handlePickupAction = async (explicitTargetAddresses?: string[]) => {
    const normalizedExplicitTargets = Array.isArray(explicitTargetAddresses)
      ? explicitTargetAddresses.filter(Boolean)
      : [];
    const acceptedTargetAddresses = normalizedExplicitTargets.length
      ? normalizedExplicitTargets.filter(
          (addr) => pickupRequestedMailboxes.get(addr) === "accepted",
        )
      : acceptedAddresses;
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
          ? normalizedExplicitTargets
          : occupiedAddresses;

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
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup",
          mailboxAddresses: targetAddresses,
        });
        toast({
          title: "택배 수거 접수 완료",
          description: `${targetAddresses.length}개 우편함의 택배 수거가 접수되었습니다.`,
        });
      } else {
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup-cancel",
          mailboxAddresses: targetAddresses,
        });
        console.log("[shipping][pickup] cancel success", {
          mailboxAddresses: targetAddresses,
          timestamp: new Date().toISOString(),
        });
        setMailboxChangeMeta((prev) => {
          const next = { ...prev };
          targetAddresses.forEach((address) => {
            delete next[address];
          });
          return next;
        });
        toast({
          title: "택배 수거 취소 완료",
          description: `${targetAddresses.length}개 우편함의 택배 수거를 취소했습니다.`,
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

  const canRequestPickup = printedWorkflowAddresses.length > 0;

  const hasAcceptedMailbox = acceptedAddresses.length > 0;

  const canCancelPickup = acceptedAddresses.length > 0;

  const hasPrintedMailbox = printedWorkflowAddresses.length > 0;

  const hasAnyOccupiedMailbox = occupiedAddresses.length > 0;

  const changedPrintedAddresses = printedMailboxChanges
    .filter((item) => item.changed)
    .map((item) => item.address);

  const shouldReprintChangedOnly =
    hasPrintedMailbox &&
    hasModifiedPrintedMailbox &&
    changedPrintedAddresses.length > 0;

  const printActionLabel = hasPrintedMailbox
    ? "🖨️ 운송장 재출력"
    : "🖨️ 운송장 출력";

  const pickupActionLabel = hasAcceptedMailbox
    ? "↩️ 택배 취소"
    : "🚚 택배 접수";

  const pickupActionLoadingLabel = hasAcceptedMailbox
    ? "취소 중..."
    : "접수 중...";

  const pickupActionDisabled = hasAcceptedMailbox
    ? !canCancelPickup
    : !canRequestPickup;

  const actionButtons = [
    {
      label: printActionLabel,
      loading: activeHeaderAction === "print" && isRequestingPickup,
      loadingLabel: "출력 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "blue" as const,
      onClick: () => {
        if (shouldReprintChangedOnly) {
          void handlePrintOnly({
            targetAddresses: changedPrintedAddresses,
            modifyOnly: true,
          });
          return;
        }
        void handlePrintOnly();
      },
    },
    {
      label: pickupActionLabel,
      loading: activeHeaderAction === "pickup" && isRequestingPickup,
      loadingLabel: pickupActionLoadingLabel,
      disabled: pickupActionDisabled,
      variant: hasAcceptedMailbox ? ("rose" as const) : ("slate" as const),
      onClick: () => {
        void handlePickupAction();
      },
    },
  ];

  return (
    <div className="w-full flex flex-col h-full relative">
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
        addressMap={addressMap}
        printedMailboxes={printedMailboxes}
        pickupRequestedMailboxes={pickupRequestedMailboxes}
        failedMailboxes={failedMailboxes}
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
