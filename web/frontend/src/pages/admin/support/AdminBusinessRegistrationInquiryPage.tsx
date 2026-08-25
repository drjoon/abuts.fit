// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/backend/controllers/support/support.controller.js
// change-log:
// - 2026-08-26: 최신 admin 소통 UI(채팅/메일) 스타일로 레이아웃·카드·배지 리팩터.
// - 2026-08-15: lab_fee_item_add_request(기공비 항목 추가 요청) 유형 라벨.
// - 2026-08-14: manufacturer_add_request(임플란트 추가 요청) 유형 라벨.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { INQUIRY_TYPE_LABEL } from "@/features/support/InquiriesPage";
import { cn } from "@/shared/ui/cn";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { ArrowLeft, Download, Search } from "lucide-react";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabelMap: Record<string, string> = {
  open: "미처리",
  resolved: "처리완료",
};

const getInquiryStatusBadge = (status?: string | null) => {
  if (status === "resolved") {
    return <Badge variant="secondary">처리완료</Badge>;
  }
  return (
    <Badge className="bg-primary-soft text-primary-strong border-primary-muted">
      미처리
    </Badge>
  );
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const DetailField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <div className="min-w-0 text-right font-medium">{children}</div>
  </div>
);

const ContentBlock = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="text-sm">{children}</div>
  </div>
);

export const AdminBusinessRegistrationInquiryPage = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [mobileShowList, setMobileShowList] = useState(true);
  const [searchParams] = useSearchParams();
  const initialStatusParam = searchParams.get("status");
  const initialStatusFilter: "all" | "open" | "resolved" =
    initialStatusParam === "all" ||
    initialStatusParam === "open" ||
    initialStatusParam === "resolved"
      ? initialStatusParam
      : "open";
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">(
    initialStatusFilter,
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
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

  const loadInquiries = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await fetchBusinessRegistrationInquiries({
        status: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 200,
      });
      setItems(data);
      setSelectedId((prev) => {
        if (prev && data.some((item) => item._id === prev)) return prev;
        return data[0]?._id ?? null;
      });
    } catch (error: unknown) {
      if (!silent) {
        toast({
          title: "문의 목록 로딩 실패",
          description: toErrorMessage(error, "문의 목록을 불러오지 못했습니다."),
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, typeFilter, toast]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useAppEventDebouncedReload({
    eventTypes: [
      "support:inquiry-created",
      "support:inquiry-updated",
      "comm:badge-update",
    ],
    delayMs: 180,
    shouldHandle: (evt) => {
      const type = String(evt?.type || "").trim();
      if (type === "support:inquiry-created" || type === "support:inquiry-updated") {
        return true;
      }
      if (type !== "comm:badge-update") return false;
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      return String(payload.key || "").trim() === "inquiry";
    },
    onMatch: () => {
      void loadInquiries({ silent: true });
    },
  });

  useEffect(() => {
    setAdminNote(selected?.adminNote || "");
  }, [selected]);

  useEffect(() => {
    setMobileShowList(true);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (!selectedId) {
      setMobileShowList(true);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) return;
    setMobileShowList(!selectedId);
  }, [isMobile, selectedId]);

  const handleSelectInquiry = (id: string) => {
    setSelectedId(id);
    if (isMobile) {
      setMobileShowList(false);
    }
  };

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
    } catch (error: unknown) {
      toast({
        title: "일괄 처리 실패",
        description: toErrorMessage(error, "문의 일괄 처리에 실패했습니다."),
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
        type: INQUIRY_TYPE_LABEL[item.type || "general"] || "",
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
            .map((key) => {
              const safeRow = row as Record<string, unknown>;
              return `"${String(safeRow[key] || "").replace(/"/g, '""')}"`;
            })
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
    } catch (error: unknown) {
      toast({
        title: "문의 업데이트 실패",
        description: toErrorMessage(error, "문의 상태 업데이트에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const showListPanel = !isMobile || mobileShowList;
  const showDetailPanel = !isMobile || !mobileShowList;

  const statusFilters: Array<{ value: "all" | "open" | "resolved"; label: string }> =
    [
      { value: "open", label: "미처리" },
      { value: "resolved", label: "처리완료" },
      { value: "all", label: "전체" },
    ];

  const typeFilters: Array<{ value: string; label: string }> = [
    { value: "all", label: "전체 유형" },
    { value: "general", label: "일반" },
    { value: "business_registration", label: "사업자등록" },
    { value: "user_registration", label: "사용자등록" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-subtle p-2 sm:p-4">
      <div className="max-w-7xl w-full mx-auto space-y-4 sm:space-y-6 flex flex-col flex-1 min-h-0">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">문의</h1>
          <p className="text-sm text-muted-foreground">
            문의 목록을 확인하고 처리 상태를 관리합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 flex-1 min-h-0">
          {showListPanel ? (
            <Card className="flex flex-col overflow-hidden min-h-0">
              <CardHeader className="space-y-3 shrink-0 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="제목, 내용, 사업장, 담당자, 이메일 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {statusFilters.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={statusFilter === filter.value ? "default" : "outline"}
                      onClick={() => setStatusFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {typeFilters.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={typeFilter === filter.value ? "default" : "outline"}
                      onClick={() => setTypeFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={
                      filteredItems.length > 0 &&
                      selectedIds.size === filteredItems.length
                    }
                    onCheckedChange={(value) => handleSelectAll(Boolean(value))}
                  />
                  <span className="text-xs text-muted-foreground">전체 선택</span>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {loading ? "불러오는 중..." : `총 ${filteredItems.length}건`}
                    {selectedIds.size > 0 ? ` · 선택 ${selectedIds.size}건` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleExportCsv}
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Select
                    value={bulkStatus}
                    onValueChange={(value) =>
                      setBulkStatus(value as "open" | "resolved")
                    }
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resolved">처리완료</SelectItem>
                      <SelectItem value="open">미처리</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBulkStatusChange}
                    disabled={saving || !selectedIds.size}
                  >
                    선택 상태 변경
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-0 flex-1 min-h-0">
                <ScrollArea className="h-[520px]">
                  <div className="space-y-2 p-2 pt-0">
                    {loading && filteredItems.length === 0 ? (
                      <div className="space-y-2">
                        <Skeleton className="h-[72px] w-full rounded-lg" />
                        <Skeleton className="h-[72px] w-full rounded-lg" />
                        <Skeleton className="h-[72px] w-full rounded-lg" />
                      </div>
                    ) : filteredItems.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        문의 내역이 없습니다.
                      </div>
                    ) : (
                      filteredItems.map((item) => {
                        const user = item.user || item.userSnapshot || {};
                        const isChecked = selectedIds.has(item._id);
                        const isSelected = item._id === selectedId;
                        const typeLabel =
                          INQUIRY_TYPE_LABEL[item.type || "general"] || "일반";

                        return (
                          <div
                            key={item._id}
                            className={cn(
                              "flex items-start gap-2 rounded-lg border px-2.5 py-2.5 transition-colors",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(value) =>
                                toggleSelection(item._id, Boolean(value))
                              }
                              onClick={(event) => event.stopPropagation()}
                              className={cn(
                                "mt-1",
                                isSelected && "border-primary-foreground/60",
                              )}
                            />
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => handleSelectInquiry(item._id)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isSelected ? (
                                    <Badge
                                      variant="secondary"
                                      className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20"
                                    >
                                      {statusLabelMap[item.status || "open"]}
                                    </Badge>
                                  ) : (
                                    getInquiryStatusBadge(item.status)
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-xs",
                                      isSelected &&
                                        "border-primary-foreground/30 text-primary-foreground",
                                    )}
                                  >
                                    {typeLabel}
                                  </Badge>
                                </div>
                                <span
                                  className={cn(
                                    "shrink-0 text-xs",
                                    isSelected
                                      ? "text-primary-foreground/75"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {formatDate(item.createdAt)}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "mt-1.5 truncate text-sm font-medium",
                                  isSelected && "text-primary-foreground",
                                )}
                              >
                                {item.subject || "(제목 없음)"}
                              </div>
                              <div
                                className={cn(
                                  "mt-0.5 truncate text-xs",
                                  isSelected
                                    ? "text-primary-foreground/75"
                                    : "text-muted-foreground",
                                )}
                              >
                                {[user.business, user.name].filter(Boolean).join(" · ") ||
                                  "-"}
                              </div>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}

          {showDetailPanel ? (
            <Card className="flex flex-col overflow-hidden min-h-0">
              <CardHeader className="shrink-0 space-y-1 pb-3">
                {isMobile && !mobileShowList ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileShowList(true)}
                    className="-ml-2 gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    목록
                  </Button>
                ) : null}
                <CardTitle className="text-base">
                  {selected?.subject || "문의 상세"}
                </CardTitle>
                <CardDescription>
                  선택한 문의의 상세 정보와 관리자 메모를 확인합니다.
                </CardDescription>
              </CardHeader>

              <CardContent className="min-h-0 flex-1">
                <ScrollArea className="h-[520px] pr-3">
                  {!selected ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      문의 내역을 선택해주세요.
                    </div>
                  ) : loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-32 w-full rounded-xl" />
                    </div>
                  ) : (
                    <div className="space-y-4 pb-2">
                      <div className="grid gap-2">
                        <DetailField label="상태">
                          {getInquiryStatusBadge(selected.status)}
                        </DetailField>
                        <DetailField label="유형">
                          {INQUIRY_TYPE_LABEL[selected.type || "general"] ||
                            "일반"}
                        </DetailField>
                        <DetailField label="접수일">
                          {formatDate(selected.createdAt)}
                        </DetailField>
                        <DetailField label="사업장">
                          {selectedUser.business || "-"}
                        </DetailField>
                        <DetailField label="담당자">
                          {selectedUser.name || "-"}
                        </DetailField>
                        <DetailField label="이메일">
                          <span className="break-all">{selectedUser.email || "-"}</span>
                        </DetailField>
                        <DetailField label="역할">
                          {selectedUser.role || "-"}
                        </DetailField>
                      </div>

                      <ContentBlock label="제목">
                        <div className="font-medium">{selected.subject || "-"}</div>
                      </ContentBlock>

                      <ContentBlock label="내용">
                        <div className="whitespace-pre-wrap break-words">
                          {selected.message || "-"}
                        </div>
                      </ContentBlock>

                      {selected.reason || selected.payload?.errorMessage ? (
                        <ContentBlock label="추가 정보">
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs text-muted-foreground">
                                문의 사유
                              </div>
                              <div>{selected.reason || "-"}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                오류 메시지
                              </div>
                              <div>{selected.payload?.errorMessage || "-"}</div>
                            </div>
                          </div>
                        </ContentBlock>
                      ) : null}

                      <div className="space-y-2">
                        <label className="text-sm font-medium">관리자 메모</label>
                        <Textarea
                          rows={5}
                          value={adminNote}
                          onChange={(event) => setAdminNote(event.target.value)}
                          placeholder="처리 내용을 입력하세요"
                          className="rounded-xl border-slate-200/80 bg-white"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
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
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AdminBusinessRegistrationInquiryPage;
