// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Phone, Search, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KIND_LABEL,
  salesTeamApi,
  type SalesAccount,
} from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

export default function SalesAccountsPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<SalesAccount> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["sales-team-accounts", q, kind] as const,
    [q, kind],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () =>
      salesTeamApi.listAccounts(token, {
        q: q || undefined,
        kind: kind === "all" ? undefined : kind,
      }),
  });

  const { data: detail } = useQuery({
    queryKey: ["sales-team-account", selectedId],
    enabled: Boolean(token && selectedId),
    queryFn: () => salesTeamApi.getAccount(token, selectedId!),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing?.name || !editing?.kind) {
        throw new Error("이름과 유형은 필수입니다.");
      }
      if (editing._id) {
        return salesTeamApi.updateAccount(token, editing._id, editing);
      }
      return salesTeamApi.createAccount(token, editing);
    },
    onSuccess: () => {
      toast({ title: "저장되었습니다." });
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
      if (selectedId) {
        void qc.invalidateQueries({
          queryKey: ["sales-team-account", selectedId],
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => salesTeamApi.deleteAccount(token, id),
    onSuccess: () => {
      toast({ title: "삭제되었습니다." });
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const items = data?.items || [];
  const practiceCount = items.filter((i) => i.kind === "practice").length;
  const labCount = items.filter((i) => i.kind === "lab").length;
  const joinedCount = items.filter((i) => i.businessAnchorId).length;

  const openCreate = () =>
    setEditing({
      kind: "practice",
      name: "",
      teamVisible: true,
    });

  return (
    <SalesPageShell
      title="거래처"
      subtitle="방문·판매 대상 CRM. 특이사항·연락처·주소 관리. 판매·세금계산서는 플랫폼 가입 사업자만."
      actions={
        <Button size="sm" onClick={openCreate}>
          거래처 추가
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SalesStatCard
          label="전체"
          value={items.length}
          icon={Building2}
          hint={isLoading ? "불러오는 중" : "검색·필터 결과"}
        />
        <SalesStatCard label="치과" value={practiceCount} hint="의뢰 발신자" />
        <SalesStatCard label="기공소" value={labCount} hint="의뢰 수신자" />
        <SalesStatCard
          label="플랫폼 가입"
          value={joinedCount}
          hint={`미가입 ${Math.max(0, items.length - joinedCount)}`}
          tone={joinedCount > 0 ? "ok" : "default"}
        />
      </div>

      <SalesPanel
        title="거래처 목록"
        description="이름·대표·전화로 검색하고 유형으로 좁힙니다."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="이름·대표·전화"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="sm:w-32">
                <SelectValue placeholder="유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="practice">치과</SelectItem>
                <SelectItem value="lab">기공소</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {editing ? (
          <div className="mb-4 space-y-2.5 rounded-xl border border-primary-muted/60 bg-primary-soft/30 p-4">
            <div className="text-sm font-semibold text-slate-900">
              {editing._id ? "거래처 수정" : "새 거래처"}
            </div>
            <Select
              value={editing.kind || "practice"}
              onValueChange={(v) =>
                setEditing((prev) => ({
                  ...prev,
                  kind: v as "practice" | "lab",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="practice">치과</SelectItem>
                <SelectItem value="lab">기공소</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="상호명 *"
              value={editing.name || ""}
              onChange={(e) =>
                setEditing((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="대표자명"
                value={editing.representativeName || ""}
                onChange={(e) =>
                  setEditing((prev) => ({
                    ...prev,
                    representativeName: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="연락처"
                value={editing.phone || ""}
                onChange={(e) =>
                  setEditing((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>
            <Input
              placeholder="주소 (동선·지도용)"
              value={editing.address || ""}
              onChange={(e) =>
                setEditing((prev) => ({ ...prev, address: e.target.value }))
              }
            />
            <Textarea
              placeholder="특이사항 · 방문 팁 · 담당자 메모"
              value={editing.memo || ""}
              onChange={(e) =>
                setEditing((prev) => ({ ...prev, memo: e.target.value }))
              }
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                저장
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                취소
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <SalesEmptyState
            icon={Building2}
            title="등록된 거래처가 없습니다"
            description="방문할 치과·기공소를 등록하면 일정·동선·일일보고에 바로 쓸 수 있습니다."
            actionLabel="첫 거래처 추가"
            onAction={openCreate}
          />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <SalesListRow
                key={item._id}
                selected={selectedId === item._id}
                onClick={() => setSelectedId(item._id)}
                title={item.name}
                meta={
                  [item.representativeName, item.phone, item.address]
                    .filter(Boolean)
                    .join(" · ") || "연락처/주소 없음"
                }
                trailing={
                  <div className="flex items-center gap-1">
                    {item.businessAnchorId ? (
                      <Badge>가입</Badge>
                    ) : (
                      <Badge variant="outline">미가입</Badge>
                    )}
                    <Badge variant="secondary">
                      {KIND_LABEL[item.kind] || item.kind}
                    </Badge>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </SalesPanel>

      {detail ? (
        <SalesPanel
          title={detail.name}
          description={`${KIND_LABEL[detail.kind] || detail.kind}${
            detail.businessAnchorId ? " · 플랫폼 가입" : " · 플랫폼 미가입"
          }`}
          actions={
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(detail)}
              >
                수정
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm("이 거래처를 삭제할까요?")) {
                    deleteMut.mutate(detail._id);
                  }
                }}
              >
                삭제
              </Button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="text-xs text-muted-foreground">대표</div>
                <div>{detail.representativeName || "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <Phone className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="text-xs text-muted-foreground">전화</div>
                <div>{detail.phone || "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:col-span-2">
              <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">주소</div>
                {detail.address ? (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href={`https://map.kakao.com/?q=${encodeURIComponent(detail.address)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detail.address}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700">
            {detail.memo || "특이사항 없음"}
          </div>
          {!detail.businessAnchorId ? (
            <p className="mt-3 text-xs text-muted-foreground">
              플랫폼 미가입이면 판매·세금계산서가 불가합니다. 소개코드로 가입을
              유도하세요.
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => setSelectedId(null)}
          >
            닫기
          </Button>
        </SalesPanel>
      ) : null}
    </SalesPageShell>
  );
}
