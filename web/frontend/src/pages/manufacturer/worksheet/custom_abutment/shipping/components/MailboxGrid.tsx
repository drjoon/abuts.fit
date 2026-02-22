import { useMemo, useState, useRef, useEffect } from "react";
import type { ManufacturerRequest } from "../../utils/request";
import { Badge } from "@/components/ui/badge";

type MailboxGridProps = {
  requests: ManufacturerRequest[];
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
};

// Mock API functions for shipping operations
const mockPrintShippingLabels = async (mailboxAddresses: string[]) => {
  console.log("📦 운송장 출력 API 호출 (Mock):", mailboxAddresses);
  // TODO: 한진택배 API 연결
  return new Promise((resolve) => setTimeout(resolve, 500));
};

const mockRequestPickup = async (mailboxAddresses: string[]) => {
  console.log("🚚 택배 수거 접수 API 호출 (Mock):", mailboxAddresses);
  // TODO: 택배사 API 연결
  return new Promise((resolve) => setTimeout(resolve, 500));
};

export const MailboxGrid = ({ requests, onBoxClick }: MailboxGridProps) => {
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Handle printing shipping labels
  const handlePrintLabels = async () => {
    if (occupiedAddresses.length === 0) {
      alert("운송장을 출력할 우편함이 없습니다.");
      return;
    }

    setIsPrinting(true);
    try {
      await mockPrintShippingLabels(occupiedAddresses);
      // Mark all occupied mailboxes as printed
      setPrintedMailboxes(new Set(occupiedAddresses));
      alert(`${occupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`);
    } catch (error) {
      console.error("운송장 출력 실패:", error);
      alert("운송장 출력에 실패했습니다.");
    } finally {
      setIsPrinting(false);
    }
  };

  // Handle requesting pickup
  const handleRequestPickup = async () => {
    const printedAddresses = occupiedAddresses.filter((addr) =>
      printedMailboxes.has(addr),
    );

    if (printedAddresses.length === 0) {
      alert(
        "택배 수거를 접수할 우편함이 없습니다. 먼저 운송장을 출력해주세요.",
      );
      return;
    }

    setIsRequestingPickup(true);
    try {
      await mockRequestPickup(printedAddresses);
      alert(
        `${printedAddresses.length}개 우편함의 택배 수거가 접수되었습니다.`,
      );
    } catch (error) {
      console.error("택배 수거 접수 실패:", error);
      alert("택배 수거 접수에 실패했습니다.");
    } finally {
      setIsRequestingPickup(false);
    }
  };

  return (
    <div className="w-full flex flex-col h-full">
      {/* 고정 영역: 운송장 출력/택배 수거 접수 + 선반 그룹 버튼 */}
      <div className="flex-shrink-0 w-full bg-white/98 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        {/* 운송장 출력 및 택배 수거 접수 버튼 */}
        <div className="flex gap-2 justify-center py-2 px-2 border-b border-slate-100">
          <button
            onClick={handlePrintLabels}
            disabled={isPrinting || occupiedAddresses.length === 0}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
              isPrinting || occupiedAddresses.length === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-green-600 text-white border-green-600 hover:bg-green-700 shadow-sm"
            }`}
          >
            {isPrinting ? "출력 중..." : "📦 운송장 출력"}
          </button>
          <button
            onClick={handleRequestPickup}
            disabled={
              isRequestingPickup ||
              occupiedAddresses.filter((addr) => printedMailboxes.has(addr))
                .length === 0
            }
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
              isRequestingPickup ||
              occupiedAddresses.filter((addr) => printedMailboxes.has(addr))
                .length === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm"
            }`}
          >
            {isRequestingPickup ? "접수 중..." : "🚚 택배 수거 접수"}
          </button>
        </div>

        {/* 선반 그룹 선택 라디오/버튼 그룹 */}
        <div className="flex flex-wrap gap-1.5 justify-center py-2 px-2">
          {shelfGroups.map((group, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGroupIdx(idx)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border ${
                idx === selectedGroupIdx
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
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
                                  ? "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md"
                                  : "bg-white border-slate-200"
                              }
                            `}
                            style={{
                              width: "48px",
                              height: "56px",
                              touchAction: "manipulation",
                            }}
                          >
                            {/* 상단 라벨 */}
                            <div
                              className={`font-mono font-bold leading-none text-center w-full pointer-events-none ${
                                isOccupied ? "text-blue-800" : "text-slate-400"
                              }`}
                              style={{ fontSize: "9px" }}
                            >
                              {address}
                            </div>
                            {/* 중앙 카운트 */}
                            <div className="flex-1 flex items-center justify-center pointer-events-none">
                              {isOccupied && (
                                <div
                                  className="font-bold text-blue-700 leading-none"
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
