import { useMemo, useState } from "react";
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
  title: string;
  description: string;
  client: string;
  dentistName: string;
  patientName: string;
  tooth: string;
  requestDate: string;
  specifications: {
    diameter: string;
    implantSize: string;
  };
};

const mockRequests: ManufacturerRequest[] = [
  {
    id: "M-001",
    title: "상악 우측 제1대구치 임플란트",
    description: "티타늄 어벗먼트, 4.3mm 직경, 높이 5mm",
    client: "서울치과기공소",
    dentistName: "서울치과의원 김원장",
    patientName: "홍길동",
    tooth: "16",
    requestDate: "2025-07-15",
    specifications: {
      diameter: "4.3mm",
      implantSize: "4.3×10mm",
    },
  },
  {
    id: "M-002",
    title: "하악 좌측 제2소구치 임플란트",
    description: "지르코니아 어벗먼트, 미적 고려",
    client: "부산치과기공소",
    dentistName: "부산스마일치과 박원장",
    patientName: "김민수",
    tooth: "35",
    requestDate: "2025-07-14",
    specifications: {
      diameter: "3.8mm",
      implantSize: "3.8×11.5mm",
    },
  },
];

const getDiameterBucketIndex = (diameter: string) => {
  const value = parseFloat(diameter.replace(/[^0-9.]/g, "")) || 0;
  if (value <= 6) return 0;
  if (value <= 8) return 1;
  if (value <= 10) return 2;
  return 3;
};

type ReceiveQueueItem = {
  id: string;
  client: string;
  patient: string;
  tooth: string;
  description: string;
  qty: number;
};

const mockReceiveDiameterQueues: Record<DiameterBucketKey, ReceiveQueueItem[]> =
  {
    "6": [
      {
        id: "R-601",
        client: "서울치과기공소",
        patient: "홍길동",
        tooth: "16",
        description: "상악 대구치 커스텀 어벗",
        qty: 2,
      },
    ],
    "8": [
      {
        id: "R-801",
        client: "부산치과기공소",
        patient: "김민수",
        tooth: "35",
        description: "하악 소구치 어벗",
        qty: 1,
      },
    ],
    "10": [
      {
        id: "R-1001",
        client: "수원치과기공소",
        patient: "정민호",
        tooth: "11",
        description: "전치부 브릿지",
        qty: 3,
      },
    ],
    "10+": [
      {
        id: "R-10P1",
        client: "서울프리미엄기공소",
        patient: "박서연",
        tooth: "16/14/11/21/24/26",
        description: "풀마우스 와이드",
        qty: 6,
      },
    ],
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
            {(() => {
              const bucketIndex = getDiameterBucketIndex(
                request.specifications.diameter
              );
              const labels = ["6", "8", "10", "10+"];
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
            <div className="flex flex-wrap items-center gap-1">
              <span>{request.client}</span>
              <span>•</span>
              <span>환자 {request.patientName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>치아번호 {request.tooth}</span>
              <span>•</span>
              <span>커넥션 직경 {request.specifications.implantSize}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
              <span>임플란트 제조사/시스템/규격 정보 준비중</span>
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
  const { user } = useAuthStore();
  const { worksheetSearch } = useOutletContext<{
    worksheetSearch: string;
    setWorksheetSearch: (value: string) => void;
    showCompleted: boolean;
    setShowCompleted: (value: boolean) => void;
  }>();

  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [receiveQueueModalOpen, setReceiveQueueModalOpen] = useState(false);
  const [receiveSelectedBucket, setReceiveSelectedBucket] =
    useState<DiameterBucketKey | null>(null);

  const searchLower = worksheetSearch.toLowerCase();
  const filteredAndSorted = [...mockRequests]
    .filter((request) => {
      const text = (
        request.title +
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

    for (const req of filteredAndSorted) {
      const bucketIndex = getDiameterBucketIndex(req.specifications.diameter);
      if (bucketIndex >= 0 && bucketIndex < counts.length) {
        counts[bucketIndex] += 1;
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total };
  }, [filteredAndSorted]);

  const receiveQueues: Record<DiameterBucketKey, WorksheetQueueItem[]> =
    useMemo(
      () => ({
        "6": mockReceiveDiameterQueues["6"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.description,
          qty: q.qty,
        })),
        "8": mockReceiveDiameterQueues["8"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.description,
          qty: q.qty,
        })),
        "10": mockReceiveDiameterQueues["10"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.description,
          qty: q.qty,
        })),
        "10+": mockReceiveDiameterQueues["10+"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.description,
          qty: q.qty,
        })),
      }),
      []
    );

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
        queues={receiveQueues}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
      />
    </>
  );
};
