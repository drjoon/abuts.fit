import * as React from "react";
import type { ManufacturerRequest } from "../../utils/request";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MailboxPickupStatus =
  | "none"
  | "printed"
  | "accepted"
  | "picked_up"
  | "completed"
  | "canceled"
  | "error";

type MailboxShelfGridProps = {
  allShelvesToShow: string[];
  shelfRows: string[];
  binCols: string[];
  binRows: string[];
  addressMap: Map<string, ManufacturerRequest[]>;
  printedMailboxes: Set<string>;
  pickupRequestedMailboxes: Map<string, MailboxPickupStatus>;
  failedMailboxes: Set<string>;
  shelfRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  getMailboxColorClass: (items: ManufacturerRequest[]) => string;
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
};

export const MailboxShelfGrid = ({
  allShelvesToShow,
  shelfRows,
  binCols,
  binRows,
  addressMap,
  printedMailboxes,
  pickupRequestedMailboxes,
  failedMailboxes,
  shelfRefs,
  scrollContainerRef,
  handleTouchStart,
  handleTouchEnd,
  getMailboxColorClass,
  onBoxClick,
}: MailboxShelfGridProps) => {
  void scrollContainerRef;

  const buildTooltipLabel = ({
    address,
    isOccupied,
    mailboxStatus,
  }: {
    address: string;
    isOccupied: boolean;
    mailboxStatus:
      | "없음"
      | "접수"
      | "운송장 출력"
      | "집하"
      | "완료"
      | "취소"
      | "오류 발생";
  }) => {
    const lines = [address];
    if (!isOccupied) {
      lines.push("빈 메일함");
      return lines.join("\n");
    }

    lines.push(`상태: ${mailboxStatus}`);
    return lines.join("\n");
  };

  return (
    <TooltipProvider>
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
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-md">
                  {binCols.map((bCol) => (
                    <div key={bCol} className="flex flex-col gap-1">
                      {binRows.map((bRow) => {
                        const address = `${shelf}${sRow}${bCol}${bRow}`;
                        const items = addressMap.get(address) || [];
                        const isOccupied = items.length > 0;
                        const hasPrinted = printedMailboxes.has(address);
                        const pickupStatus =
                          pickupRequestedMailboxes.get(address) || "none";
                        const showFailedBorder = failedMailboxes.has(address);
                        const isErrorStatus = pickupStatus === "error";
                        const showAcceptedBorder =
                          pickupStatus === "accepted" &&
                          !showFailedBorder &&
                          !isErrorStatus;
                        const showSuccessBorder =
                          (pickupStatus === "picked_up" ||
                            pickupStatus === "completed") &&
                          !showFailedBorder &&
                          !isErrorStatus;
                        const showPrintedBorder =
                          pickupStatus === "printed" &&
                          !showAcceptedBorder &&
                          !showSuccessBorder &&
                          !showFailedBorder &&
                          !isErrorStatus;
                        const mailboxStatus =
                          showFailedBorder || isErrorStatus
                            ? "오류 발생"
                            : pickupStatus === "completed"
                              ? "완료"
                              : pickupStatus === "picked_up"
                                ? "집하"
                                : pickupStatus === "accepted"
                                  ? "접수"
                                  : pickupStatus === "printed"
                                    ? "운송장 출력"
                                    : pickupStatus === "canceled"
                                      ? "취소"
                                      : "없음";

                        const handleOpenDetails = (
                          e: React.MouseEvent | React.TouchEvent,
                        ) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isOccupied && onBoxClick) {
                            onBoxClick(address, items);
                          }
                        };

                        const tooltipLabel = buildTooltipLabel({
                          address,
                          isOccupied,
                          mailboxStatus,
                        });

                        return (
                          <Tooltip key={address}>
                            <TooltipTrigger asChild>
                              <div
                                onClick={handleOpenDetails}
                                onTouchEnd={handleOpenDetails}
                                data-printed={hasPrinted ? "1" : "0"}
                                className={`
                                  relative flex flex-col items-center justify-between p-1 rounded border transition-all select-none
                                  bg-white border-slate-200
                                  ${isOccupied ? "cursor-pointer hover:shadow-md" : ""}
                                `}
                                style={{
                                  width: "62px",
                                  height: "44px",
                                  touchAction: "manipulation",
                                }}
                              >
                                {showSuccessBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-blue-600" />
                                ) : null}
                                {showAcceptedBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-dashed border-blue-600" />
                                ) : null}
                                {showPrintedBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-dashed border-slate-900" />
                                ) : null}
                                {showFailedBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-red-600" />
                                ) : null}
                                <div
                                  className={`font-mono font-bold leading-none text-center w-full pointer-events-none ${
                                    showAcceptedBorder
                                      ? "text-blue-700"
                                      : showSuccessBorder
                                        ? "text-blue-700"
                                        : showPrintedBorder
                                          ? "text-slate-900"
                                          : isOccupied
                                            ? getMailboxColorClass(
                                                items,
                                              ).includes("bg-blue")
                                              ? "text-blue-800"
                                              : getMailboxColorClass(
                                                    items,
                                                  ).includes("bg-red")
                                                ? "text-red-800"
                                                : "text-slate-700"
                                            : "text-slate-400"
                                  }`}
                                  style={{ fontSize: "9px" }}
                                >
                                  {address}
                                </div>
                                <div className="flex-1 flex items-center justify-center">
                                  {isOccupied && (
                                    <button
                                      type="button"
                                      onClick={handleOpenDetails}
                                      className={`font-bold leading-none ${
                                        showSuccessBorder
                                          ? "text-blue-700"
                                          : showAcceptedBorder
                                            ? "text-blue-700"
                                            : showPrintedBorder
                                              ? "text-slate-900"
                                              : getMailboxColorClass(
                                                    items,
                                                  ).includes("bg-blue")
                                                ? "text-blue-700"
                                                : getMailboxColorClass(
                                                      items,
                                                    ).includes("bg-red")
                                                  ? "text-red-700"
                                                  : "text-slate-700"
                                      }`}
                                      style={{ fontSize: "18px" }}
                                      aria-label={`${address} 내용 보기`}
                                    >
                                      {items.length}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="whitespace-pre-line max-w-[240px]"
                            >
                              {tooltipLabel}
                            </TooltipContent>
                          </Tooltip>
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
    </TooltipProvider>
  );
};
