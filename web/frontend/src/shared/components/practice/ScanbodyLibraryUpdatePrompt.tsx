// 공용 스캔바디 라이브러리 새 버전(제조사 업데이트 등)이 나오면 우리 기공소 사본을 업데이트할지 묻는다.
// 「나중에」는 그 버전(baseContentUpdatedAt)만 기억하고, 다음 버전이 나오면 다시 묻는다.
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts (rebaseScanbodyLibrary)
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js (rebaseScanbodyLibrary)
import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { rebaseScanbodyLibrary, type ScanbodyLibraryRow } from "@/shared/practice/scanbodyLibraryApi";

const DISMISS_KEY = (id: string) => `scanbody-update-later:${id}`;

function dismissedVersion(id: string) {
  try {
    return window.localStorage.getItem(DISMISS_KEY(id));
  } catch {
    return null;
  }
}

export function ScanbodyLibraryUpdatePrompt({
  libraries,
  onUpdated,
  overlayClassName,
  className,
}: {
  libraries: readonly ScanbodyLibraryRow[];
  onUpdated: (row: ScanbodyLibraryRow) => void;
  /** AI 디자인처럼 높은 모달 위에 띄울 때. */
  overlayClassName?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const target = useMemo(
    () =>
      libraries.find(
        (lib) =>
          lib.forkBehind &&
          lib.canEdit &&
          !skipped.has(lib.id) &&
          dismissedVersion(lib.id) !== String(lib.baseContentUpdatedAt ?? ""),
      ) ?? null,
    [libraries, skipped],
  );

  const later = () => {
    if (!target) return;
    try {
      window.localStorage.setItem(DISMISS_KEY(target.id), String(target.baseContentUpdatedAt ?? ""));
    } catch {
      // 저장소를 못 쓰면 이번 화면에서만 묻지 않는다.
    }
    setSkipped((prev) => new Set(prev).add(target.id));
  };

  const update = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const row = await rebaseScanbodyLibrary(target.id);
      onUpdated(row);
      toast({ title: `${target.systemName} 라이브러리를 업데이트했습니다.` });
      setSkipped((prev) => new Set(prev).add(target.id));
    } catch (error) {
      toast({
        title: "라이브러리를 업데이트하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => (!open ? later() : undefined)}>
      <AlertDialogContent overlayClassName={overlayClassName} className={className}>
        <AlertDialogHeader>
          <AlertDialogTitle>스캔바디 라이브러리 새 버전</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.systemName} 라이브러리 새 버전이 공용에 올라왔습니다.
            <br />
            우리 기공소 사본을 업데이트할까요?
            <br />
            고쳐 둔 임플란트 연결과 우리만 올린 키트는 그대로 둡니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>나중에</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void update()}>
            {busy ? "업데이트 중…" : "업데이트"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
