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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"open" | "resolved">("resolved");

  const selected = useMemo(
    () => items.find((item) => item._id === selectedId) || null,
    [items, selectedId],
  );
  const selectedUser = selected?.user || selected?.userSnapshot || {};

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const user = item.user || item.userSnapshot || {};
      return (
        item.subject?.toLowerCase().includes(query) ||
        item.message?.toLowerCase().includes(query) ||
        String(user.business || "")
          .toLowerCase()
          .includes(query) ||
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      );
    });
  }, [items, searchQuery]);

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

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredItems.map((item) => item._id)));
  };

  const handleBulkStatusChange = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      toast({ title: "선택된 문의가 없습니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updates = await Promise.all(
        ids.map((id) =>
          updateBusinessRegistrationInquiry(id, {
            status: bulkStatus,
            adminNote,
          }),
        ),
      );
      setItems((prev) =>
        prev.map((item) => updates.find((u) => u._id === item._id) || item),
      );
      setSelectedIds(new Set());
      toast({
        title: `선택된 문의를 ${statusLabelMap[bulkStatus]}로 변경했습니다.`,
      });
    } catch (error: any) {
      toast({
        title: "일괄 처리 실패",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const rows = items.map((item) => {
      const user = item.user || item.userSnapshot || {};
      return {
        id: item._id,
        createdAt: item.createdAt || "",
        type: typeLabelMap[item.type || "general"] || "",
        status: statusLabelMap[item.status || "open"] || "",
        subject: item.subject || "",
        message: item.message || "",
        business: user.business || "",
        name: user.name || "",
        email: user.email || "",
      };
    });
    const header = [
      "id",
      "createdAt",
      "type",
      "status",
      "subject",
      "message",
      "business",
      "name",
      "email",
    ];
    const csv = [header.join(",")]
      .concat(
        rows.map((row) =>
          header
            .map(
              (key) =>
                `"${String((row as any)[key] || "").replace(/"/g, '""')}"`,
            )
            .join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>문의</CardTitle>
            <CardDescription>
              문의 목록을 확인하고 처리 상태를 관리합니다.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
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
                <TabsList className="gap-2">
                  <TabsTrigger value="all">전체</TabsTrigger>
                  <TabsTrigger value="general">일반</TabsTrigger>
                  <TabsTrigger value="business_registration">
                    사업자등록
                  </TabsTrigger>
                  <TabsTrigger value="user_registration">
                    사용자등록
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="text"
                placeholder="검색 (제목, 내용, 사업장, 담당자, 이메일)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
              <Button type="button" variant="outline" onClick={handleExportCsv}>
                CSV
              </Button>
              <Select
                value={bulkStatus}
                onValueChange={(value) =>
                  setBulkStatus(value as "open" | "resolved")
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">처리완료</SelectItem>
                  <SelectItem value="open">미처리</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={handleBulkStatusChange}
                disabled={saving || !selectedIds.size}
              >
                선택 상태 변경
              </Button>
              <div className="ml-auto text-sm text-muted-foreground">
                {loading ? "불러오는 중..." : `총 ${filteredItems.length}건`}
                {selectedIds.size > 0 ? ` · 선택 ${selectedIds.size}건` : ""}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">문의 목록</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          filteredItems.length > 0 &&
                          selectedIds.size === filteredItems.length
                        }
                        onCheckedChange={(value) =>
                          handleSelectAll(Boolean(value))
                        }
                      />
                    </TableHead>
                    <TableHead className="w-[120px]">상태</TableHead>
                    <TableHead className="w-[120px]">유형</TableHead>
                    <TableHead className="w-[180px]">사업장</TableHead>
                    <TableHead className="w-[120px]">담당자</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-[150px]">접수일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const user = item.user || item.userSnapshot || {};
                    const isChecked = selectedIds.has(item._id);
                    const isSelected = item._id === selectedId;
                    return (
                      <TableRow
                        key={item._id}
                        className={
                          isSelected ? "bg-slate-50" : "cursor-pointer"
                        }
                        onClick={() => setSelectedId(item._id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(value) =>
                              toggleSelection(item._id, Boolean(value))
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === "resolved" ? "outline" : "default"
                            }
                          >
                            {statusLabelMap[item.status || "open"] || "미처리"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {typeLabelMap[item.type || "general"] || "일반 문의"}
                        </TableCell>
                        <TableCell className="truncate">
                          {user.business || "-"}
                        </TableCell>
                        <TableCell>{user.name || "-"}</TableCell>
                        <TableCell className="truncate">
                          {item.subject || "-"}
                        </TableCell>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!filteredItems.length && !loading && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-sm text-slate-400"
                      >
                        문의 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">문의 상세</CardTitle>
            <CardDescription>
              선택한 문의의 상세 정보와 관리자 메모를 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <div className="text-sm text-slate-400">
                문의 내역을 선택해주세요.
              </div>
            ) : (
              <>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">상태</span>
                    <Badge
                      variant={
                        selected.status === "resolved" ? "outline" : "default"
                      }
                    >
                      {statusLabelMap[selected.status || "open"] || "미처리"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">유형</span>
                    <span>
                      {typeLabelMap[selected.type || "general"] || "일반 문의"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">접수일</span>
                    <span>{formatDate(selected.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">사업장</span>
                    <span className="text-right">
                      {selectedUser.business || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">담당자</span>
                    <span>{selectedUser.name || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">이메일</span>
                    <span className="text-right">
                      {selectedUser.email || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">역할</span>
                    <span>{selectedUser.role || "-"}</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  <div className="text-xs text-slate-500">제목</div>
                  <div className="text-sm font-medium">
                    {selected.subject || "-"}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  <div className="text-xs text-slate-500">내용</div>
                  <div className="whitespace-pre-wrap break-words text-sm">
                    {selected.message || "-"}
                  </div>
                </div>

                {selected.reason || selected.payload?.errorMessage ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="text-xs text-slate-500">추가 정보</div>
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="text-slate-500">문의 사유</span>
                        <div>{selected.reason || "-"}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">오류 메시지</span>
                        <div>{selected.payload?.errorMessage || "-"}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium">관리자 메모</label>
                  <Textarea
                    rows={5}
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
