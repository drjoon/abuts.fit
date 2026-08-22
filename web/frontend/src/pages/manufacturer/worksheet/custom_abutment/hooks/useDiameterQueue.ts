// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering.ts
// - web/frontend/src/shared/ui/dashboard/WorksheetQueueSummary.tsx
// change-log:
// - 2026-08-22: 작업용 샘플(rnd/copied)도 직경 요약·버킷에 정식 의뢰와 동일하게 카운트.
// - 이전: isAnySampleRequest면 continue → "진행중인 의뢰 N건"과 6/8/10/12 카드 합이 어긋남.
import { useMemo } from "react";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import { type WorksheetQueueItem } from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import {
  type ManufacturerRequest,
  getDiameterBucketIndex,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

/**
 * 준비(의뢰) 탭 상단 직경별 요약 카드용 큐.
 *
 * SSOT (2026-08-22):
 * - `filteredAndSorted`에 이미 올라온 건은 **작업용 샘플 포함**해 6/8/10/12에 넣는다.
 * - R&D 보관 샘플(`rnd.doneAt!=null`)은 `requestFiltering`에서 공정 탭 목록에
 *   안 들어오므로 여기까지 오지 않는다. 이 훅에서 샘플을 다시 걸러내지 않는다.
 * - 헤더「진행중인 의뢰 N건」(`serverTotal`)과 직경 카드 합이 맞아야 한다.
 */
export const useDiameterQueue = (filteredAndSorted: ManufacturerRequest[]) => {
  const diameterQueueForReceive = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "12"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "12": [],
    };

    for (const req of filteredAndSorted) {
      // 헥스 확인용 무료 샘플(copied_sample) 포함 — 정식 의뢰와 동일 버킷.
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.maxDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.business || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
        connectionDiameter:
          typeof caseInfos.connectionDiameter === "number" &&
          Number.isFinite(caseInfos.connectionDiameter)
            ? caseInfos.connectionDiameter
            : null,
        maxDiameter:
          typeof caseInfos.maxDiameter === "number" &&
          Number.isFinite(caseInfos.maxDiameter)
            ? caseInfos.maxDiameter
            : null,
        camDiameter:
          typeof req.productionSchedule?.diameter === "number" &&
          Number.isFinite(req.productionSchedule.diameter)
            ? req.productionSchedule.diameter
            : null,
        programText: req.description,
        qty: 1,
      };

      if (bucketIndex === 0) {
        counts[0]++;
        buckets["6"].push(item);
      } else if (bucketIndex === 1) {
        counts[1]++;
        buckets["8"].push(item);
      } else if (bucketIndex === 2) {
        counts[2]++;
        buckets["10"].push(item);
      } else {
        counts[3]++;
        buckets["12"].push(item);
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total, buckets };
  }, [filteredAndSorted]);

  return diameterQueueForReceive;
};
