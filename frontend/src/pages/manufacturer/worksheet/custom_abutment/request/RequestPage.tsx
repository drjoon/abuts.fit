import { useMemo, useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import { Card, CardContent } from "@/components/ui/card";
import {
  WorksheetDiameterQueueBar,
  type DiameterBucketKey,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import type { RequestBase } from "@/types/request";

type ManufacturerRequest = RequestBase & {
  status1?: string;
  status2?: string;
  referenceIds?: string[];
};

const getDiameterBucketIndex = (diameter?: number) => {
  if (diameter == null) return -1;
  if (diameter <= 6) return 0;
  if (diameter <= 8) return 1;
  if (diameter <= 10) return 2;
  return 3;
};

const WorksheetCardGrid = ({
  requests,
  onSelect,
}: {
  requests: ManufacturerRequest[];
  onSelect: (request: ManufacturerRequest) => void;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {requests.map((request) => {
      const caseInfos = request.caseInfos || {};
      const workType = (() => {
        // 1순위: caseInfos.workType (신규 필드)
        const ciWorkType = caseInfos.workType as
          | "abutment"
          | "crown"
          | "mixed"
          | "unknown"
          | undefined;

        if (ciWorkType === "abutment" || ciWorkType === "crown") {
          return ciWorkType;
        }
        if (ciWorkType === "mixed") return "mixed";
        return "unknown";
      })();

      return (
        <Card
          key={request._id}
          className="shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer h-full flex flex-col"
          onClick={() => onSelect(request)}
        >
          <CardContent className="pt-6 flex-1 flex flex-col justify-between">
            <div className="space-y-2 text-[12px] text-slate-700">
              {request.referenceIds && request.referenceIds.length > 0 && (
                <div className="mb-2">
                  {(() => {
                    const first = request.referenceIds![0];
                    const extraCount = request.referenceIds!.length - 1;
                    const label =
                      extraCount > 0 ? `${first} 외 ${extraCount}건` : first;
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                        Ref: {label}
                      </span>
                    );
                  })()}
                </div>
              )}
              {(() => {
                const bucketIndex = getDiameterBucketIndex(
                  caseInfos.connectionDiameter
                );
                const labels = ["6", "8", "10", "10+"];

                if (bucketIndex === -1) {
                  return (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {workType === "crown" ? "크라운" : "기타"}
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-blue-700">
                      {caseInfos.connectionDiameter?.toFixed(2)}mm
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex gap-1">
                        {labels.map((label, index) => (
                          <div
                            key={label}
                            className={`flex-1 h-1.5 rounded-full ${
                              index <= bucketIndex
                                ? "bg-blue-500"
                                : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1 text-[11px] text-slate-500">
                        {labels.map((label, index) => (
                          <span
                            key={label}
                            className={
                              index === bucketIndex
                                ? "font-semibold text-slate-700"
                                : ""
                            }
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                <span>
                  {request.requestor?.organization || request.requestor?.name}
                </span>
                {caseInfos.clinicName && (
                  <>
                    <span>•</span>
                    <span>{caseInfos.clinicName}</span>
                  </>
                )}
                {request.createdAt && (
                  <>
                    <span>•</span>
                    <span>
                      {new Date(request.createdAt).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span>환자 {caseInfos.patientName || "미지정"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span>치아번호 {caseInfos.tooth || "-"}</span>
                {caseInfos.connectionDiameter && (
                  <>
                    <span>•</span>
                    <span>
                      커넥션 직경 {caseInfos.connectionDiameter.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                {(caseInfos.implantSystem || caseInfos.implantType) && (
                  <span>
                    임플란트 {caseInfos.implantSystem || ""}/
                    {caseInfos.implantType || ""}
                  </span>
                )}
              </div>
              {(() => {
                const { status1, status2, status } = request;
                let label = status;

                if (status1) {
                  if (status2 && status2 !== "없음") {
                    label = `${status1}(${status2})`;
                  } else {
                    label = status1;
                  }
                }

                return (
                  <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-700">
                    {label}
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

export const RequestPage = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
  const { user, token } = useAuthStore();
  const { worksheetSearch } = useOutletContext<{
    worksheetSearch: string;
  }>();

  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [receiveQueueModalOpen, setReceiveQueueModalOpen] = useState(false);
  const [receiveSelectedBucket, setReceiveSelectedBucket] =
    useState<DiameterBucketKey | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!token) return;

      try {
        setIsLoading(true);
        const url =
          user?.role === "admin" ? "/api/admin/requests" : "/api/requests";

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.error("Failed to fetch requests");
          return;
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.data.requests)) {
          setRequests(data.data.requests);
        }
      } catch (error) {
        console.error("Error fetching requests:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [token]);

  const searchLower = worksheetSearch.toLowerCase();
  const filteredAndSorted = requests
    .filter((request) => {
      const caseInfos = request.caseInfos || {};
      const text = (
        (request.referenceIds?.join(",") || "") +
        (request.requestor?.organization || "") +
        (request.requestor?.name || "") +
        (caseInfos.clinicName || "") +
        (caseInfos.patientName || "") +
        (request.description || "") +
        (caseInfos.tooth || "") +
        (caseInfos.connectionDiameter || "") +
        (caseInfos.implantSystem || "") +
        (caseInfos.implantType || "")
      ).toLowerCase();
      return text.includes(searchLower);
    })
    .sort((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1));

  const diameterQueueForReceive = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "10+"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "10+": [],
    };

    for (const req of filteredAndSorted) {
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.connectionDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.organization || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
        programText: req.description,
        qty: 1, // 기본 1개로 가정
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
        buckets["10+"].push(item);
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total, buckets };
  }, [filteredAndSorted]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <>
      {showQueueBar && (
        <WorksheetDiameterQueueBar
          title={`진행중인 의뢰 총 ${diameterQueueForReceive.total}건`}
          labels={diameterQueueForReceive.labels}
          counts={diameterQueueForReceive.counts}
          total={diameterQueueForReceive.total}
          onBucketClick={(label) => {
            setReceiveSelectedBucket(label);
            setReceiveQueueModalOpen(true);
          }}
        />
      )}

      <div className="space-y-4 mt-6">
        <WorksheetCardGrid
          requests={filteredAndSorted}
          onSelect={(request) => setSelectedRequest(request)}
        />
      </div>

      {selectedRequest && (
        <ExpandedRequestCard
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      )}

      <WorksheetDiameterQueueModal
        open={receiveQueueModalOpen}
        onOpenChange={setReceiveQueueModalOpen}
        processLabel="커스텀어벗 > 의뢰, CAM"
        queues={diameterQueueForReceive.buckets}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
      />
    </>
  );
};
