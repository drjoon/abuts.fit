// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">거래처</h1>
          <p className="text-sm text-muted-foreground">
            특이사항·연락처·주소. 판매는 플랫폼 가입 사업자만.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            setEditing({
              kind: "practice",
              name: "",
              teamVisible: true,
            })
          }
        >
          추가
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="이름·대표·전화 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:flex-1"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="practice">치과</SelectItem>
            <SelectItem value="lab">기공소</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {editing ? (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-base">
              {editing._id ? "거래처 수정" : "거래처 추가"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
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
              placeholder="상호명"
              value={editing.name || ""}
              onChange={(e) =>
                setEditing((prev) => ({ ...prev, name: e.target.value }))
              }
            />
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
            <Input
              placeholder="주소"
              value={editing.address || ""}
              onChange={(e) =>
                setEditing((prev) => ({ ...prev, address: e.target.value }))
              }
            />
            <Textarea
              placeholder="특이사항 메모"
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
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">거래처가 없습니다.</p>
        ) : (
          items.map((item) => (
            <button
              key={item._id}
              type="button"
              className="w-full rounded-md border px-3 py-2.5 text-left hover:bg-muted/40"
              onClick={() => setSelectedId(item._id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
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
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {[item.representativeName, item.phone, item.address]
                  .filter(Boolean)
                  .join(" · ") || "연락처/주소 없음"}
              </div>
            </button>
          ))
        )}
      </div>

      {detail ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3">
            <CardTitle className="text-base">{detail.name}</CardTitle>
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
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 text-sm">
            <div>
              대표: {detail.representativeName || "—"} · 전화:{" "}
              {detail.phone || "—"}
            </div>
            <div>
              주소:{" "}
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
            <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">
              {detail.memo || "특이사항 없음"}
            </div>
            {!detail.businessAnchorId ? (
              <p className="text-xs text-muted-foreground">
                플랫폼 미가입 상태에서는 판매·세금계산서가 불가합니다. 소개코드로
                가입을 유도하세요.
              </p>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
              닫기
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
