// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/backend/controllers/events/eventVisit.controller.js
import { useEffect } from "react";

type VisitType = "enter" | "progress" | "leave";

const VISITOR_KEY = "abuts.eventVisitor";

function uuid() {
  return crypto.randomUUID();
}

function readStorage(key: string) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    // 저장을 막은 브라우저에서는 이번 페이지만 센다.
  }
}

export function readEventVisitSessionId(slug: string) {
  const clean = String(slug || "")
    .trim()
    .toLowerCase();
  if (!clean) return "";
  const key = `abuts.eventVisit.${clean}`;
  const existing = readStorage(key);
  if (existing) return existing;
  const next = uuid();
  try {
    writeStorage(sessionStorage, key, next);
  } catch {
    return next;
  }
  return next;
}

function visitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY) || "";
    if (existing) return existing;
    const next = uuid();
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const token = localStorage.getItem("abuts_auth_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // 토큰 없이 남긴다.
  }
  return headers;
}

/**
 * 공개 이벤트 신청 페이지.
 * 같은 탭은 세션 하나. 진입·신청 구간·입력·이탈만 보내고, 중간 핑은 보내지 않는다.
 */
export function useEventPageVisit(slug: string) {
  useEffect(() => {
    const clean = String(slug || "")
      .trim()
      .toLowerCase();
    if (!clean) return;

    const sessionId = readEventVisitSessionId(clean);
    const visitor = visitorId();
    const seenKey = `abuts.eventVisit.seen.${clean}`;
    let returning = false;
    try {
      returning = localStorage.getItem(seenKey) === "1";
      localStorage.setItem(seenKey, "1");
    } catch {
      returning = false;
    }

    const started = performance.now();
    let scrollMax = 0;
    let reachedApply = false;
    let formStarted = false;
    let stopped = false;
    let lastSentDwell = 0;
    let lastSentScroll = 0;

    const measureScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100);
      if (pct > scrollMax) scrollMax = Math.min(100, Math.max(0, pct));
    };

    const payload = (type: VisitType) => {
      const params = new URLSearchParams(window.location.search);
      return {
        sessionId,
        visitorId: visitor,
        type,
        returning,
        dwellMs: Math.round(performance.now() - started),
        scrollPct: scrollMax,
        referrer: document.referrer || "",
        lang: navigator.language || "",
        utmSource: params.get("utm_source") || "",
        utmMedium: params.get("utm_medium") || "",
        utmCampaign: params.get("utm_campaign") || "",
        reachedApply,
        formStarted,
      };
    };

    const send = (type: VisitType) => {
      if (stopped && type !== "leave") return;
      const body = payload(type);
      lastSentDwell = body.dwellMs;
      lastSentScroll = scrollMax;
      const url = `/api/events/${encodeURIComponent(clean)}/visits`;
      void fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    };

    measureScroll();
    send("enter");

    const onScroll = () => measureScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let applyObserver: IntersectionObserver | null = null;
    const watchApply = () => {
      if (reachedApply || applyObserver) return;
      const el = document.getElementById("event-apply");
      if (!el) return;
      applyObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          reachedApply = true;
          applyObserver?.disconnect();
          applyObserver = null;
          send("progress");
        },
        { threshold: 0.35 },
      );
      applyObserver.observe(el);
    };
    watchApply();
    const formObserver = new MutationObserver(() => watchApply());
    formObserver.observe(document.body, { childList: true, subtree: true });

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest("#event-apply")) return;
      if (!target.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      formStarted = true;
      reachedApply = true;
      document.removeEventListener("focusin", onFocus);
      send("progress");
    };
    document.addEventListener("focusin", onFocus);

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      measureScroll();
      const dwell = Math.round(performance.now() - started);
      if (dwell - lastSentDwell < 45_000 && scrollMax - lastSentScroll < 25) return;
      send("progress");
    }, 60_000);

    const onPageHide = () => {
      measureScroll();
      send("leave");
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("focusin", onFocus);
      formObserver.disconnect();
      applyObserver?.disconnect();
      measureScroll();
      send("leave");
    };
  }, [slug]);
}
