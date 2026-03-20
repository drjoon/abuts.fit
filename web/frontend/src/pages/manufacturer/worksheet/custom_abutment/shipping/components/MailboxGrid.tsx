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
    "print" | "pickup" | "mock" | null
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
  }, [requests, workflowOverrideByRequestId]);

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
      for (const req of requests) {
        const mailboxAddress = String(req?.mailboxAddress || "").trim();
        const requestId = String(req?.requestId || "").trim();
        if (!mailboxAddress || !requestId) continue;
        if (!targetMailboxSet.has(mailboxAddress)) continue;
        if (!(requestId in next)) continue;
        delete next[requestId];
        changed = true;
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
      for (const req of requests) {
        const mailboxAddress = String(req?.mailboxAddress || "").trim();
        const requestId = String(req?.requestId || "").trim();
        if (!mailboxAddress || !requestId) continue;
        if (!targetMailboxSet.has(mailboxAddress)) continue;
        if (
          next[requestId]?.code === override.code &&
          next[requestId]?.label === override.label
        ) {
          continue;
        }
        next[requestId] = override;
        changed = true;
      }
      return changed ? next : prev;
    });
  };
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
    targetAddresses,
    modifyOnly = false,
  }: {
    targetAddresses?: string[];
    modifyOnly?: boolean;
  } = {}) => {
    const effectiveTargetAddresses = Array.isArray(targetAddresses)
      ? targetAddresses
      : occupiedAddresses;
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
        description: `${effectiveTargetAddresses.length}개 우편함의 운송장을 출력합니다.`,
      });
      const needsPickupBeforePrint = modifyOnly
        ? effectiveTargetAddresses.some((addr) => {
            const status = pickupRequestedMailboxes.get(addr);
            return status !== "accepted" && status !== "picked_up";
          })
        : false;
      const response =
        modifyOnly && needsPickupBeforePrint
          ? await callHanjinApiWithMeta({
              path: "/api/requests/shipping/hanjin/pickup-and-print",
              mailboxAddresses: effectiveTargetAddresses,
              wblPrintOptions: {
                printer: printerProfile || undefined,
                paperProfile,
                shippingOutputMode,
              } as any,
            })
          : await callHanjinApiWithMeta({
              path: "/api/requests/shipping/hanjin/print-labels",
              mailboxAddresses: effectiveTargetAddresses,
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
      if (modifyOnly && effectiveTargetAddresses.length > 0) {
        applyWorkflowOverrideForMailboxes(effectiveTargetAddresses, {
          code: "accepted",
          label: "접수",
        });
      }

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
          : effectiveTargetAddresses.length;
      const completedPrintDescriptionImage = `${completedPrintCount}개 우편함의 라벨을 저장했습니다.`;
      const completedPrintDescriptionPrint = `${completedPrintCount}개 우편함의 라벨 출력이 완료되었습니다.`;
      const queuedPrintDescription = `${completedPrintCount}개 우편함의 라벨 출력 요청을 접수했습니다.`;

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

  const handleMockPickupComplete = async () => {
    const mailboxAddresses = Array.from(
      new Set(
        occupiedAddresses
          .map((address) => String(address || "").trim())
          .filter(Boolean),
      ),
    );

    if (!mailboxAddresses.length) {
      toast({
        title: "MOCK 집하 대상 없음",
        description: "집하 완료로 반영할 우편함이 없습니다.",
      });
      return;
    }

    setIsRequestingPickup(true);
    setActiveHeaderAction("mock");
    try {
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/mock-pickup-complete",
        method: "POST",
        jsonBody: { mailboxAddresses },
      });
      const body = response.data as any;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "MOCK 집하 처리에 실패했습니다.");
      }

      toast({
        title: "MOCK 집하 완료",
        description: `${Number(body?.data?.pickedUpCount || 0)}개 우편함을 집하 완료로 반영했습니다.`,
      });
    } catch (error) {
      toast({
        title: "MOCK 집하 실패",
        description:
          error instanceof Error ? error.message : "MOCK 집하에 실패했습니다.",
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
    const workflowCodesByMailbox = new Map<string, Set<string>>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const requestId = String(req?.requestId || "").trim();
      const workflowCode = String(
        workflowOverrideByRequestId[requestId]?.code ||
          req?.shippingWorkflow?.code ||
          "",
      ).trim();
      if (!workflowCodesByMailbox.has(mailbox)) {
        workflowCodesByMailbox.set(mailbox, new Set<string>());
      }
      if (workflowCode) {
        workflowCodesByMailbox.get(mailbox)?.add(workflowCode);
      }
    }

    const map = new Map<string, MailboxPickupStatus>();
    for (const [mailbox, codes] of workflowCodesByMailbox.entries()) {
      let nextStatus: MailboxPickupStatus = "none";
      if (codes.has("error")) nextStatus = "error";
      else if (codes.has("canceled")) nextStatus = "canceled";
      else if (codes.has("completed")) nextStatus = "completed";
      else if (codes.has("picked_up")) nextStatus = "picked_up";
      else if (codes.has("accepted")) nextStatus = "accepted";
      else if (codes.has("printed")) nextStatus = "printed";
      map.set(mailbox, nextStatus);
    }

    return map;
  }, [requests, workflowOverrideByRequestId]);

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
        return status === "printed" || printedMailboxes.has(addr);
      }),
    [occupiedAddresses, pickupRequestedMailboxes, printedMailboxes],
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
    try {
      await request<any>({
        path: "/api/requests/shipping/mailbox-reset-working-state",
        method: "POST",
        jsonBody: {
          mailboxAddresses: occupiedAddresses,
        },
      });

      setMailboxChangeMeta({});
      clearWorkflowOverridesForMailboxes(occupiedAddresses);
      setFailedMailboxes(new Set());

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
          applyWorkflowOverrideForMailboxes(successfulMailboxAddresses, {
            code: "accepted",
            label: "접수",
          });
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
        const updatedIds = Array.isArray((cancelResponse as any)?.results)
          ? (cancelResponse as any).results
              .flatMap((item: any) =>
                Array.isArray(item?.updatedIds) ? item.updatedIds : [],
              )
              .map((value: any) => String(value || "").trim())
              .filter(Boolean)
          : [];
        if (updatedIds.length) {
          setWorkflowOverrideByRequestId((prev) => {
            const next = { ...prev };
            updatedIds.forEach((requestId) => {
              next[requestId] = {
                code: "canceled",
                label: "취소",
              };
            });
            return next;
          });
        }
        setMailboxChangeMeta((prev) => {
          const next = { ...prev };
          successfulMailboxAddresses.forEach((address) => {
            delete next[address];
          });
          return next;
        });
        setFailedMailboxes((prev) => {
          const next = new Set(prev);
          successfulMailboxAddresses.forEach((addr) => next.delete(addr));
          failedMailboxAddresses.forEach((addr) => next.add(addr));
          return next;
        });
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

  const canRequestPickup = occupiedAddresses.length > 0;

  const canPrintLabels = acceptedAddresses.length > 0;

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

  const canReprintChangedMailboxes = shouldReprintChangedOnly;

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
      label: pickupActionLabel,
      loading: activeHeaderAction === "pickup" && isRequestingPickup,
      loadingLabel: pickupActionLoadingLabel,
      disabled: pickupActionDisabled,
      variant: hasAcceptedMailbox ? ("rose" as const) : ("slate" as const),
      onClick: () => {
        void handlePickupAction();
      },
    },
    {
      label: printActionLabel,
      loading: activeHeaderAction === "print" && isRequestingPickup,
      loadingLabel: "출력 중...",
      disabled: hasPrintedMailbox
        ? !canReprintChangedMailboxes
        : !canPrintLabels,
      variant: "blue" as const,
      onClick: () => {
        if (hasPrintedMailbox) {
          if (!canReprintChangedMailboxes) {
            toast({
              title: "재출력 불가",
              description: "메일함 내용이 바뀐 경우에만 재출력할 수 있습니다.",
              variant: "destructive",
            });
            return;
          }
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
      label: "임시: 리셋",
      loading: activeHeaderAction === null && isRequestingPickup,
      loadingLabel: "리셋 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "white" as const,
      onClick: () => {
        void handleTemporaryReset();
      },
    },
    {
      label: "MOCK 집하",
      loading: activeHeaderAction === "mock" && isRequestingPickup,
      loadingLabel: "집하 중...",
      disabled: !hasAnyOccupiedMailbox,
      variant: "white" as const,
      onClick: () => {
        void handleMockPickupComplete();
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
