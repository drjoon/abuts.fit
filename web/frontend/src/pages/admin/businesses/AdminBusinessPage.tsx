import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Search,
  Anchor,
  Wallet,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import type { BusinessCredit } from "@/pages/admin/credits/adminCredit.types";

type ApiBusinessCreditsResponse = {
  success: boolean;
  data?: {
    items?: BusinessCredit[];
    total?: number;
  };
  message?: string;
  error?: string;
};

const formatMoney = (value: number) => {
  try {
    return Number(value || 0).toLocaleString("ko-KR");
  } catch {
    return String(value || 0);
  }
};

const getBusinessTypeLabel = (type?: string) => {
  switch (type) {
    case "requestor":
      return "의뢰자";
    case "salesman":
      return "영업자";
    case "manufacturer":
      return "제조사";
    case "devops":
      return "개발운영사";
    default:
      return type || "미분류";
  }
};

const getBusinessTypeBadgeClass = (type?: string) => {
  switch (type) {
    case "requestor":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "salesman":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "manufacturer":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "devops":
      return "bg-violet-100 text-violet-700 border-violet-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export default function AdminBusinessPage() {
  const { token } = useAuthStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-business-page", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<ApiBusinessCreditsResponse>({
        path: "/api/admin/credits/businesses?limit=200&skip=0",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        const msg =
          res.data?.message ||
          res.data?.error ||
          "사업자 목록 조회에 실패했습니다.";
        throw new Error(msg);
      }
      return {
        items: res.data.data?.items || [],
        total: Number(res.data.data?.total || 0),
      };
    },
    retry: false,
  });

  const businesses = data?.items || [];

  const filteredBusinesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businesses.filter((business) => {
      const matchesType =
        typeFilter === "all" ||
        String(business.businessType || "") === typeFilter;
      if (!matchesType) return false;
      if (!q) return true;
      const hay = [
        business.name,
        business.companyName,
        business.businessNumber,
        business.ownerName,
        business.ownerEmail,
        business.businessAnchorId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [businesses, search, typeFilter]);

  const totalBusinesses = data?.total || businesses.length;
  const anchoredCount = businesses.filter((business) =>
    Boolean(business.businessAnchorId),
  ).length;
  const missingAnchorCount = totalBusinesses - anchoredCount;

  const requestorCount = businesses.filter(
    (business) => business.businessType === "requestor",
  ).length;
  const salesmanCount = businesses.filter(
    (business) => business.businessType === "salesman",
  ).length;
  const manufacturerCount = businesses.filter(
    (business) => business.businessType === "manufacturer",
  ).length;
  const devopsCount = businesses.filter(
    (business) => business.businessType === "devops",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 bg-gradient-subtle p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">사업자</h1>
          <p className="text-sm text-muted-foreground">
            BusinessAnchor를 중심으로 사업자 연결 상태와 크레딧을 확인합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 사업자</p>
                <p className="text-2xl font-bold">
                  {totalBusinesses.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2">
                <Anchor className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Anchor 연결</p>
                <p className="text-2xl font-bold">
                  {anchoredCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Anchor 미연결</p>
                <p className="text-2xl font-bold">
                  {missingAnchorCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-100 p-2">
                <Wallet className="h-4 w-4 text-sky-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">표시 사업자</p>
                <p className="text-2xl font-bold">
                  {filteredBusinesses.length.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>BusinessAnchor 목록</CardTitle>
              <CardDescription>
                사업자명, 사업자번호, 대표 계정, anchor ID를 함께 확인합니다.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>관리자 전용</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="사업자명 / 사업자번호 / anchor ID / 대표자 검색"
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "전체"],
                ["requestor", "의뢰자"],
                ["salesman", "영업자"],
                ["manufacturer", "제조사"],
                ["devops", "개발운영사"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={typeFilter === value ? "default" : "outline"}
                  onClick={() => setTypeFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : filteredBusinesses.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              표시할 사업자가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredBusinesses.map((business) => {
                const anchorId = String(business.businessAnchorId || "").trim();
                return (
                  <Card key={business._id} className="border-border/70">
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">
                            {business.companyName || business.name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs">
                            {business.name}
                          </CardDescription>
                        </div>
                        <Badge
                          className={getBusinessTypeBadgeClass(
                            business.businessType,
                          )}
                        >
                          {getBusinessTypeLabel(business.businessType)}
                        </Badge>
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>
                          <div className="mb-0.5">사업자번호</div>
                          <div className="font-medium text-foreground">
                            {business.businessNumber || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">BusinessAnchor ID</div>
                          <div className="font-mono text-[11px] break-all text-foreground">
                            {anchorId || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">대표 계정</div>
                          <div className="font-medium text-foreground">
                            {business.ownerName || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">대표 이메일</div>
                          <div className="break-all font-medium text-foreground">
                            {business.ownerEmail || "-"}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                      {business.businessType === "requestor" ? (
                        <>
                          <div className="rounded-lg border p-3">
                            <div className="text-xs text-muted-foreground">
                              크레딧 소비액
                            </div>
                            <div className="mt-1 text-xl font-bold">
                              {formatMoney(business.spentAmount || 0)}원
                            </div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="text-xs text-muted-foreground">
                              크레딧 잔액
                            </div>
                            <div className="mt-1 text-xl font-bold">
                              {formatMoney(business.balance)}원
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-lg border p-3">
                            <div className="text-xs text-muted-foreground">
                              미정산 잔액
                            </div>
                            <div className="mt-1 text-xl font-bold">-원</div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="text-xs text-muted-foreground">
                              정산 잔액
                            </div>
                            <div className="mt-1 text-xl font-bold">-원</div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
