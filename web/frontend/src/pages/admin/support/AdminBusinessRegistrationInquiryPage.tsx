import { useEffect, useMemo, useState } from "react";
import {
  BusinessRegistrationInquiry,
  fetchBusinessRegistrationInquiries,
  updateBusinessRegistrationInquiry,
} from "./businessRegistrationInquiryApi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/shared/hooks/use-toast";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
};

const statusLabelMap: Record<string, string> = {
  open: "미처리",
  resolved: "처리완료",
};

const typeLabelMap: Record<string, string> = {
  general: "일반 문의",
  business_registration: "사업자등록 문의",
  user_registration: "사용자등록 문의",
};

export const AdminBusinessRegistrationInquiryPage = () => {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">(
    "open",
  );
  const [typeFilter, setTypeFilter] = useState<
    "all" | "general" | "business_registration" | "user_registration"
  >("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BusinessRegistrationInquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const selected = useMemo(
    () => items.find((item) => item._id === selectedId) || null,
    [items, selectedId],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchBusinessRegistrationInquiries({
          status: statusFilter === "all" ? undefined : statusFilter,
          type: typeFilter === "all" ? undefined : typeFilter,
          limit: 200,
        });
        if (!mounted) return;
        setItems(data);
        if (!data.some((item) => item._id === selectedId)) {
          setSelectedId(data[0]?._id ?? null);
        }
      } catch (error: any) {
        toast({
          title: "문의 목록 로딩 실패",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [selectedId, statusFilter, typeFilter, toast]);

  useEffect(() => {
    setAdminNote(selected?.adminNote || "");
  }, [selected]);

  const handleUpdate = async (nextStatus: "open" | "resolved") => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateBusinessRegistrationInquiry(selected._id, {
        status: nextStatus,
        adminNote,
      });
      setItems((prev) =>
        prev.map((item) => (item._id === updated._id ? updated : item)),
      );
      toast({ title: "문의가 업데이트되었습니다." });
    } catch (error: any) {
      toast({
        title: "문의 업데이트 실패",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>문의</CardTitle>
          <CardDescription>
            모든 문의를 확인하고 처리 상태를 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as "all" | "open" | "resolved")
            }
          >
            <TabsList className="gap-2">
              <TabsTrigger value="open">미처리</TabsTrigger>
              <TabsTrigger value="resolved">처리완료</TabsTrigger>
              <TabsTrigger value="all">전체</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={typeFilter}
            onValueChange={(value) =>
              setTypeFilter(
                value as
                  | "all"
                  | "general"
                  | "business_registration"
                  | "user_registration",
              )
            }
          >
            <TabsList className="mt-3 gap-2">
              <TabsTrigger value="all">전체 문의</TabsTrigger>
              <TabsTrigger value="general">일반 문의</TabsTrigger>
              <TabsTrigger value="business_registration">
                사업자등록
              </TabsTrigger>
              <TabsTrigger value="user_registration">사용자등록</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">문의 목록</CardTitle>
            <CardDescription>
              {loading ? "불러오는 중..." : `${items.length}건`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>접수일</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>사업장</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const user = item.user || item.userSnapshot || {};
                  const typeLabel =
                    typeLabelMap[item.type || "general"] || "일반 문의";
                  return (
                    <TableRow
                      key={item._id}
                      className={
                        item._id === selectedId
                          ? "bg-slate-50"
                          : "cursor-pointer"
                      }
                      onClick={() => setSelectedId(item._id)}
                    >
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
                      <TableCell>{typeLabel}</TableCell>
                      <TableCell>{user.organization || "-"}</TableCell>
                      <TableCell>{user.name || "-"}</TableCell>
                      <TableCell>{item.subject || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "resolved" ? "outline" : "default"
                          }
                        >
                          {statusLabelMap[item.status || "open"] || "미처리"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!items.length && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-slate-400"
                    >
                      문의 내역이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">문의 상세</CardTitle>
            <CardDescription>
              선택한 문의의 상세 정보를 확인하고 메모를 남길 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <div className="text-sm text-slate-400">
                문의 내역을 선택해주세요.
              </div>
            )}
            {selected && (
              <>
                <div className="grid gap-3 text-sm">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">접수일</span>
                    <span>{formatDate(selected.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">문의 유형</span>
                    <span>
                      {typeLabelMap[selected.type || "general"] || "일반 문의"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">사업장</span>
                    <span>
                      {selected.user?.organization ||
                        selected.userSnapshot?.organization ||
                        "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">담당자</span>
                    <span>
                      {selected.user?.name ||
                        selected.userSnapshot?.name ||
                        "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">이메일</span>
                    <span>
                      {selected.user?.email ||
                        selected.userSnapshot?.email ||
                        "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">역할</span>
                    <span>
                      {selected.user?.role ||
                        selected.userSnapshot?.role ||
                        "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">문의 사유</span>
                    <span>{selected.reason || "-"}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">문의 제목</span>
                    <span>{selected.subject || "-"}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">문의 내용</span>
                    <span>{selected.message || "-"}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-500">오류 메시지</span>
                    <span>{selected.payload?.errorMessage || "-"}</span>
                  </div>
                </div>

                <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-600">
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.payload?.ownerForm || {}, null, 2)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">관리자 메모</label>
                  <Textarea
                    rows={4}
                    value={adminNote}
                    onChange={(event) => setAdminNote(event.target.value)}
                    placeholder="처리 내용을 입력하세요"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => handleUpdate("resolved")}
                    disabled={saving}
                  >
                    처리 완료
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUpdate("open")}
                    disabled={saving}
                  >
                    미처리로 변경
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminBusinessRegistrationInquiryPage;
