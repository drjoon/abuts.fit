// related files:
// - web/frontend/src/pages/admin/support/AdminRemoteSupportPage.tsx
// - web/frontend/src/features/remoteSupport/replayRemoteInput.ts
// - web/frontend/src/features/remoteSupport/videoContentRect.ts
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
      margin: 0; height: 100%; overflow: hidden;
      background: #000; color: #e5e5e5;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    #chrome {
      position: fixed; inset: 0 0 auto 0; z-index: 2;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 8px 12px; background: rgba(10,10,10,.78); backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px;
      transition: opacity .15s ease, transform .15s ease;
    }
    #chrome strong { font-weight: 600; }
    #chrome .muted { opacity: .7; }
    #chrome .actions { display: flex; gap: 8px; align-items: center; }
    #chrome button {
      appearance: none; border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.08); color: #fff; border-radius: 6px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
    }
    #chrome button:hover { background: rgba(255,255,255,.16); }
    #stage {
      position: fixed; inset: 0; display: grid; place-items: center;
      outline: none; background: #000;
    }
    :fullscreen #chrome, :-webkit-full-screen #chrome {
      opacity: 0; pointer-events: none; transform: translateY(-8px);
    }
    :fullscreen body:hover #chrome, :-webkit-full-screen body:hover #chrome {
      opacity: 1; pointer-events: auto; transform: none;
    }
    video {
      display: block; max-width: 100%; max-height: 100%;
      width: auto; height: auto; background: #000; cursor: crosshair;
      /* Element is sized to the stream aspect — no letterbox inside the tag */
      object-fit: fill;
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
      <span id="sub" class="muted"> · ${safeSubtitle}</span>
    </div>
    <div class="actions">
      <span class="muted">클릭·키보드로 조작</span>
      <button type="button" id="btnFit" title="전체 내용 보기 / 모니터에 채우기">화면에 채우기</button>
      <button type="button" id="btnFs" title="이 화면을 모니터 전체에 표시">전체 화면</button>
    </div>
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
      var btnFs = document.getElementById("btnFs");
      var btnFit = document.getElementById("btnFit");
      var fillMode = false; // false=contain(전체 내용), true=cover(모니터 채움·가장자리 잘릴 수 있음)

      function post(msg) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(Object.assign({ source: SOURCE }, msg), window.location.origin);
          }
        } catch (e) {}
      }

      // Size the <video> box to the stream aspect so pointer coords map 1:1.
      // contain: 전체 내용 표시(여백 가능). cover: 모니터 채움(가장자리 잘림 가능).
      function layoutVideo() {
        var vw = video.videoWidth;
        var vh = video.videoHeight;
        if (!vw || !vh) return;
        var sw = stage.clientWidth;
        var sh = stage.clientHeight;
        if (sw <= 0 || sh <= 0) return;
        var scale = fillMode
          ? Math.max(sw / vw, sh / vh)
          : Math.min(sw / vw, sh / vh);
        video.style.width = Math.max(1, Math.floor(vw * scale)) + "px";
        video.style.height = Math.max(1, Math.floor(vh * scale)) + "px";
        stage.style.overflow = fillMode ? "hidden" : "hidden";
      }

      function visibleContentRect() {
        var rect = video.getBoundingClientRect();
        var sw = stage.clientWidth;
        var sh = stage.clientHeight;
        var stageRect = stage.getBoundingClientRect();
        // Intersection of video box with stage (cover crops overflow).
        var left = Math.max(rect.left, stageRect.left);
        var top = Math.max(rect.top, stageRect.top);
        var right = Math.min(rect.right, stageRect.left + sw);
        var bottom = Math.min(rect.bottom, stageRect.top + sh);
        var width = right - left;
        var height = bottom - top;
        if (width <= 0 || height <= 0) return null;
        return { left: left, top: top, width: width, height: height, videoRect: rect };
      }

      function normPointer(e, kind) {
        var box = visibleContentRect();
        if (!box) return null;
        // Map click on visible pixels back to full video (0..1 of stream).
        var vx = (e.clientX - box.videoRect.left) / box.videoRect.width;
        var vy = (e.clientY - box.videoRect.top) / box.videoRect.height;
        if (vx < 0 || vx > 1 || vy < 0 || vy > 1) return null;
        return {
          t: "pointer",
          kind: kind,
          x: vx,
          y: vy,
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
      video.addEventListener("loadedmetadata", layoutVideo);
      video.addEventListener("resize", layoutVideo);
      window.addEventListener("resize", layoutVideo);
      document.addEventListener("fullscreenchange", layoutVideo);
      document.addEventListener("webkitfullscreenchange", layoutVideo);
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(layoutVideo).observe(stage);
      }

      function onKey(kind) {
        return function (e) {
          if (e.key === "Escape" && !document.fullscreenElement) {
            stage.blur();
            return;
          }
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

      function toggleFs() {
        var root = document.documentElement;
        var fs = document.fullscreenElement || document.webkitFullscreenElement;
        if (fs) {
          var exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) exit.call(document);
          btnFs.textContent = "전체 화면";
          return;
        }
        var req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (req) {
          Promise.resolve(req.call(root)).then(function () {
            btnFs.textContent = "전체 화면 종료";
            layoutVideo();
            stage.focus();
          }).catch(function () {});
        }
      }
      btnFs.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFs();
      });
      btnFit.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        fillMode = !fillMode;
        btnFit.textContent = fillMode ? "전체 내용 보기" : "화면에 채우기";
        layoutVideo();
      });

      window.addEventListener("beforeunload", function () {
        post({ type: "closed" });
      });
      window.__abutsSetStream = function (stream) {
        video.srcObject = stream || null;
        if (stream) empty.classList.add("hidden");
        else empty.classList.remove("hidden");
        try { video.play(); } catch (e) {}
        // metadata may already be ready when reusing a track
        setTimeout(layoutVideo, 0);
        setTimeout(layoutVideo, 100);
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
  // Open nearly full on the target monitor so the stream can scale large.
  const width = Math.floor(availW);
  const height = Math.floor(availH);
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
