import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { RefreshCw, Eye, RotateCcw, X } from "lucide-react";

type TaskStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
type TaskType =
  | "TAX_INVOICE_ISSUE"
  | "TAX_INVOICE_CANCEL"
  | "EASYFIN_BANK_REQUEST"
  | "EASYFIN_BANK_CHECK"
  | "NOTIFICATION_KAKAO"
  | "NOTIFICATION_SMS"
  | "NOTIFICATION_LMS"
  | "BANK_WEBHOOK";

type QueueTask = {
  _id: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: number;
  uniqueKey: string;
  payload: any;
  attemptCount: number;
  maxAttempts: number;
  error?: {
    message?: string;
    code?: string;
  };
  createdAt: string;
  updatedAt: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
  scheduledFor?: string;
};

type QueueStats = {
  [taskType: string]: {
    [status: string]: number;
  };
};

function statusBadge(status: TaskStatus) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary">대기</Badge>;
    case "PROCESSING":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          처리중
        </Badge>
      );
    case "COMPLETED":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          완료
        </Badge>
      );
    case "FAILED":
      return <Badge variant="destructive">실패</Badge>;
    case "CANCELLED":
      return <Badge variant="outline">취소</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function taskTypeLabel(type: TaskType) {
  const labels: Record<TaskType, string> = {
    TAX_INVOICE_ISSUE: "세금계산서 발행",
    TAX_INVOICE_CANCEL: "세금계산서 취소",
    EASYFIN_BANK_REQUEST: "계좌조회 요청",
    EASYFIN_BANK_CHECK: "계좌조회 확인",
    NOTIFICATION_KAKAO: "카카오톡",
    NOTIFICATION_SMS: "SMS",
    NOTIFICATION_LMS: "LMS",
    BANK_WEBHOOK: "은행 웹훅",
  };
  return labels[type] || type;
}

export const AdminPopbillQueue = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [stats, setStats] = useState<QueueStats>({});
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | "ALL">(
    "ALL"
  );
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType | "ALL">(
    "ALL"
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<QueueTask | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<any>({
        path: "/api/admin/popbill-queue/stats",
        method: "GET",
        token,
      });
      if (res.ok) {
        setStats(res.data?.data || {});
      }
    } catch (error) {
      console.error("Failed to load queue stats:", error);
    }
  }, [token]);

  const loadTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedStatus !== "ALL") qs.set("status", selectedStatus);
      if (selectedTaskType !== "ALL") qs.set("taskType", selectedTaskType);
      qs.set("limit", "50");

      const res = await request<any>({
        path: `/api/admin/popbill-queue/tasks?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok) {
        setTasks(res.data?.data || []);
      }
    } catch (error) {
      toast({
        title: "태스크 목록 조회 실패",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, selectedStatus, selectedTaskType, toast]);

  useEffect(() => {
    loadStats();
    loadTasks();
  }, [loadStats, loadTasks]);

  const openDetail = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await request<any>({
        path: `/api/admin/popbill-queue/tasks/${taskId}`,
        method: "GET",
        token,
      });
      if (res.ok) {
        setDetailTask(res.data?.data || null);
        setDetailOpen(true);
      }
    } catch (error) {
      toast({
        title: "태스크 상세 조회 실패",
        variant: "destructive",
      });
    }
  };

  const retryTask = async (taskId: string) => {
    if (!token) return;
    setActionLoadingId(taskId);
    try {
      const res = await request<any>({
        path: `/api/admin/popbill-queue/tasks/${taskId}/retry`,
        method: "POST",
        token,
      });
      if (res.ok) {
        toast({
          title: "재시도 요청 완료",
          description: "태스크가 대기열에 추가되었습니다.",
        });
        await loadTasks();
        await loadStats();
      } else {
        toast({
          title: "재시도 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "재시도 실패",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const cancelTask = async (taskId: string) => {
    if (!token) return;
    setActionLoadingId(taskId);
    try {
      const res = await request<any>({
        path: `/api/admin/popbill-queue/tasks/${taskId}/cancel`,
        method: "POST",
        token,
      });
      if (res.ok) {
        toast({
          title: "취소 완료",
        });
        await loadTasks();
        await loadStats();
      } else {
        toast({
          title: "취소 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "취소 실패",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalPending = Object.values(stats).reduce(
    (sum, s) => sum + (s.PENDING || 0),
    0
  );
  const totalProcessing = Object.values(stats).reduce(
    (sum, s) => sum + (s.PROCESSING || 0),
    0
  );
  const totalFailed = Object.values(stats).reduce(
    (sum, s) => sum + (s.FAILED || 0),
    0
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">팝빌 큐 모니터링</h2>
          <p className="text-sm text-muted-foreground">
            팝빌 API 작업 큐 상태 및 관리
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            loadStats();
            loadTasks();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">대기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">처리중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProcessing}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-destructive">
              실패
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {totalFailed}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>태스크 타입별 통계</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(stats).map(([taskType, statusCounts]) => (
              <div
                key={taskType}
                className="flex items-center justify-between p-2 border rounded"
              >
                <div className="font-medium">
                  {taskTypeLabel(taskType as TaskType)}
                </div>
                <div className="flex gap-2 text-sm">
                  {statusCounts.PENDING > 0 && (
                    <span className="text-muted-foreground">
                      대기: {statusCounts.PENDING}
                    </span>
                  )}
                  {statusCounts.PROCESSING > 0 && (
                    <span className="text-blue-600">
                      처리중: {statusCounts.PROCESSING}
                    </span>
                  )}
                  {statusCounts.FAILED > 0 && (
                    <span className="text-destructive">
                      실패: {statusCounts.FAILED}
                    </span>
                  )}
                  {statusCounts.COMPLETED > 0 && (
                    <span className="text-green-600">
                      완료: {statusCounts.COMPLETED}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>태스크 목록</CardTitle>
          <CardDescription>
            <div className="flex gap-2 mt-2 flex-wrap">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="ALL">전체 상태</option>
                <option value="PENDING">대기</option>
                <option value="PROCESSING">처리중</option>
                <option value="COMPLETED">완료</option>
                <option value="FAILED">실패</option>
                <option value="CANCELLED">취소</option>
              </select>
              <select
                value={selectedTaskType}
                onChange={(e) => setSelectedTaskType(e.target.value as any)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="ALL">전체 타입</option>
                <option value="TAX_INVOICE_ISSUE">세금계산서 발행</option>
                <option value="TAX_INVOICE_CANCEL">세금계산서 취소</option>
                <option value="EASYFIN_BANK_REQUEST">계좌조회 요청</option>
                <option value="EASYFIN_BANK_CHECK">계좌조회 확인</option>
                <option value="NOTIFICATION_KAKAO">카카오톡</option>
                <option value="NOTIFICATION_SMS">SMS</option>
                <option value="NOTIFICATION_LMS">LMS</option>
              </select>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          )}
          {!loading && tasks.length === 0 && (
            <div className="text-sm text-muted-foreground">
              데이터가 없습니다.
            </div>
          )}
          <div className="space-y-2">
            {tasks.map((task) => {
              const isActionLoading = actionLoadingId === task._id;
              return (
                <div key={task._id} className="border rounded p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(task.status)}
                        <span className="text-sm font-medium">
                          {taskTypeLabel(task.taskType)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {task.attemptCount}/{task.maxAttempts}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {task.uniqueKey}
                      </div>
                      {task.error?.message && (
                        <div className="text-xs text-destructive truncate">
                          {task.error.message}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetail(task._id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {task.status === "FAILED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isActionLoading}
                          onClick={() => retryTask(task._id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {(task.status === "PENDING" ||
                        task.status === "PROCESSING") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isActionLoading}
                          onClick={() => cancelTask(task._id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>태스크 상세</DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">ID</div>
                <div className="text-muted-foreground break-all">
                  {detailTask._id}
                </div>
              </div>
              <div>
                <div className="font-medium">타입</div>
                <div>{taskTypeLabel(detailTask.taskType)}</div>
              </div>
              <div>
                <div className="font-medium">상태</div>
                <div>{statusBadge(detailTask.status)}</div>
              </div>
              <div>
                <div className="font-medium">재시도</div>
                <div>
                  {detailTask.attemptCount} / {detailTask.maxAttempts}
                </div>
              </div>
              <div>
                <div className="font-medium">Unique Key</div>
                <div className="text-muted-foreground break-all">
                  {detailTask.uniqueKey}
                </div>
              </div>
              {detailTask.error && (
                <div>
                  <div className="font-medium text-destructive">에러</div>
                  <div className="text-destructive break-all">
                    {detailTask.error.message}
                  </div>
                  {detailTask.error.code && (
                    <div className="text-xs text-muted-foreground">
                      Code: {detailTask.error.code}
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="font-medium">Payload</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(detailTask.payload, null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-medium">생성 시간</div>
                <div className="text-muted-foreground">
                  {new Date(detailTask.createdAt).toLocaleString("ko-KR")}
                </div>
              </div>
              {detailTask.scheduledFor && (
                <div>
                  <div className="font-medium">예약 시간</div>
                  <div className="text-muted-foreground">
                    {new Date(detailTask.scheduledFor).toLocaleString("ko-KR")}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPopbillQueue;
