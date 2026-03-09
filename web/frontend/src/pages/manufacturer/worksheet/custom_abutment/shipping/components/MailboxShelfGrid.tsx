import type React from "react";
import type { ManufacturerRequest } from "../../utils/request";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MailboxPickupStatus = "none" | "requested" | "success" | "canceled";

type MailboxShelfGridProps = {
  allShelvesToShow: string[];
  shelfRows: string[];
  binCols: string[];
  binRows: string[];
  addressMap: Map<string, ManufacturerRequest[]>;
  printedMailboxes: Set<string>;
  pickupRequestedMailboxes: Map<string, MailboxPickupStatus>;
  failedMailboxes: Set<string>;
  selectedMailboxes: Set<string>;
  shelfRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  toggleMailboxSelection: (address: string) => void;
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
  selectedMailboxes,
  shelfRefs,
  scrollContainerRef,
  handleTouchStart,
  handleTouchEnd,
  toggleMailboxSelection,
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
    mailboxStatus: "없음" | "녹색" | "주황" | "빨강";
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
                        const isSelected = selectedMailboxes.has(address);
                        const hasPrinted = printedMailboxes.has(address);
                        const pickupStatus =
                          pickupRequestedMailboxes.get(address) || "none";
                        const showFailedBorder = failedMailboxes.has(address);
                        const showSuccessBorder =
                          hasPrinted &&
                          pickupStatus === "success" &&
                          !showFailedBorder;
                        const showPrintedBorder =
                          hasPrinted && !showSuccessBorder && !showFailedBorder;
                        const showSelectedBorder = isOccupied && isSelected;
                        const mailboxStatus = showFailedBorder
                          ? "빨강"
                          : showSuccessBorder
                            ? "녹색"
                            : showPrintedBorder
                              ? "주황"
                              : "없음";

                        const handleClick = (
                          e: React.MouseEvent | React.TouchEvent,
                        ) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isOccupied) {
                            toggleMailboxSelection(address);
                          }
                        };

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
                                onClick={handleClick}
                                onTouchEnd={handleClick}
                                data-printed={hasPrinted ? "1" : "0"}
                                className={`
                                  relative flex flex-col items-center justify-between p-1 rounded border transition-all select-none
                                  ${
                                    isOccupied && showSuccessBorder
                                      ? "bg-emerald-50 border-emerald-200 shadow-sm"
                                      : isOccupied && showPrintedBorder
                                        ? "bg-white border-orange-400 shadow-sm"
                                        : showSelectedBorder
                                          ? "bg-indigo-50 border-indigo-300 shadow-sm"
                                          : isOccupied
                                            ? getMailboxColorClass(items)
                                            : "bg-white border-slate-200"
                                  }
                                `}
                                style={{
                                  width: "62px",
                                  height: "44px",
                                  touchAction: "manipulation",
                                }}
                              >
                                {showSuccessBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-emerald-500" />
                                ) : null}
                                {showPrintedBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-orange-400" />
                                ) : null}
                                {showFailedBorder ? (
                                  <div className="pointer-events-none absolute inset-0 rounded border-2 border-red-500" />
                                ) : null}
                                {showSelectedBorder ? (
                                  <div className="pointer-events-none absolute inset-[3px] rounded border-2 border-indigo-500" />
                                ) : null}
                                <div
                                  className={`font-mono font-bold leading-none text-center w-full pointer-events-none ${
                                    showSelectedBorder
                                      ? "text-indigo-800"
                                      : showSuccessBorder
                                        ? "text-emerald-800"
                                        : showPrintedBorder
                                          ? "text-orange-800"
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
                                        isSelected
                                          ? "text-indigo-700"
                                          : showSuccessBorder
                                            ? "text-emerald-700"
                                            : showPrintedBorder
                                              ? "text-orange-700"
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
