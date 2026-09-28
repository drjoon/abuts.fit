// related files:
// - web/backend/modules/caseShares/caseShare.routes.js
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/App.tsx
// - 2026-09-28: 공유 링크(/share/case/:token) — 공개 범위에 따라 비로그인·지정 계정·관계자가 3D 케이스를 본다.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { Button } from "@/components/ui/button";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  CaseShareViewer,
  type CaseShareFileLoader,
} from "@/shared/share/CaseShareViewer";
import {
  caseShareVisibilityLabel,
  type CaseShareView,
} from "@/shared/share/caseShareTypes";
import { useAuthStore } from "@/store/useAuthStore";

type PageState =
  | { status: "loading" }
  | { status: "ready"; view: CaseShareView }
  | { status: "error"; title: string; message: string; reason: string };

async function fetchBlobWithStreamProgress(
  url: string,
  headers: HeadersInit,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) throw new Error("파일을 불러오지 못했습니다.");
  const total = Number(res.headers.get("Content-Length") || 0);
  if (!res.body || !total) {
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(Math.min(99, (received / total) * 100));
    }
  }
  onProgress?.(100);
  return new Blob(chunks, {
    type: res.headers.get("Content-Type") || "application/octet-stream",
  });
}

function errorCopy(status: number, reason: string): { title: string; message: string } {
  if (reason === "expired") {
    return {
      title: "유효 기간이 지난 링크입니다.",
      message: "공유한 분께 새 링크를 요청해 주세요.",
    };
  }
  if (reason === "blocked") {
    return {
      title: "공유가 막힌 링크입니다.",
      message: "공유한 분께 문의해 주세요.",
    };
  }
  if (reason === "removed") {
    return { title: "삭제된 의뢰입니다.", message: "더 이상 볼 수 없는 케이스입니다." };
  }
  if (reason === "login_required") {
    return {
      title: "로그인한 뒤 볼 수 있는 링크입니다.",
      message: "공유한 분이 볼 수 있는 계정을 정해 두었습니다.",
    };
  }
  if (reason === "not_allowed") {
    return {
      title: "이 계정으로는 볼 수 없는 링크입니다.",
      message: "공유한 분이 허용한 계정으로 로그인해 주세요.",
    };
  }
  if (status === 404) {
    return {
      title: "공유 링크를 찾을 수 없습니다.",
      message: "삭제됐거나 주소가 잘못된 링크입니다.",
    };
  }
  return {
    title: "케이스를 불러오지 못했습니다.",
    message: "잠시 후 다시 시도해 주세요.",
  };
}

export default function CaseSharePage() {
  const { token: shareToken = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const userEmail = useAuthStore((s) => s.user?.email || "");
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/case-shares/${encodeURIComponent(shareToken)}`, {
          cache: "no-store",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.data) {
          const reason = String(body?.reason || "");
          setState({ status: "error", reason, ...errorCopy(res.status, reason) });
          return;
        }
        setState({ status: "ready", view: body.data as CaseShareView });
      } catch {
        if (!cancelled) setState({ status: "error", reason: "", ...errorCopy(0, "") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, shareToken]);

  const loadFile = useCallback<CaseShareFileLoader>(
    (file, onProgress) =>
      fetchBlobWithStreamProgress(
        `/api/case-shares/${encodeURIComponent(shareToken)}/files/${encodeURIComponent(file.fileKey)}`,
        authToken ? { Authorization: `Bearer ${authToken}` } : {},
        onProgress,
      ),
    [authToken, shareToken],
  );

  const goLogin = () =>
    navigate(`/login?next=${encodeURIComponent(`/share/case/${shareToken}`)}`);

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
        <AbutsLogo variant="light" iconClassName="h-9 w-9" wordmarkClassName="text-lg" />
        <div>
          <p className="text-base font-semibold">{state.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          {state.reason === "not_allowed" && userEmail ? (
            <p className="mt-1 text-xs text-muted-foreground">지금 계정: {userEmail}</p>
          ) : null}
        </div>
        {state.reason === "login_required" ? (
          <Button type="button" onClick={goLogin}>
            로그인하고 보기
          </Button>
        ) : null}
        {state.reason === "not_allowed" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              logout();
              goLogin();
            }}
          >
            다른 계정으로 로그인
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <CaseShareViewer
      view={state.view}
      loadFile={loadFile}
      footer={
        <>
          {caseShareVisibilityLabel(state.view.visibility)} · 읽기 전용 공유 화면입니다.
          <br />
          {state.view.expiresAt
            ? `${formatKstDateTimeToKo(state.view.expiresAt)}까지 볼 수 있습니다.`
            : null}
        </>
      }
    />
  );
}
