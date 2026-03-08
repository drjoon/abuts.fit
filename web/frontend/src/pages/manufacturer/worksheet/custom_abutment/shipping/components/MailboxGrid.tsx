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

type MailboxGridProps = {
  requests: ManufacturerRequest[];
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
};

export const MailboxGrid = ({ requests, onBoxClick }: MailboxGridProps) => {
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
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(
    new Set(),
  );
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [optimisticRequestedMailboxes, setOptimisticRequestedMailboxes] =
    useState<Set<string>>(new Set());
  const [optimisticPrintedMailboxes, setOptimisticPrintedMailboxes] = useState<
    Set<string>
  >(new Set());
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didInitSelectionRef = useRef(false);
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

  useEffect(() => {
    setSelectedMailboxes((prev) => {
      const next = new Set(
        Array.from(prev).filter((address) =>
          occupiedAddresses.includes(address),
        ),
      );

      if (!didInitSelectionRef.current) {
        didInitSelectionRef.current = true;
        return new Set(occupiedAddresses);
      }

      return next;
    });
  }, [occupiedAddresses]);

  const pickupRequestedMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const di =
        req?.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
          ? (req.deliveryInfoRef as any)
          : null;
      const hasPickup = Boolean(
        di?.trackingNumber ||
        di?.shippedAt ||
        di?.tracking?.lastStatusText ||
        String(req?.manufacturerStage || "").trim() === "추적관리",
      );
      const isDelivered = Boolean(di?.deliveredAt);
      const isCanceled =
        String(di?.tracking?.lastStatusText || "").trim() === "예약취소";
      if (hasPickup && !isDelivered && !isCanceled) {
        set.add(mailbox);
      }
    }
    for (const mailbox of optimisticRequestedMailboxes) {
      set.add(mailbox);
    }
    return set;
  }, [optimisticRequestedMailboxes, requests]);

  useEffect(() => {
    if (optimisticRequestedMailboxes.size === 0) return;
    setOptimisticRequestedMailboxes((prev) => {
      const next = new Set(prev);
      for (const mailbox of prev) {
        if (pickupRequestedMailboxes.has(mailbox)) {
          next.delete(mailbox);
        }
      }
      return next;
    });
  }, [optimisticRequestedMailboxes.size, pickupRequestedMailboxes]);

  useEffect(() => {
    if (optimisticPrintedMailboxes.size === 0) return;
    setOptimisticPrintedMailboxes((prev) => {
      const next = new Set(prev);
      for (const mailbox of prev) {
        const mailboxRequests = requests.filter(
          (req) => String(req?.mailboxAddress || "").trim() === mailbox,
        );
        if (
          mailboxRequests.length > 0 &&
          mailboxRequests.every((req) =>
            Boolean((req as any)?.shippingLabelPrinted?.printed),
          )
        ) {
          next.delete(mailbox);
        }
      }
      return next;
    });
  }, [optimisticPrintedMailboxes.size, requests]);

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
    for (const mailbox of optimisticPrintedMailboxes) {
      set.add(mailbox);
    }
    return set;
  }, [optimisticPrintedMailboxes, requests]);

  const selectedOccupiedAddresses = useMemo(
    () => occupiedAddresses.filter((addr) => selectedMailboxes.has(addr)),
    [occupiedAddresses, selectedMailboxes],
  );

  const selectedRequestedAddresses = useMemo(
    () =>
      selectedOccupiedAddresses.filter((addr) =>
        pickupRequestedMailboxes.has(addr),
      ),
    [selectedOccupiedAddresses, pickupRequestedMailboxes],
  );

  const selectedRequestedOrOptimisticAddresses = useMemo(() => {
    const requested = selectedOccupiedAddresses.filter((addr) =>
      pickupRequestedMailboxes.has(addr),
    );
    if (requested.length > 0) return requested;
    return selectedOccupiedAddresses.filter((addr) =>
      optimisticRequestedMailboxes.has(addr),
    );
  }, [
    optimisticRequestedMailboxes,
    pickupRequestedMailboxes,
    selectedOccupiedAddresses,
  ]);

  const selectedMailboxRequests = useMemo(() => {
    const byMailbox = new Map<string, ManufacturerRequest[]>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox || !selectedMailboxes.has(mailbox)) continue;
      if (!byMailbox.has(mailbox)) byMailbox.set(mailbox, []);
      byMailbox.get(mailbox)?.push(req);
    }
    return byMailbox;
  }, [requests, selectedMailboxes]);

  const selectedRequestedMailboxChanges = useMemo(() => {
    return selectedRequestedOrOptimisticAddresses.map((address) => {
      const mailboxRequests = selectedMailboxRequests.get(address) || [];
      const currentRequestIds = mailboxRequests
        .map((req) => String(req?.requestId || "").trim())
        .filter(Boolean)
        .sort();
      const printedMeta = mailboxRequests[0]?.shippingLabelPrinted;
      const previousRequestIds = Array.isArray(printedMeta?.snapshotRequestIds)
        ? printedMeta.snapshotRequestIds
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .sort()
        : [];
      const previousFingerprint = String(
        printedMeta?.snapshotFingerprint || "",
      ).trim();
      const currentFingerprint = JSON.stringify(
        currentRequestIds.map((requestId) => ({ address, requestId })),
      );
      const changed =
        !previousFingerprint || previousFingerprint !== currentFingerprint;

      return {
        address,
        changed,
        currentRequestIds,
        previousRequestIds,
      };
    });
  }, [selectedMailboxRequests, selectedRequestedOrOptimisticAddresses]);

  const hasModifiedRequestedSelection = useMemo(
    () =>
      selectedRequestedMailboxChanges.some((item) => {
        const backendMeta = mailboxChangeMeta[item.address];
        return backendMeta ? backendMeta.changed : item.changed;
      }),
    [mailboxChangeMeta, selectedRequestedMailboxChanges],
  );

  const toggleMailboxSelection = (address: string) => {
    setSelectedMailboxes((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  };

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
        title: "출력 준비 실패",
        description: "address_list에서 유효한 운송장 정보를 찾지 못했습니다.",
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

  const handlePickupWithLabel = async ({
    modifyOnly = false,
  }: {
    modifyOnly?: boolean;
  } = {}) => {
    const targetAddresses = modifyOnly
      ? selectedRequestedOrOptimisticAddresses
      : selectedOccupiedAddresses;

    if (targetAddresses.length === 0) {
      toast({
        title: "우편함 없음",
        description: modifyOnly
          ? "접수 내용 수정할 우편함을 선택해주세요."
          : "택배 접수할 우편함을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    try {
      const { data, wblPrint } = await callHanjinApiWithMeta({
        path: "/api/requests/shipping/hanjin/pickup-and-print",
        mailboxAddresses: targetAddresses,
        wblPrintOptions: {
          printer: printerProfile || undefined,
          paperProfile,
        },
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

      setOptimisticRequestedMailboxes((prev) => {
        const next = new Set(prev);
        targetAddresses.forEach((address) => next.add(address));
        return next;
      });
      setOptimisticPrintedMailboxes((prev) => {
        const next = new Set(prev);
        targetAddresses.forEach((address) => next.add(address));
        return next;
      });

      if (shippingOutputMode === "image") {
        const candidatePayload =
          (wblPrint as any)?.data ||
          wblPrint ||
          (data as any)?.label ||
          (data as any);
        const printPayload = resolvePrintPayload(candidatePayload);

        if (printPayload) {
          await handleDownloadWaybillPdf(candidatePayload);
          toast({
            title: modifyOnly ? "접수 내용 수정 완료" : "택배 접수 완료",
            description: `${targetAddresses.length}개 우편함의 라벨 저장 후 접수가 완료되었습니다.`,
          });
          return;
        }

        if (Array.isArray((data as any)?.label?.address_list)) {
          await saveGeneratedWaybillPngs({
            addressList: (data as any).label.address_list,
            zplLabels: (data as any).label.zplLabels,
          });
          toast({
            title: modifyOnly ? "접수 내용 수정 완료" : "택배 접수 완료",
            description: `${targetAddresses.length}개 우편함의 라벨 저장 후 접수가 완료되었습니다.`,
          });
          return;
        }
      }

      if (wblPrint?.success) {
        toast({
          title: modifyOnly ? "접수 내용 수정 완료" : "택배 접수 완료",
          description: `${targetAddresses.length}개 우편함의 라벨 출력 후 접수가 완료되었습니다.`,
        });
        return;
      }

      if (
        wblPrint?.skipped &&
        wblPrint?.reason === "wbl_print_server_not_configured"
      ) {
        await triggerLocalPrint((data as any)?.label || data);
        toast({
          title: modifyOnly ? "접수 내용 수정 완료" : "택배 접수 완료",
          description: `${targetAddresses.length}개 우편함의 라벨 출력 후 접수가 완료되었습니다.`,
        });
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

      await triggerLocalPrint((data as any)?.label || data);
      toast({
        title: modifyOnly ? "접수 내용 수정 완료" : "택배 접수 완료",
        description: `${targetAddresses.length}개 우편함의 라벨 출력 후 접수가 완료되었습니다.`,
      });
    } catch (error) {
      if (!modifyOnly) {
        setOptimisticRequestedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.delete(address));
          return next;
        });
        setOptimisticPrintedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.delete(address));
          return next;
        });
        setMailboxChangeMeta((prev) => {
          const next = { ...prev };
          targetAddresses.forEach((address) => {
            delete next[address];
          });
          return next;
        });
      }
      console.error("택배 접수/라벨 처리 실패:", error);
      toast({
        title: modifyOnly ? "접수 내용 수정 실패" : "택배 접수 실패",
        description:
          error instanceof Error && error.message
            ? error.message
            : "택배 접수 및 라벨 출력에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
    }
  };

  const handlePickupAction = async () => {
    const requestedAddresses = selectedRequestedOrOptimisticAddresses;
    const hasRequestedPickup = requestedAddresses.length > 0;

    const targetAddresses = hasRequestedPickup
      ? requestedAddresses
      : selectedOccupiedAddresses;

    if (!targetAddresses.length) {
      toast({
        title: "접수 불가",
        description: "택배 접수 또는 취소할 우편함을 먼저 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    try {
      if (!hasRequestedPickup) {
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
        setOptimisticRequestedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.delete(address));
          return next;
        });
        setOptimisticPrintedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.delete(address));
          return next;
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
      if (hasRequestedPickup) {
        setOptimisticRequestedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.add(address));
          return next;
        });
        setOptimisticPrintedMailboxes((prev) => {
          const next = new Set(prev);
          targetAddresses.forEach((address) => next.add(address));
          return next;
        });
        setMailboxChangeMeta((prev) => {
          const next = { ...prev };
          targetAddresses.forEach((address) => {
            if (!next[address]) {
              next[address] = {
                changed: false,
                printed: true,
                currentRequestIds: [],
                previousRequestIds: [],
              };
            }
          });
          return next;
        });
      }
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : hasRequestedPickup
            ? "택배 수거 접수 취소에 실패했습니다."
            : "택배 수거 접수에 실패했습니다.";
      toast({
        title: hasRequestedPickup ? "취소 실패" : "택배 수거 접수 실패",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
    }
  };

  const canRequestPickup = selectedOccupiedAddresses.length > 0;

  const shouldShowModifyPickup =
    selectedRequestedOrOptimisticAddresses.length > 0;

  const hasRequestedSelection = shouldShowModifyPickup;

  const canModifyPickup = shouldShowModifyPickup;

  const modifyTargetCount = selectedRequestedOrOptimisticAddresses.length;

  const canCancelPickup = selectedRequestedOrOptimisticAddresses.length > 0;

  const selectedRequestedCount = selectedRequestedOrOptimisticAddresses.length;

  const pickupPrimaryLabel = hasRequestedSelection
    ? "↩️ 택배 취소"
    : "🚚 라벨 출력 후 택배 접수";

  const modifyPickupLabel = hasModifiedRequestedSelection
    ? "🔄 변경 내용 재출력 후 재접수"
    : "📝 접수 내용 수정";

  return (
    <div className="w-full flex flex-col h-full relative">
      <MailboxStickyHeader>
        <MailboxActionHeader
          isRequestingPickup={isRequestingPickup}
          hasRequestedSelection={hasRequestedSelection}
          canCancelPickup={canCancelPickup}
          canRequestPickup={canRequestPickup}
          shouldShowModifyPickup={shouldShowModifyPickup}
          canModifyPickup={canModifyPickup}
          modifyTargetCount={modifyTargetCount}
          pickupPrimaryLabel={pickupPrimaryLabel}
          modifyPickupLabel={modifyPickupLabel}
          selectedOccupiedCount={selectedOccupiedAddresses.length}
          selectedRequestedCount={selectedRequestedCount}
          onOpenPrinterSettings={() => setPrinterModalOpen(true)}
          onPrimaryAction={() => {
            if (hasRequestedSelection) {
              void handlePickupAction();
              return;
            }
            void handlePickupWithLabel();
          }}
          onModifyAction={() =>
            void handlePickupWithLabel({ modifyOnly: true })
          }
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
        optimisticRequestedMailboxes={optimisticRequestedMailboxes}
        selectedMailboxes={selectedMailboxes}
        shelfRefs={shelfRefs}
        scrollContainerRef={scrollContainerRef}
        handleTouchStart={handleTouchStart}
        handleTouchEnd={handleTouchEnd}
        toggleMailboxSelection={toggleMailboxSelection}
        getMailboxColorClass={getMailboxColorClass}
        onBoxClick={onBoxClick}
      />
    </div>
  );
};
