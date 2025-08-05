import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileText,
  Clock,
  MessageSquare,
  Plus,
  Image,
  FileIcon,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";

// Mock recent requests data
const mockRecentRequests = [
  {
    id: "REQ-001",
    title: "상악 우측 제1대구치 임플란트",
    description: "티타늄 어벗먼트, 4.3mm 직경",
    status: "진행중",
    date: "2024-01-15",
    manufacturer: "프리미엄 어벗먼트",
    priority: "높음",
  },
  {
    id: "REQ-002",
    title: "하악 좌측 제2소구치 임플란트",
    description: "지르코니아 어벗먼트, 3.8mm 직경",
    status: "완료",
    date: "2024-01-14",
    manufacturer: "정밀 어벗먼트",
    priority: "보통",
  },
  {
    id: "REQ-003",
    title: "상악 전치부 임플란트",
    description: "맞춤형 어벗먼트, 미적 고려사항 포함",
    status: "검토중",
    date: "2024-01-13",
    manufacturer: "스마트 어벗먼트",
    priority: "높음",
  },
  {
    id: "REQ-004",
    title: "하악 우측 제1대구치 임플란트",
    description: "하이브리드 어벗먼트, 특수 각도 조정",
    status: "진행중",
    date: "2024-01-12",
    manufacturer: "프리미엄 어벗먼트",
    priority: "보통",
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    case "견적 대기":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          {status}
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "높음":
      return (
        <Badge variant="destructive" className="text-xs">
          {priority}
        </Badge>
      );
    case "보통":
      return (
        <Badge variant="outline" className="text-xs">
          {priority}
        </Badge>
      );
    default:
      return <Badge className="text-xs">{priority}</Badge>;
  }
};

export const NewRequestPage = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [implantType, setImplantType] = useState("");
  const [implantSpec, setImplantSpec] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...droppedFiles]);

      toast({
        title: "파일 업로드 완료",
        description: `${droppedFiles.length}개 파일이 추가되었습니다.`,
      });
    },
    [toast]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!message.trim()) {
      toast({
        title: "메시지를 입력해주세요",
        description: "의뢰 내용을 상세히 작성해주세요.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "의뢰가 성공적으로 등록되었습니다",
      description: "제조사들이 검토 후 연락드릴 예정입니다.",
    });

    setMessage("");
    setFiles([]);
    setImplantType("");
    setImplantSpec("");
  };

  const handleReset = () => {
    setMessage("");
    setFiles([]);
    setImplantType("");
    setImplantSpec("");
    toast({
      title: "초기화 완료",
      description: "모든 입력 내용이 초기화되었습니다.",
    });
  };

  const getSpecOptions = (type: string) => {
    switch (type) {
      case "straumann":
        return ["미니 (3.3mm)", "레귤러 (4.1mm)", "와이드 (4.8mm)"];
      case "nobel":
        return ["미니 (3.0mm)", "레귤러 (3.75mm)", "와이드 (5.0mm)"];
      case "osstem":
        return ["미니 (3.5mm)", "레귤러 (4.0mm)", "와이드 (5.0mm)"];
      case "dentium":
        return ["미니 (3.4mm)", "레귤러 (4.3mm)", "와이드 (5.1mm)"];
      default:
        return ["미니", "레귤러", "와이드"];
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            새로운 의뢰를 시작하세요
          </h1>
          <p className="text-muted-foreground text-lg">
            파일을 첨부하고 상세한 요구사항을 작성해주세요
          </p>
        </div>

        {/* Main Message Card */}
        <Card className="shadow-elegant hover:shadow-glow transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              의뢰 작성
            </CardTitle>
            <CardDescription>
              어벗먼트 제작에 필요한 상세 정보를 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                파일을 여기에 드롭하거나
              </p>
              <Button
                variant="outline"
                className="mb-4"
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <Plus className="mr-2 h-4 w-4" />
                파일 선택
              </Button>
              <input
                id="file-input"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".jpg,.jpeg,.png,.pdf,.stl,.ply,.obj"
              />
              <p className="text-sm text-muted-foreground">
                STL, PLY, OBJ, 이미지, PDF 파일을 지원합니다 (최대 100MB)
              </p>
            </div>

            {/* Uploaded Files */}
            {files.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">업로드된 파일</h4>
                <div className="grid gap-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {file.type.startsWith("image/") ? (
                          <Image className="h-4 w-4" />
                        ) : (
                          <FileIcon className="h-4 w-4" />
                        )}
                        <span className="text-sm">{file.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {(file.size / 1024 / 1024).toFixed(1)}MB
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        제거
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Implant Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="implantType">임플란트 종류</Label>
                <Select value={implantType} onValueChange={setImplantType}>
                  <SelectTrigger>
                    <SelectValue placeholder="임플란트 브랜드를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straumann">Straumann</SelectItem>
                    <SelectItem value="nobel">Nobel Biocare</SelectItem>
                    <SelectItem value="osstem">Osstem</SelectItem>
                    <SelectItem value="dentium">Dentium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="implantSpec">규격</Label>
                <Select
                  value={implantSpec}
                  onValueChange={setImplantSpec}
                  disabled={!implantType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="규격을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSpecOptions(implantType).map((spec) => (
                      <SelectItem key={spec} value={spec}>
                        {spec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Message Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">의뢰 내용</label>
              <Textarea
                placeholder="어벗먼트 제작에 필요한 상세 정보를 입력해주세요.
예: 높이, 각도, 특별 요구사항 등..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[150px] resize-none"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3">
              <Button onClick={handleReset} variant="outline" size="lg">
                <RotateCcw className="mr-2 h-4 w-4" />
                초기화하기
              </Button>
              <Button onClick={handleSubmit} className="flex-1" size="lg">
                <FileText className="mr-2 h-4 w-4" />
                의뢰 등록하기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">최근 의뢰</h2>
          <div className="grid gap-4">
            {mockRecentRequests.map((request) => (
              <Card
                key={request.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedRequest(request)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{request.title}</h3>
                        {getPriorityBadge(request.priority)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {request.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {request.date}
                        </span>
                        {request.manufacturer !== "-" && (
                          <span>제조사: {request.manufacturer}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(request.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center pt-4">
            <Button variant="outline">더 많은 의뢰 보기</Button>
          </div>
        </div>
      </div>

      {/* Expanded Request Card Modal */}
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
