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

type ManufacturerRequest = {
  id: string;
  _id: string; // Backend ID
  title: string;
  description: string;
  client: string;
  dentistName: string;
  patientName: string;
  tooth: string;
  requestDate: string;
  status: string;
  referenceId?: string[];
  specifications: {
    diameter: string;
    connectionDiameter?: string;
    implantSystem?: string;
    implantType?: string;
    connectionType?: string;
    implantSize: string;
  };
  workType?: string; // 'abutment' | 'prosthesis' | 'mixed'
};

const getDiameterBucketIndex = (diameter: string) => {
  if (!diameter) return -1;
  const value = parseFloat(diameter.replace(/[^0-9.]/g, "")) || 0;
  if (value <= 6) return 0;
  if (value <= 8) return 1;
  if (value <= 10) return 2;
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
    {requests.map((request) => (
      <Card
        key={request.id}
        className="shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer h-full flex flex-col"
        onClick={() => onSelect(request)}
      >
        <CardContent className="pt-6 flex-1 flex flex-col justify-between">
          <div className="space-y-2 text-[12px] text-slate-700">
            {request.referenceId && request.referenceId.length > 0 && (
              <div className="mb-2">
                {(() => {
                  const first = request.referenceId![0];
                  const extraCount = request.referenceId!.length - 1;
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
                request.specifications.diameter
              );
              const labels = ["6", "8", "10", "10+"];

              if (bucketIndex === -1) {
                return (
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {request.title.includes("크라운") ||
                      request.workType === "prosthesis"
                        ? "크라운/보철"
                        : "기타"}
                    </span>
                  </div>
                );
              }

              return (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-blue-700">
                    {request.specifications.diameter}
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
              <span>{request.client}</span>
              {request.dentistName && (
                <>
                  <span>•</span>
                  <span>{request.dentistName}</span>
                </>
              )}
              {request.requestDate && (
                <>
                  <span>•</span>
                  <span>{request.requestDate}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>환자 {request.patientName || "미지정"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>치아번호 {request.tooth || "-"}</span>
              {(request.specifications.connectionDiameter ||
                request.specifications.implantSize) && (
                <>
                  <span>•</span>
                  <span>
                    커넥션 직경{" "}
                    {request.specifications.connectionDiameter ||
                      request.specifications.implantSize}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
              {(request.specifications.implantSystem ||
                request.specifications.implantType ||
                request.specifications.implantSize) && (
                <span>
                  임플란트 {request.specifications.implantSystem || ""}/
                  {request.specifications.implantType || ""}/
                  {request.specifications.implantSize || ""}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
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
    setWorksheetSearch: (value: string) => void;
    showCompleted: boolean;
    setShowCompleted: (value: boolean) => void;
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
        const res = await fetch("/api/requests/assigned", {
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
          const mappedRequests: ManufacturerRequest[] = data.data.requests.map(
            (req: any) => {
              // Determine workType from patientCases
              let workType = "mixed";
              const types = new Set<string>();
              if (Array.isArray(req.patientCases)) {
                req.patientCases.forEach((pc: any) => {
                  if (Array.isArray(pc.files)) {
                    pc.files.forEach((f: any) => {
                      if (f.workType) types.add(f.workType);
                    });
                  }
                });
              }

              if (types.has("abutment") && !types.has("prosthesis")) {
                workType = "abutment";
              } else if (!types.has("abutment") && types.has("prosthesis")) {
                workType = "prosthesis";
              } else if (types.size === 0) {
                // Fallback if no files or types (e.g. legacy data)
                workType = req.specifications?.implantSystem
                  ? "abutment"
                  : "prosthesis";
              }

              const diameterValue =
                (req.specifications && req.specifications.maxDiameter) ??
                req.maxDiameter;

              const connectionDiameterValue =
                (req.specifications && req.specifications.connectionDiameter) ??
                req.connectionDiameter;

              const implantSystemValue =
                (req.specifications && req.specifications.implantSystem) ||
                req.implantManufacturer ||
                req.implantSystem ||
                req.implantSystemLegacy;

              const implantTypeValue =
                (req.specifications && req.specifications.implantType) ||
                req.implantType ||
                req.implantTypeLegacy;

              const connectionTypeValue =
                req.specifications && req.specifications.connectionType;

              const implantSizeValue =
                (req.specifications && req.specifications.implantSize) ||
                req.implantSize;

              return {
                id: req.requestId,
                _id: req._id,
                title: req.title,
                description: req.description || "",
                client:
                  req.requestor?.organization ||
                  req.requestor?.name ||
                  "미지정",
                dentistName: req.dentistName || "",
                patientName: req.patientName || "",
                tooth: req.tooth || "",
                requestDate: req.createdAt
                  ? new Date(req.createdAt).toISOString().split("T")[0]
                  : "",
                referenceId: Array.isArray(req.referenceId)
                  ? req.referenceId
                  : req.referenceId
                  ? [req.referenceId]
                  : [],
                status: req.status,
                workType,
                specifications: {
                  diameter:
                    typeof diameterValue === "number"
                      ? `${diameterValue}mm`
                      : "",
                  connectionDiameter:
                    typeof connectionDiameterValue === "number"
                      ? `${connectionDiameterValue}mm`
                      : undefined,
                  implantSystem: implantSystemValue,
                  implantType: implantTypeValue,
                  connectionType: connectionTypeValue,
                  implantSize: implantSizeValue || "",
                },
              };
            }
          );
          setRequests(mappedRequests);
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
      const text = (
        request.title +
        (request.referenceId || "") +
        request.client +
        request.dentistName +
        request.patientName +
        request.description +
        request.tooth +
        request.specifications.diameter +
        request.specifications.implantSize
      ).toLowerCase();
      return text.includes(searchLower);
    })
    .sort((a, b) => (a.requestDate < b.requestDate ? 1 : -1));

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
      const bucketIndex = getDiameterBucketIndex(req.specifications.diameter);
      const item: WorksheetQueueItem = {
        id: req.id,
        client: req.client,
        patient: req.patientName,
        tooth: req.tooth,
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
