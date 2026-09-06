// related files:
// - web/frontend/src/pages/admin/support/AdminRemoteSupportPage.tsx
// - web/frontend/src/features/remoteSupport/replayRemoteInput.ts
import type { RemoteControlEvent } from "@/features/remoteSupport/replayRemoteInput";

const VIEWER_NAME = "abuts-remote-support-viewer";
const MSG_SOURCE = "abuts-remote-support-viewer";

export type RemoteSupportViewerHandle = {
  focus: () => void;
  close: () => void;
  setStream: (stream: MediaStream | null) => void;
  isOpen: () => boolean;
};

type OpenOptions = {
  title?: string;
  subtitle?: string;
  onControl: (evt: RemoteControlEvent) => void;
  onClose: () => void;
};

type ViewerInboundMessage =
  | { source: typeof MSG_SOURCE; type: "control"; event: RemoteControlEvent }
  | { source: typeof MSG_SOURCE; type: "closed" }
  | { source: typeof MSG_SOURCE; type: "ready" };

function buildViewerHtml(title: string, subtitle: string) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; height: 100%; background: #0a0a0a; color: #e5e5e5;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    #chrome {
      position: fixed; inset: 0 0 auto 0; z-index: 2;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 14px; background: rgba(10,10,10,.72); backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px;
    }
    #chrome strong { font-weight: 600; }
    #chrome span { opacity: .7; }
    #stage {
      position: fixed; inset: 0; display: grid; place-items: center;
      outline: none; background: #000;
    }
    video {
      width: 100%; height: 100%; object-fit: contain; cursor: crosshair;
      background: #000;
    }
    #empty {
      position: absolute; inset: 0; display: grid; place-items: center;
      text-align: center; color: #a3a3a3; font-size: 14px; padding: 24px;
    }
    #empty.hidden { display: none; }
  </style>
</head>
<body>
  <div id="chrome">
    <div>
      <strong>${safeTitle}</strong>
      <span id="sub"> · ${safeSubtitle}</span>
    </div>
    <span>이 창에서 클릭·키보드로 조작 · Esc로 포커스 해제</span>
  </div>
  <div id="stage" tabindex="0">
    <video id="v" autoplay playsinline muted></video>
    <div id="empty">직원 화면을 기다리는 중…</div>
  </div>
  <script>
    (function () {
      var SOURCE = ${JSON.stringify(MSG_SOURCE)};
      var stage = document.getElementById("stage");
      var video = document.getElementById("v");
      var empty = document.getElementById("empty");
      function post(msg) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(Object.assign({ source: SOURCE }, msg), window.location.origin);
          }
        } catch (e) {}
      }
      function normPointer(e, kind) {
        var rect = video.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
          t: "pointer",
          kind: kind,
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
          button: e.button
        };
      }
      function onPointer(kind) {
        return function (e) {
          var evt = normPointer(e, kind);
          if (!evt) return;
          if (kind !== "move") e.preventDefault();
          post({ type: "control", event: evt });
        };
      }
      video.addEventListener("mousemove", onPointer("move"));
      video.addEventListener("mousedown", onPointer("down"));
      video.addEventListener("mouseup", onPointer("up"));
      video.addEventListener("click", onPointer("click"));
      video.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      function onKey(kind) {
        return function (e) {
          if (e.key === "Escape") { stage.blur(); return; }
          e.preventDefault();
          post({
            type: "control",
            event: {
              t: "key",
              kind: kind,
              key: e.key,
              code: e.code,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey,
              shiftKey: e.shiftKey,
              metaKey: e.metaKey
            }
          });
        };
      }
      stage.addEventListener("keydown", onKey("down"));
      stage.addEventListener("keyup", onKey("up"));
      window.addEventListener("beforeunload", function () {
        post({ type: "closed" });
      });
      window.__abutsSetStream = function (stream) {
        video.srcObject = stream || null;
        if (stream) empty.classList.add("hidden");
        else empty.classList.remove("hidden");
        try { video.play(); } catch (e) {}
      };
      window.__abutsSetSubtitle = function (text) {
        var el = document.getElementById("sub");
        if (el) el.textContent = text ? (" · " + text) : "";
      };
      stage.focus();
      post({ type: "ready" });
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupFeatures() {
  const availW =
    typeof screen !== "undefined" ? Math.max(1024, screen.availWidth || 1280) : 1280;
  const availH =
    typeof screen !== "undefined" ? Math.max(720, screen.availHeight || 800) : 800;
  const width = Math.floor(availW * 0.96);
  const height = Math.floor(availH * 0.96);
  // Prefer opening to the right of the admin window (often lands on the 2nd monitor).
  const left = Math.floor((window.screenX || 0) + (window.outerWidth || width));
  const top = Math.floor(window.screenY || 0);
  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");
}

export function openRemoteSupportViewer(
  options: OpenOptions,
): RemoteSupportViewerHandle | null {
  if (typeof window === "undefined") return null;

  const title = options.title || "원격 지원 화면";
  const subtitle = options.subtitle || "직원 화면";

  // Keep opener reference (do not use noopener) so we can attach the MediaStream.
  const win = window.open("", VIEWER_NAME, popupFeatures());
  if (!win) return null;

  try {
    win.document.open();
    win.document.write(buildViewerHtml(title, subtitle));
    win.document.close();
  } catch {
    try {
      win.close();
    } catch {
      // ignore
    }
    return null;
  }

  let closedNotified = false;
  let stream: MediaStream | null = null;

  const applyStream = () => {
    const setter = (
      win as Window & {
        __abutsSetStream?: (s: MediaStream | null) => void;
      }
    ).__abutsSetStream;
    if (typeof setter === "function") setter(stream);
  };

  const onMessage = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin) return;
    const data = ev.data as ViewerInboundMessage | null;
    if (!data || data.source !== MSG_SOURCE) return;
    if (data.type === "ready") {
      applyStream();
      return;
    }
    if (data.type === "control" && data.event) {
      options.onControl(data.event);
      return;
    }
    if (data.type === "closed") {
      if (closedNotified) return;
      closedNotified = true;
      window.removeEventListener("message", onMessage);
      options.onClose();
    }
  };

  window.addEventListener("message", onMessage);

  const poll = window.setInterval(() => {
    if (!win.closed) return;
    window.clearInterval(poll);
    if (closedNotified) return;
    closedNotified = true;
    window.removeEventListener("message", onMessage);
    options.onClose();
  }, 500);

  const handle: RemoteSupportViewerHandle = {
    focus: () => {
      try {
        win.focus();
      } catch {
        // ignore
      }
    },
    close: () => {
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
      if (!win.closed) {
        try {
          win.close();
        } catch {
          // ignore
        }
      }
      if (!closedNotified) {
        closedNotified = true;
        options.onClose();
      }
    },
    setStream: (next) => {
      stream = next;
      applyStream();
    },
    isOpen: () => !win.closed,
  };

  return handle;
}
