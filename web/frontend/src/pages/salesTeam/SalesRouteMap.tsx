// related files:
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/ui/cn";

export type RouteMapStop = {
  name: string;
  address?: string;
  lat: number | null;
  lng: number | null;
  isStart?: boolean;
  isExtra?: boolean;
};

type KakaoLatLng = { getLat: () => number; getLng: () => number };
type KakaoMap = {
  setBounds: (bounds: KakaoLatLngBounds) => void;
  setCenter: (latlng: KakaoLatLng) => void;
  setLevel: (level: number) => void;
  relayout?: () => void;
};
type KakaoLatLngBounds = {
  extend: (latlng: KakaoLatLng) => void;
};
type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMap;
  LatLngBounds: new () => KakaoLatLngBounds;
  Marker: new (options: {
    position: KakaoLatLng;
    map: KakaoMap;
  }) => { setMap: (map: KakaoMap | null) => void };
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement | string;
    yAnchor?: number;
    xAnchor?: number;
  }) => { setMap: (map: KakaoMap | null) => void };
  Polyline: new (options: {
    path: KakaoLatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    map: KakaoMap;
  }) => { setMap: (map: KakaoMap | null) => void };
  event: { addListener: (target: KakaoMap, type: string, handler: () => void) => void };
  load?: (callback: () => void) => void;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

const KAKAO_SDK_HOST = "https://dapi.kakao.com/v2/maps/sdk.js";

let kakaoMapsPromise: Promise<KakaoMaps> | null = null;

function getKakaoAppKey() {
  return String(import.meta.env.VITE_KAKAO_MAP_APP_KEY || "").trim();
}

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window unavailable"));
  }
  if (window.kakao?.maps?.LatLng) {
    return Promise.resolve(window.kakao.maps);
  }
  if (kakaoMapsPromise) return kakaoMapsPromise;

  const appKey = getKakaoAppKey();
  if (!appKey) {
    return Promise.reject(new Error("missing_key"));
  }

  kakaoMapsPromise = new Promise<KakaoMaps>((resolve, reject) => {
    const finish = (err?: Error) => {
      if (err) {
        kakaoMapsPromise = null;
        reject(err);
        return;
      }
      const maps = window.kakao?.maps;
      if (!maps) {
        kakaoMapsPromise = null;
        reject(new Error("kakao maps missing"));
        return;
      }
      if (typeof maps.load === "function") {
        maps.load(() => {
          if (!window.kakao?.maps?.LatLng) {
            kakaoMapsPromise = null;
            reject(new Error("kakao maps load incomplete"));
            return;
          }
          resolve(window.kakao.maps);
        });
      } else if (maps.LatLng) {
        resolve(maps);
      } else {
        kakaoMapsPromise = null;
        reject(new Error("kakao maps not ready"));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-abuts-kakao-maps="1"]`,
    );

    if (existing) {
      if (window.kakao?.maps) finish();
      else {
        existing.addEventListener("load", () => finish());
        existing.addEventListener("error", () =>
          finish(new Error("script_load_failed")),
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `${KAKAO_SDK_HOST}?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.dataset.abutsKakaoMaps = "1";
    script.onload = () => finish();
    script.onerror = () => finish(new Error("script_load_failed"));
    document.head.appendChild(script);
  });

  return kakaoMapsPromise;
}

function makeLabelContent(label: string, isStart: boolean) {
  const el = document.createElement("div");
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "min-width:1.5rem",
    "height:1.5rem",
    "padding:0 0.35rem",
    "border-radius:999px",
    isStart ? "background:#0f172a" : "background:#2563eb",
    "color:#fff",
    "font-size:11px",
    "font-weight:700",
    "box-shadow:0 1px 3px rgba(15,23,42,0.35)",
    "transform:translateY(-4px)",
  ].join(";");
  el.textContent = label;
  return el;
}

/** Kakao JS SDK 실패 시 OSM 임베드 (키/도메인 무관). */
function OsmFallbackMap({ stops }: { stops: RouteMapStop[] }) {
  const pts = stops.filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng),
  ) as Array<RouteMapStop & { lat: number; lng: number }>;
  if (!pts.length) return null;

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const pad = 0.02;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const marker = pts[0];
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${marker.lat}%2C${marker.lng}`;

  return (
    <>
      <iframe
        title="동선 지도"
        src={src}
        className="h-52 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:h-64"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="text-[11px] text-muted-foreground">
        카카오 지도 SDK를 쓸 수 없어 대체 지도를 표시합니다. (카카오 개발자
        콘솔 → JavaScript 키에 localhost 도메인 등록을 확인하세요)
      </p>
    </>
  );
}

type SalesRouteMapProps = {
  stops: RouteMapStop[];
  className?: string;
};

export default function SalesRouteMap({ stops, className }: SalesRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"kakao" | "osm">("kakao");

  const plottable = stops.filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng),
  );
  const plotKey = plottable
    .map(
      (s) =>
        `${s.lat},${s.lng},${s.name},${s.isStart ? "S" : ""},${s.isExtra ? "E" : ""}`,
    )
    .join("|");

  useEffect(() => {
    setMode("kakao");
    setError(null);
  }, [plotKey]);

  useEffect(() => {
    if (mode !== "kakao") return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    async function draw() {
      if (!containerRef.current) return;
      if (plottable.length === 0) {
        setError(null);
        return;
      }
      try {
        const maps = await loadKakaoMaps();
        if (cancelled || !containerRef.current) return;
        await waitFrames(2);
        if (cancelled || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) {
          throw new Error("map_container_too_small");
        }

        setError(null);
        containerRef.current.innerHTML = "";

        const center = new maps.LatLng(plottable[0].lat!, plottable[0].lng!);
        const map = new maps.Map(containerRef.current, {
          center,
          level: 7,
        });

        const bounds = new maps.LatLngBounds();
        const path: KakaoLatLng[] = [];
        let visitNumber = 0;

        plottable.forEach((stop) => {
          const latlng = new maps.LatLng(stop.lat!, stop.lng!);
          bounds.extend(latlng);
          path.push(latlng);

          const marker = new maps.Marker({ position: latlng, map });
          cleanups.push(() => marker.setMap(null));

          const label = stop.isStart ? "출" : String((visitNumber += 1));
          const overlay = new maps.CustomOverlay({
            position: latlng,
            content: makeLabelContent(label, Boolean(stop.isStart)),
            yAnchor: 1.6,
            xAnchor: 0.5,
          });
          overlay.setMap(map);
          cleanups.push(() => overlay.setMap(null));
        });

        if (path.length >= 2) {
          const line = new maps.Polyline({
            path,
            strokeWeight: 4,
            strokeColor: "#2563eb",
            strokeOpacity: 0.85,
            strokeStyle: "solid",
            map,
          });
          cleanups.push(() => line.setMap(null));
        }

        if (plottable.length === 1) {
          map.setCenter(center);
          map.setLevel(5);
        } else {
          map.setBounds(bounds);
        }
        map.relayout?.();
        window.setTimeout(() => {
          if (!cancelled) map.relayout?.();
        }, 120);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "map_error";
        console.warn("[SalesRouteMap]", msg, e);
        if (msg === "missing_key") {
          setError(
            "지도 앱키가 없습니다. VITE_KAKAO_MAP_APP_KEY를 설정하세요.",
          );
        }
        setMode("osm");
      }
    }

    void draw();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
    // plotKey captures stop geometry; plottable is derived from same stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotKey, mode]);

  if (plottable.length === 0) {
    return (
      <div
        className={cn(
          "flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        좌표가 있는 방문지가 있으면 지도에 표시됩니다.
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {mode === "kakao" ? (
        <div
          ref={containerRef}
          className="h-52 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:h-64"
        />
      ) : (
        <OsmFallbackMap stops={plottable} />
      )}
      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
    </div>
  );
}
