// change-log:
// - 2026-08-16: acceptingLab 안내 문구 제거(기공소·기공의뢰는 수신 카드만).
// - 2026-08-15: acceptingLab — 안내 문구만. PTX CA는 수신 카드에서 처리(디자인큐 카드 중복·이형 방지).
// - 2026-08-15: 수락 기공소는 본인 기공의뢰(CA) 디자인 큐(/my). 파트너는 기존 /all.
// - 2026-08-15: 카피 — 수락 기공소가 디자인·업로드 시 제조 주문.
// - 2026-08-11: DesignPage 삭제 → 의뢰수신 내장 섹션으로 통합(독립 페이지/사이드메뉴 없음).
// - 2026-08-11: 로딩/서스펜스·빈 목록 시 빈 상태 카드 미표시(의뢰수신 전송 내역과 중복 방지).
// - 2026-08-10: detailMode=transferChat — 기공의뢰서형 카드·상세/채팅 모달.
// - 2026-08-10: 디자인 큐를 제조사 → 지정 의뢰자(designAccessEnabled)로 이전.
// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestCardGrid.tsx
import { Suspense, lazy } from "react";
import { CircleHelp } from "lucide-react";
import {
  deriveStageForFilter,
  isDesignCustomAbutmentRequest,
  PRODUCT_MODE,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RequestPage = lazy(() =>
  import(
    "@/pages/manufacturer/worksheet/custom_abutment/components/RequestPage"
  ).then((m) => ({
    default: m.RequestPage,
  })),
);

export type DesignQueueListMode = "partner" | "acceptingLab";

/**
 * 의뢰수신에 편입된 디자인+생산(준비) 큐.
 * PeriodFilter는 상위(의뢰수신)에서 공유한다.
 * - partner: 디자인 파트너 전역 큐(/all), 기공의뢰(PTX) 제외
 * - acceptingLab: 렌더 없음(PTX CA 업로드·완료는 수신 카드)
 */
export const DesignQueueSection = ({
  listMode = "partner",
}: {
  listMode?: DesignQueueListMode;
}) => {
  if (listMode === "acceptingLab") return null;

  return (
    <div className="w-full min-h-0 flex flex-col items-stretch">
      <TooltipProvider>
        <div className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>커스텀 어벗 디자인은 1영업일 내 기공소 전달</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex hover:text-foreground"
                aria-label="커스텀 어벗 디자인 책임 안내"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-relaxed">
              레거시 어벗츠 디자인+생산 큐입니다(신규 유입 없음). 기공의뢰
              커스텀어벗 디자인은 수락 기공소가 담당하며 기공소 수가에
              포함됩니다.
              <br />
              작업 완료 책임은 의뢰를 수락한 기공소에 있으며, 지연 시 치과와 미리
              상의하세요.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <Suspense fallback={null}>
        <RequestPage
          showQueueBar={false}
          showBulkCamRegenerate={false}
          useManufacturerQueueList={true}
          detailMode="transferChat"
          productMode={PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT}
          filterRequests={(req) =>
            isDesignCustomAbutmentRequest(req) &&
            deriveStageForFilter(req) === "준비"
          }
        />
      </Suspense>
    </div>
  );
};

/** @deprecated DesignQueueSection 사용 */
export const DesignPage = DesignQueueSection;
/** @deprecated DesignQueueSection 사용 */
export const ManufacturerDesignPage = DesignQueueSection;
