// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferShare.controller.js
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/share/PracticeTransferShareDialog.tsx
// - web/frontend/src/App.tsx
// - 2026-09-28: 플랫폼 내 케이스 3D 화면(/cases/:transferKey) — 치과·원청·협력·하청 참여자 전용.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Loader2, Share2 } from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { Button } from "@/components/ui/button";
import { request } from "@/shared/api/apiClient";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  CaseShareViewer,
  type CaseShareFileLoader,
} from "@/shared/share/CaseShareViewer";
import { PracticeTransferShareDialog } from "@/shared/share/PracticeTransferShareDialog";
import type { CaseShareView } from "@/shared/share/caseShareTypes";
import { useAuthStore } from "@/store/useAuthStore";

type PageState =
  | { status: "loading" }
  | { status: "ready"; view: CaseShareView }
  | { status: "error"; message: string };

export default function PracticeTransferCaseViewPage() {
  const { transferKey = "" } = useParams<{ transferKey: string }>();
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!token || !transferKey) return;
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const res = await request<{ data?: CaseShareView; message?: string }>({
        path: `/api/practice/transfers/${encodeURIComponent(transferKey)}/case-view`,
        token,
        skipCache: true,
      });
      if (cancelled) return;
      if (res.ok && res.data?.data) {
        setState({ status: "ready", view: res.data.data });
        return;
      }
      setState({
        status: "error",
        message: String(res.data?.message || "케이스를 불러오지 못했습니다."),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, transferKey]);

  const loadFile = useCallback<CaseShareFileLoader>(
    (file, onProgress) => {
      if (!token || !file.s3Key) {
        return Promise.reject(new Error("파일을 불러올 수 없습니다."));
      }
      return fetchS3BlobCached({
        s3Key: file.s3Key,
        fileName: file.fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        onProgress,
      });
    },
    [token],
  );

  if (state.status === "loading") {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        케이스를 불러오는 중…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <AbutsLogo
          variant="light"
          iconClassName="h-9 w-9"
          wordmarkClassName="text-lg"
        />
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  const shareKey = state.view.transferMongoId || transferKey;
  return (
    <>
      <CaseShareViewer
        view={state.view}
        loadFile={loadFile}
        headerActions={
          <>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                어벗츠로 이동
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5" />
              공유
            </Button>
          </>
        }
        footer="이 의뢰에 참여한 치과·기공소만 보는 화면입니다."
      />
      <PracticeTransferShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        transferKey={shareKey}
        initialView={state.view}
        hideOpenViewer
      />
    </>
  );
}
