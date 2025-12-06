import { useEffect, useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WorksheetDiameterCard,
  DiameterStats,
} from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  Clock,
  Building2,
  AlertCircle,
  CheckCircle,
  FileText,
  MessageSquare,
} from "lucide-react";
import { WorksheetCncMachineSection } from "@/features/manufacturer/cnc/components/WorksheetCncMachineSection";

const mockRequests = [
  {
    id: "REQ-001",
    title: "상악 우측 제1대구치 임플란트",
    description: "티타늄 어벗먼트, 4.3mm 직경, 높이 5mm, 15도 각도 조정 필요",
    client: "서울치과기공소",
    clientContact: "김철수",
    dentistName: "서울치과의원 김원장",
    patientName: "홍길동",
    tooth: "16",
    requestDate: "2025-07-15",
    urgency: "높음",
    status: "진행중",
    attachments: 3,
    specifications: {
      implantType: "Straumann",
      implantCompany: "Straumann",
      implantProduct: "Bone Level RC",
      implantSize: "4.3×10mm",
      diameter: "4.3mm",
      height: "5mm",
      angle: "15도",
      material: "티타늄",
    },
  },
  {
    id: "REQ-002",
    title: "하악 좌측 제2소구치 임플란트",
    description: "지르코니아 어벗먼트, 3.8mm 직경, 미적 고려사항 포함",
    client: "부산치과기공소",
    clientContact: "이영희",
    dentistName: "부산스마일치과 박원장",
    patientName: "김민수",
    tooth: "35",
    requestDate: "2025-07-14",
    urgency: "보통",
    status: "제작중",
    attachments: 5,
    specifications: {
      implantType: "Nobel Biocare",
      implantCompany: "Nobel Biocare",
      implantProduct: "NobelActive",
      implantSize: "3.8×11.5mm",
      diameter: "3.8mm",
      height: "4mm",
      angle: "직각",
      material: "지르코니아",
    },
  },
  {
    id: "REQ-003",
    title: "상악 전치부 임플란트",
    description: "맞춤형 어벗먼트, 미적 고려사항 중요, 특수 각도 조정",
    client: "대구치과기공소",
    clientContact: "박민수",
    dentistName: "대구더좋은치과 이원장",
    patientName: "이수현",
    tooth: "21",
    requestDate: "2025-07-13",
    urgency: "높음",
    status: "검토중",
    attachments: 7,
    specifications: {
      implantType: "Dentium",
      implantCompany: "Dentium",
      implantProduct: "SuperLine",
      implantSize: "4.0×11mm",
      diameter: "4.0mm",
      height: "6mm",
      angle: "25도",
      material: "티타늄+지르코니아",
    },
  },
  {
    id: "REQ-004",
    title: "하악 우측 제1대구치 임플란트",
    description: "하이브리드 어벗먼트, 특수 각도 조정, 교합 고려",
    client: "인천치과기공소",
    clientContact: "정수진",
    dentistName: "인천바른치과 최원장",
    patientName: "박지훈",
    tooth: "46",
    requestDate: "2025-07-12",
    urgency: "보통",
    status: "진행중",
    attachments: 4,
    specifications: {
      implantType: "Osstem",
      implantCompany: "Osstem",
      implantProduct: "TSIII CA",
      implantSize: "4.5×10mm",
      diameter: "4.5mm",
      height: "5.5mm",
      angle: "20도",
      material: "티타늄",
    },
  },
  {
    id: "REQ-005",
    title: "상악 좌측 소구치 임플란트",
    description: "표준 어벗먼트, 일반적인 사양",
    client: "광주치과기공소",
    clientContact: "최미영",
    dentistName: "광주예쁜치과 김원장",
    patientName: "최유진",
    tooth: "24",
    requestDate: "2025-07-11",
    urgency: "낮음",
    status: "완료",
    attachments: 2,
    specifications: {
      implantType: "Straumann",
      implantCompany: "Straumann",
      implantProduct: "BLT",
      implantSize: "3.3×10mm",
      diameter: "3.3mm",
      height: "4mm",
      angle: "직각",
      material: "티타늄",
    },
  },
  {
    id: "REQ-006",
    title: "하악 전치부 임플란트",
    description: "미니 어벗먼트, 좁은 공간 고려",
    client: "울산치과기공소",
    clientContact: "강동현",
    dentistName: "울산밝은치과 장원장",
    patientName: "김도윤",
    tooth: "32",
    requestDate: "2025-07-10",
    urgency: "보통",
    status: "제작중",
    attachments: 3,
    specifications: {
      implantType: "Nobel Biocare",
      implantCompany: "Nobel Biocare",
      implantProduct: "NobelReplace",
      implantSize: "3.0×10mm",
      diameter: "3.0mm",
      height: "4.5mm",
      angle: "10도",
      material: "지르코니아",
    },
  },
  {
    id: "REQ-007",
    title: "상악 우측 제2대구치 임플란트",
    description: "와이드 어벗먼트, 강도 중요",
    client: "전주치과기공소",
    clientContact: "송지훈",
    dentistName: "전주편안치과 오원장",
    patientName: "이예린",
    tooth: "27",
    requestDate: "2025-07-09",
    urgency: "높음",
    status: "진행중",
    attachments: 6,
    specifications: {
      implantType: "Dentium",
      implantCompany: "Dentium",
      implantProduct: "Implantium",
      implantSize: "5.0×10mm",
      diameter: "5.0mm",
      height: "6mm",
      angle: "직각",
      material: "티타늄",
    },
  },
  {
    id: "REQ-008",
    title: "상악 전치부 브릿지 임플란트",
    description: "와이드 직경 어벗먼트, 심미 및 강도 균형 고려",
    client: "수원치과기공소",
    clientContact: "한지민",
    dentistName: "수원미소치과 남원장",
    patientName: "정민호",
    tooth: "11",
    requestDate: "2025-07-08",
    urgency: "보통",
    status: "진행중",
    attachments: 4,
    specifications: {
      implantType: "Osstem",
      implantCompany: "Osstem",
      implantProduct: "TSIII CA",
      implantSize: "6.0×10mm",
      diameter: "6.0mm",
      height: "5mm",
      angle: "15도",
      material: "티타늄",
    },
  },
  {
    id: "REQ-009",
    title: "하악 양측 대구치 풀브릿지",
    description: "장축 하중 분산을 위한 와이드 직경 어벗먼트",
    client: "창원치과기공소",
    clientContact: "오세훈",
    dentistName: "창원스마일치과 문원장",
    patientName: "김나래",
    tooth: "36/46",
    requestDate: "2025-07-07",
    urgency: "높음",
    status: "제작중",
    attachments: 5,
    specifications: {
      implantType: "Straumann",
      implantCompany: "Straumann",
      implantProduct: "BLX",
      implantSize: "8.0×10mm",
      diameter: "8.0mm",
      height: "6mm",
      angle: "직각",
      material: "티타늄",
    },
  },
  {
    id: "REQ-010",
    title: "상악 전악 임플란트 풀마우스",
    description: "10mm 이상 와이드 직경 풀마우스 케이스",
    client: "서울프리미엄기공소",
    clientContact: "이도윤",
    dentistName: "서울스페셜치과 정원장",
    patientName: "박서연",
    tooth: "16/14/11/21/24/26",
    requestDate: "2025-07-06",
    urgency: "높음",
    status: "검토중",
    attachments: 8,
    specifications: {
      implantType: "Nobel Biocare",
      implantCompany: "Nobel Biocare",
      implantProduct: "NobelActive",
      implantSize: "10.0×12mm",
      diameter: "10.0mm",
      height: "7mm",
      angle: "20도",
      material: "티타늄+지르코니아",
    },
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "의뢰접수":
      return <Badge variant="outline">의뢰접수</Badge>;
    case "가공전":
    case "가공후":
      return <Badge variant="default">{status}</Badge>;
    case "배송대기":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
          배송대기
        </Badge>
      );
    case "배송중":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          배송중
        </Badge>
      );
    case "완료":
      return <Badge variant="secondary">완료</Badge>;
    case "취소":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
          취소
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const getUrgencyBadge = (urgency: string) => {
  switch (urgency) {
    case "높음":
      return (
        <Badge variant="destructive" className="text-xs">
          {urgency}
        </Badge>
      );
    case "보통":
      return (
        <Badge variant="outline" className="text-xs">
          {urgency}
        </Badge>
      );
    case "낮음":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
          {urgency}
        </Badge>
      );
    default:
      return <Badge className="text-xs">{urgency}</Badge>;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "의뢰접수":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "가공전":
    case "가공후":
      return <Building2 className="h-4 w-4 text-blue-500" />;
    case "배송대기":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "배송중":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "취소":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

type WorksheetSortKey =
  | "client"
  | "requestDate"
  | "dentistName"
  | "patientName"
  | "tooth"
  | "diameter"
  | "implantCompany"
  | "implantProduct"
  | "implantSize"
  | "status";

type WorksheetSortOrder = "asc" | "desc";

const useWorksheetFilters = (
  requests: typeof mockRequests,
  controlledSearch?: { value: string; setValue: (value: string) => void },
  options?: { showCompleted?: boolean }
) => {
  const [internalSearch, setInternalSearch] = useState("");
  const searchQuery = controlledSearch
    ? controlledSearch.value
    : internalSearch;
  const setSearchQuery = controlledSearch
    ? controlledSearch.setValue
    : setInternalSearch;
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortKey, setSortKey] = useState<WorksheetSortKey>("requestDate");
  const [sortOrder, setSortOrder] = useState<WorksheetSortOrder>("desc");

  const filteredAndSorted = useMemo(() => {
    const filtered = requests.filter((request) => {
      const lower = searchQuery.toLowerCase();
      const matchesSearch =
        request.title.toLowerCase().includes(lower) ||
        request.client.toLowerCase().includes(lower) ||
        request.description.toLowerCase().includes(lower) ||
        request.dentistName.toLowerCase().includes(lower) ||
        request.patientName.toLowerCase().includes(lower);

      const matchesStatusBase =
        selectedStatus === "all" || request.status === selectedStatus;
      const includeCompleted = options?.showCompleted ?? false;
      const matchesCompleted = includeCompleted
        ? true
        : request.status !== "완료";

      const matchesStatus = matchesStatusBase && matchesCompleted;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      const getValue = (item: (typeof mockRequests)[number]) => {
        switch (sortKey) {
          case "client":
            return item.client;
          case "requestDate":
            return item.requestDate;
          case "dentistName":
            return item.dentistName;
          case "patientName":
            return item.patientName;
          case "tooth":
            return item.tooth;
          case "diameter":
            return item.specifications.diameter;
          case "implantCompany":
            return item.specifications.implantCompany;
          case "implantProduct":
            return item.specifications.implantProduct;
          case "implantSize":
            return item.specifications.implantSize;
          case "status":
            return item.status;
          default:
            return "";
        }
      };

      const va = getValue(a);
      const vb = getValue(b);

      if (va === vb) return 0;
      if (sortOrder === "asc") {
        return va > vb ? 1 : -1;
      }
      return va < vb ? 1 : -1;
    });

    return sorted;
  }, [
    requests,
    searchQuery,
    selectedStatus,
    sortKey,
    sortOrder,
    options?.showCompleted,
  ]);

  const toggleSort = (key: WorksheetSortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
    sortKey,
    sortOrder,
    toggleSort,
    filteredAndSorted,
  };
};

const useWorksheetStats = (requests: typeof mockRequests) => {
  // 최대 직경 기준 버킷을 4단으로 통일: <6mm, <8mm, <10mm, >=10mm
  const diameterBuckets = [6, 8, 10, 11];

  const diameterStats = useMemo(() => {
    const ranges: Record<
      number,
      {
        min: number;
        max: number;
        shipLabel: string;
      }
    > = {
      6: { min: 100, max: 150, shipLabel: "모레" },
      8: { min: 200, max: 300, shipLabel: "내일" },
      10: { min: 50, max: 100, shipLabel: "+3일" },
      // 11mm 버킷은 개념적으로 "최대직경 10mm 이상" 구간을 대표하는 mock 데이터
      11: { min: 10, max: 30, shipLabel: "+5일" },
    };

    const buckets = diameterBuckets.map((diameter) => {
      const cfg = ranges[diameter];
      const span = cfg.max - cfg.min;
      const randomOffset =
        span > 0 ? Math.floor(Math.random() * (span + 1)) : 0;
      const count = cfg.min + randomOffset;
      return {
        diameter,
        count,
        shipLabel: cfg.shipLabel,
      };
    });

    const max = Math.max(1, ...buckets.map((b) => b.count));
    const total = buckets.reduce((sum, b) => sum + b.count, 0);

    return {
      buckets: buckets.map((b) => ({
        ...b,
        ratio: b.count / max,
      })),
      total,
    };
  }, [requests]);

  const toothStats = useMemo(() => {
    const baseCounts: Record<string, number> = {};
    requests.forEach((request) => {
      const tooth = request.tooth;
      if (!tooth) return;
      baseCounts[tooth] = (baseCounts[tooth] || 0) + 1;
    });

    const sampleTeeth = ["16", "21", "24", "27", "32", "35", "46", "47"];

    let entries = Object.keys(baseCounts)
      .sort((a, b) => (a > b ? 1 : -1))
      .map((tooth) => {
        const min = 10;
        const max = 200;
        const span = max - min;
        const randomOffset = Math.floor(Math.random() * (span + 1));
        const count = min + randomOffset;
        return { tooth, count };
      });

    // 항상 최소 8개의 행을 보여주기 위해 부족한 만큼 placeholder 추가 (합계에는 영향 없음)
    while (entries.length < 8) {
      const candidate =
        sampleTeeth.find((t) => !entries.some((e) => e.tooth === t)) ||
        `T${entries.length + 1}`;
      entries = [...entries, { tooth: candidate, count: 0 }];
    }

    const maxCount = Math.max(1, ...entries.map((e) => e.count));
    const total = entries.reduce((sum, e) => sum + e.count, 0);

    return {
      entries: entries.map((e) => ({
        ...e,
        ratio: e.count / maxCount,
      })),
      total,
    };
  }, [requests]);

  const crownUnitStats = useMemo(() => {
    const units = Array.from({ length: 14 }, (_, i) => i + 1);
    const totalUnits = toothStats.total;

    if (!totalUnits) {
      return {
        entries: units.map((unit) => ({ unit, count: 0 })),
        total: 0,
      };
    }

    const weights = units.map(() => Math.random() || 1);
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    let remaining = totalUnits;

    const entries = units.map((unit, index) => {
      if (index === units.length - 1) {
        const count = remaining;
        return { unit, count };
      }
      const raw = (totalUnits * weights[index]) / weightSum;
      const count = Math.max(0, Math.round(raw));
      remaining -= count;
      return { unit, count };
    });

    const total = entries.reduce((sum, e) => sum + e.count, 0);

    return {
      entries,
      total,
    };
  }, [toothStats.total]);

  return { diameterStats, toothStats, crownUnitStats };
};

const WorksheetTopSection = ({
  requests,
}: {
  requests: typeof mockRequests;
}) => {
  const { diameterStats, toothStats, crownUnitStats } =
    useWorksheetStats(requests);

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  const MAX_VISIBLE_TOOTH = 8;
  const MAX_VISIBLE_UNITS = 8;

  const maxCrownCount = useMemo(
    () => Math.max(1, ...crownUnitStats.entries.map((entry) => entry.count)),
    [crownUnitStats.entries]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <WorksheetDiameterCardForDashboardInternal
        diameterStats={diameterStats}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            3D 프린터 치아별 진행 의뢰 수
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 pr-1">
              {toothStats.entries.slice(0, MAX_VISIBLE_TOOTH).map((item) => (
                <div
                  key={item.tooth}
                  className="flex items-center gap-2 text-xs"
                >
                  <div className="w-10 font-semibold text-right text-slate-700">
                    {item.tooth}
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-purple-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400"
                      style={{ width: `${item.ratio * 100}%` }}
                    />
                  </div>
                  <div className="w-10 text-right font-medium text-slate-700">
                    {item.count.toLocaleString()}건
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pr-1 pl-6">
              {crownUnitStats.entries
                .slice(0, MAX_VISIBLE_UNITS)
                .map((item) => (
                  <div
                    key={item.unit}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-16 text-muted-foreground">
                      크라운 {item.unit}유닛
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                        style={{
                          width: `${(item.count / maxCrownCount) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right font-medium text-slate-700">
                      {item.count.toLocaleString()}건
                    </span>
                  </div>
                ))}
            </div>
          </div>
          <div className="mt-3 flex justify-end text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">
                총 {crownUnitStats.total.toLocaleString()} 유닛 생산중
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2"
                onClick={() => setIsStatsModalOpen(true)}
              >
                더보기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Dialog open={isStatsModalOpen} onOpenChange={setIsStatsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>3D 프린터 작업 통계 상세</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-2">
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              <div className="font-semibold mb-1">치식별 의뢰 건수</div>
              {toothStats.entries.map((item) => (
                <div
                  key={item.tooth}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">{item.tooth}</span>
                  <span className="font-medium">
                    {item.count.toLocaleString()}건
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              <div className="font-semibold mb-1">크라운 유닛별 의뢰 건수</div>
              {crownUnitStats.entries.map((item) => (
                <div
                  key={item.unit}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">
                    크라운 {item.unit}유닛
                  </span>
                  <span className="font-medium">
                    {item.count.toLocaleString()}건
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex justify-end text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">
                총 {crownUnitStats.total.toLocaleString()} 유닛 생산중
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2"
                onClick={() => setIsStatsModalOpen(true)}
              >
                더보기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const WorksheetDiameterCardForDashboardInternal = ({
  diameterStats,
}: {
  diameterStats: DiameterStats;
}) => <WorksheetDiameterCard stats={diameterStats} />;

export const WorksheetDiameterCardForDashboard = ({
  stats,
}: {
  stats?: DiameterStats;
}) => {
  const { diameterStats } = useWorksheetStats(mockRequests);
  const finalStats = stats ?? diameterStats;
  return <WorksheetDiameterCard stats={finalStats} />;
};

export const WorksheetTopSectionForDashboard = () => (
  <WorksheetTopSection requests={mockRequests} />
);

const WorksheetSortBar = ({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}) => {
  return (
    <div className="w-full flex justify-end">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="기공소, 치과, 환자, 제목으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>
  );
};

const WorksheetCardGrid = ({
  requests,
  onSelect,
}: {
  requests: typeof mockRequests;
  onSelect: (request: (typeof mockRequests)[number]) => void;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {requests.map((request) => (
      <Card
        key={request.id}
        className="shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer h-full flex flex-col"
        onClick={() => onSelect(request)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {getStatusIcon(request.status)}
                <CardTitle className="text-sm line-clamp-1">
                  {request.title}
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>{request.client}</span>
                <span>•</span>
                <span>{request.dentistName}</span>
                <span>•</span>
                <span>{request.requestDate}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(request.status)}
              {getUrgencyBadge(request.urgency)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 flex flex-col justify-between">
          <div className="space-y-1.5 text-[11px] text-muted-foreground">
            <div className="text-xs font-semibold text-blue-700">
              소재 직경 {request.specifications.diameter}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>{request.dentistName}</span>
              <span>•</span>
              <span>{request.requestDate}</span>
            </div>
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
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
              <span>
                임플란트 {request.specifications.implantCompany}/
                {request.specifications.implantProduct}/
                {request.specifications.implantSize}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

export const RequestListPage = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const { worksheetSearch, setWorksheetSearch } = useOutletContext<{
    worksheetSearch: string;
    setWorksheetSearch: (value: string) => void;
  }>();
  const worksheetParams = new URLSearchParams(location.search);
  const worksheetType = worksheetParams.get("type") || "abutment";
  const worksheetStage = worksheetParams.get("stage") || "receive";
  const isCncMachining =
    worksheetType === "cnc" && worksheetStage === "machining";
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  const [requests, setRequests] = useState<typeof mockRequests>(mockRequests);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch("/api/requests/my");
        if (!res.ok) {
          console.error("Failed to fetch my requests");
          return;
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.data.requests)) {
          const mapped: typeof mockRequests = data.data.requests.map(
            (req: any) => {
              const diameterValue =
                (req.specifications && req.specifications.maxDiameter) ??
                req.maxDiameter;

              const implantCompanyValue =
                (req.specifications &&
                  req.specifications.implantManufacturer) ||
                (req.specifications && req.specifications.implantSystem) ||
                req.implantManufacturer ||
                req.implantSystem ||
                req.implantSystemLegacy;

              const implantProductValue =
                (req.specifications && req.specifications.implantType) ||
                req.implantType ||
                req.implantTypeLegacy;

              const implantSizeValue =
                (req.specifications && req.specifications.implantSize) ||
                req.implantSize;

              return {
                id: req.requestId,
                title: req.title,
                description: req.description || "",
                client:
                  req.manufacturer?.organization ||
                  req.manufacturer?.name ||
                  "미배정",
                clientContact: "",
                dentistName: req.dentistName || "",
                patientName: req.patientName || "",
                tooth: req.tooth || "",
                requestDate: req.createdAt
                  ? new Date(req.createdAt).toISOString().split("T")[0]
                  : "",
                urgency: "보통", // TODO: 실제 긴급도 필드 연동
                status: req.status,
                attachments: Array.isArray(req.files) ? req.files.length : 0,
                specifications: {
                  implantType: implantProductValue,
                  implantCompany: implantCompanyValue,
                  implantProduct: implantProductValue,
                  implantSize:
                    typeof implantSizeValue === "string"
                      ? implantSizeValue
                      : "",
                  diameter:
                    typeof diameterValue === "number"
                      ? `${diameterValue}mm`
                      : "",
                  height: "",
                  angle: "",
                  material: "",
                },
              };
            }
          );

          setRequests(mapped);
        }
      } catch (error) {
        console.error("Error fetching my requests:", error);
      }
    };

    fetchRequests();
  }, []);

  const filters = useWorksheetFilters(requests, {
    value: worksheetSearch,
    setValue: setWorksheetSearch,
  });

  if (isCncMachining) {
    return (
      <div className="min-h-screen bg-gradient-subtle p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <WorksheetCncMachineSection searchQuery={filters.searchQuery} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-4">
          <WorksheetCardGrid
            requests={filters.filteredAndSorted as typeof mockRequests}
            onSelect={(request) => setSelectedRequest(request)}
          />
        </div>
      </div>

      {selectedRequest && (
        <ExpandedRequestCard
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      )}
    </div>
  );
};
