import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Send,
  Clock,
  User,
  Building2,
  MessageSquare,
  Paperclip,
  Upload,
  FileIcon,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Clock8,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthStore } from "@/store/useAuthStore";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "requestor" | "manufacturer" | "admin";
  content: string;
  timestamp: Date;
}

interface ExpandedRequestCardProps {
  request: any;
  onClose: () => void;
  currentUserId?: string;
  currentUserRole?: "requestor" | "manufacturer" | "admin";
}

interface PaymentStatus {
  status: "unpaid" | "pending" | "paid" | "failed";
  amount: number;
  dueDate?: string;
  paidDate?: string;
  paymentMethod?: string;
}

// Mock chat data
const mockChatMessages: Message[] = [
  {
    id: "1",
    senderId: "1",
    senderName: "김철수",
    senderRole: "requestor",
    content:
      "안녕하세요. 상악 우측 제1대구치 임플란트 어벗먼트 제작 문의드립니다.",
    timestamp: new Date("2024-01-15T09:00:00"),
  },
  {
    id: "2",
    senderId: "2",
    senderName: "박영희",
    senderRole: "manufacturer",
    content:
      "안녕하세요! 첨부해주신 스캔 파일 확인했습니다. 몇 가지 확인하고 싶은 부분이 있는데요.",
    timestamp: new Date("2024-01-15T09:30:00"),
  },
  {
    id: "3",
    senderId: "2",
    senderName: "박영희",
    senderRole: "manufacturer",
    content: "어벗먼트 높이와 각도 조정에 대한 특별한 요구사항이 있으신가요?",
    timestamp: new Date("2024-01-15T09:31:00"),
  },
  {
    id: "4",
    senderId: "1",
    senderName: "김철수",
    senderRole: "requestor",
    content:
      "네, 높이는 6mm 정도로, 각도는 15도 정도 조정이 필요합니다. 환자의 교합 관계상 중요한 부분이에요.",
    timestamp: new Date("2024-01-15T10:15:00"),
  },
];

export const ExpandedRequestCard = ({
  request,
  onClose,
  currentUserId = "1",
  currentUserRole = "requestor",
}: ExpandedRequestCardProps) => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>(mockChatMessages);
  const [newMessage, setNewMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // 결제 상태 정보 (실제 구현 시 API에서 가져와야 함)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    status: "unpaid",
    amount: 150000, // 예시 금액
    dueDate: "2024-06-30",
  });

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      senderId: currentUserId,
      senderName: currentUserRole === "requestor" ? "김철수" : "박영희",
      senderRole: currentUserRole,
      content: newMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, message]);
    setNewMessage("");

    toast({
      title: "메시지가 전송되었습니다",
      description: "상대방이 곧 응답할 예정입니다.",
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "requestor":
        return "text-blue-600";
      case "manufacturer":
        return "text-green-600";
      case "admin":
        return "text-purple-600";
      default:
        return "text-gray-600";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "requestor":
        return "의뢰자";
      case "manufacturer":
        return "제작사";
      case "admin":
        return "어벗츠.핏";
      default:
        return "사용자";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "진행중":
      case "제작중":
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
      toast({
        title: "파일이 첨부되었습니다",
        description: `${selectedFiles.length}개 파일이 추가되었습니다.`,
      });
    }
  };

  const handleCardDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleCardDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...droppedFiles]);

      toast({
        title: "파일이 업로드되었습니다",
        description: `${droppedFiles.length}개 파일이 추가되었습니다.`,
      });
    },
    [toast]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 결제 처리 함수
  const handlePayment = () => {
    // 토스페이먼츠 퀵자동이체 결제창 호출
    // 실제 구현 시 토스페이먼츠 SDK를 사용하여 결제창을 띄움
    window.location.href = `/api/payments/process-payment?requestId=${
      request.id
    }&amount=${paymentStatus.amount}&returnUrl=${encodeURIComponent(
      window.location.href
    )}`;
  };

  // 결제 상태에 따른 배지 색상 및 텍스트
  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 결제완료
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 flex items-center gap-1">
            <Clock8 className="h-3 w-3" /> 결제중
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> 결제실패
          </Badge>
        );
      case "unpaid":
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200 flex items-center gap-1">
            <CreditCard className="h-3 w-3" /> 미결제
          </Badge>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col transition-all ${
          isDragOver ? "ring-2 ring-primary bg-primary/5" : ""
        }`}
        onDragOver={handleCardDragOver}
        onDragLeave={handleCardDragLeave}
        onDrop={handleCardDrop}
      >
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-xl">{request.title}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {request.date || request.requestDate}
                </span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {request.manufacturer || request.client || "미배정"}
                </span>
                {getStatusBadge(request.status)}
              </div>
              {isDragOver && (
                <div className="text-sm text-primary font-medium">
                  파일을 놓아서 업로드하세요
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Request Details */}
          <div className="bg-muted/30 rounded-lg p-4 mb-4">
            <h4 className="font-medium mb-2">의뢰 내용</h4>
            <p className="text-sm text-muted-foreground">
              {request.description}
            </p>
            {request.implantType && (
              <div className="mt-2 text-xs text-muted-foreground">
                임플란트: {request.implantType} | 규격: {request.implantSpec}
              </div>
            )}
            {request.specifications && (
              <div className="mt-2 text-xs text-muted-foreground">
                임플란트: {request.specifications.implantType} | 직경:{" "}
                {request.specifications.diameter}
              </div>
            )}
          </div>

          {/* Payment Section - 의뢰자인 경우에만 표시 */}
          {currentUserRole === "requestor" && (
            <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> 결제 정보
                </h4>
                {getPaymentStatusBadge(paymentStatus.status)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">금액:</span>{" "}
                  {paymentStatus.amount.toLocaleString()}원
                </div>
                <div>
                  <span className="text-muted-foreground">결제기한:</span>{" "}
                  {paymentStatus.dueDate}
                </div>
                {paymentStatus.paidDate && (
                  <div>
                    <span className="text-muted-foreground">결제일:</span>{" "}
                    {paymentStatus.paidDate}
                  </div>
                )}
                {paymentStatus.paymentMethod && (
                  <div>
                    <span className="text-muted-foreground">결제방법:</span>{" "}
                    {paymentStatus.paymentMethod}
                  </div>
                )}
              </div>

              {paymentStatus.status === "unpaid" && (
                <Button
                  onClick={handlePayment}
                  className="w-full"
                  variant="default"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  자동이체로 결제하기
                </Button>
              )}

              {paymentStatus.status === "failed" && (
                <Alert variant="destructive" className="mt-2 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>결제 실패</AlertTitle>
                  <AlertDescription>
                    결제가 실패했습니다. 다시 시도해주세요.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Payment Section - 제조사인 경우에만 표시 */}
          {currentUserRole === "manufacturer" && (
            <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> 결제 정보
                </h4>
                {getPaymentStatusBadge(paymentStatus.status)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">금액:</span>{" "}
                  {paymentStatus.amount.toLocaleString()}원
                </div>
                {paymentStatus.status === "paid" ? (
                  <div>
                    <span className="text-muted-foreground">결제일:</span>{" "}
                    {paymentStatus.paidDate}
                  </div>
                ) : (
                  <div>
                    <span className="text-muted-foreground">결제기한:</span>{" "}
                    {paymentStatus.dueDate}
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          {/* Chat Section */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Chat section header removed */}

            {/* Messages with fixed height and scroll */}
            <div className="flex-1 h-[300px] border border-border rounded-lg overflow-y-auto">
              <ScrollArea className="h-full p-4">
                <div className="space-y-4 pr-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.senderId === currentUserId
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      {message.senderId !== currentUserId && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {message.senderName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={`max-w-[70%] ${
                          message.senderId === currentUserId
                            ? "order-first"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-medium ${getRoleColor(
                              message.senderRole
                            )}`}
                          >
                            {message.senderName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getRoleLabel(message.senderRole)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div
                          className={`rounded-lg p-3 text-sm ${
                            message.senderId === currentUserId
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>

                      {message.senderId === currentUserId && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {message.senderName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Attached Files */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <h5 className="text-sm font-medium">첨부된 파일</h5>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 p-2 bg-muted rounded text-xs w-fit"
                    >
                      <FileIcon className="h-3 w-3" />
                      <span className="truncate max-w-24">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-4 w-4 p-0 ml-1"
                      >
                        <X className="h-2 w-2" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input with File Attachment */}
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Textarea
                    placeholder="메시지를 입력하세요..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="resize-none"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      document.getElementById("chat-file-input")?.click()
                    }
                    className="shrink-0"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    size="sm"
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <input
                  id="chat-file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".jpg,.jpeg,.png,.pdf,.stl,.ply,.obj"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
