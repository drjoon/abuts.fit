import { useMemo, useState } from "react";
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
} from "@/shared/components/dashboard/WorksheetDiameterCard";
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
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
      return <Badge variant="default">{status}</Badge>;
    case "제작중":
      return <Badge variant="default">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
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
    case "진행중":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "제작중":
      return <Building2 className="h-4 w-4 text-blue-500" />;
    case "검토중":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
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

const useWorksheetFilters = (requests: typeof mockRequests) => {
  const [searchQuery, setSearchQuery] = useState("");
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

      const matchesStatus =
        selectedStatus === "all" || request.status === selectedStatus;

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
  }, [requests, searchQuery, selectedStatus, sortKey, sortOrder]);

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
  selectedStatus,
  setSelectedStatus,
  sortKey,
  sortOrder,
  toggleSort,
}: ReturnType<typeof useWorksheetFilters>) => {
  const renderSortButton = (key: WorksheetSortKey, label: string) => {
    const active = sortKey === key;
    const direction = active ? (sortOrder === "asc" ? "↑" : "↓") : "";
    return (
      <Button
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={() => toggleSort(key)}
      >
        {label} {direction}
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="기공소, 치과, 환자, 제목으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          {renderSortButton("client", "기공소명")}
          {renderSortButton("requestDate", "의뢰일")}
          {renderSortButton("dentistName", "치과명")}
          {renderSortButton("patientName", "환자명")}
          {renderSortButton("tooth", "치식")}
          {renderSortButton("diameter", "소재 직경")}
          {renderSortButton("implantCompany", "회사명")}
          {renderSortButton("implantProduct", "제품명")}
          {renderSortButton("implantSize", "규격")}
        </div>
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
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {requests.map((request) => (
        <Card
          key={request.id}
          className="hover:shadow-elegant transition-all duration-300 cursor-pointer h-full flex flex-col"
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
            <div className="space-y-2">
              <CardDescription className="text-xs line-clamp-2">
                {request.description}
              </CardDescription>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                <div>
                  <span className="font-medium">환자</span>{" "}
                  {request.patientName}
                </div>
                <div className="text-right">
                  <span className="font-medium">치식</span> {request.tooth}
                </div>
                <div>
                  <span className="font-medium">임플란트</span>{" "}
                  {request.specifications.implantCompany}
                </div>
                <div className="text-right">
                  {request.specifications.implantProduct}
                </div>
                <div>
                  <span className="font-medium">규격</span>{" "}
                  {request.specifications.implantSize}
                </div>
                <div className="text-right">
                  {request.specifications.diameter} /{" "}
                  {request.specifications.material}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const RequestListPage = () => {
  const { user } = useAuthStore();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const filters = useWorksheetFilters(mockRequests);

  const filteredRequests = filters.filteredAndSorted as typeof mockRequests;

  const parseDiameter = (value: string | undefined) => {
    if (!value) return null;
    const match = value.match(/([0-9]+\.?[0-9]*)/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isNaN(num) ? null : num;
  };

  const diameterBuckets: {
    id: string;
    label: string;
    matches: (d: number | null) => boolean;
  }[] = [
    {
      id: "lt6",
      label: "최대직경 6mm 미만",
      matches: (d) => d !== null && d < 6,
    },
    {
      id: "lt8",
      label: "최대직경 8mm 미만",
      matches: (d) => d !== null && d >= 6 && d < 8,
    },
    {
      id: "lt10",
      label: "최대직경 10mm 미만",
      matches: (d) => d !== null && d >= 8 && d < 10,
    },
    {
      id: "gte10",
      label: "최대직경 10mm 이상",
      matches: (d) => d !== null && d >= 10,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <WorksheetSortBar {...filters} />

        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            의뢰 카드는 어벗먼트 최대 직경 기준으로 네 구간(&lt;6mm, &lt;8mm,
            &lt;10mm, 10mm 이상)으로 나뉘어 표시됩니다.
          </p>
          {diameterBuckets.map((bucket) => {
            const bucketRequests = filteredRequests.filter((request) => {
              const d = parseDiameter(request.specifications.diameter);
              return bucket.matches(d);
            });

            if (!bucketRequests.length) return null;

            return (
              <div key={bucket.id} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {bucket.label}
                </h2>
                <WorksheetCardGrid
                  requests={bucketRequests}
                  onSelect={(request) => setSelectedRequest(request)}
                />
              </div>
            );
          })}
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
