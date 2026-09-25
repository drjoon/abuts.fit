// related files:
// - web/frontend/src/pages/public/OfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/OfferVisual.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Cpu,
  Crown,
  FileText,
  HelpCircle,
  MapPin,
  Play,
  Receipt,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Waypoints,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import {
  landingContent,
  landingHome,
  landingSectionY,
  landingSky,
  landingTypo,
} from "./landingTheme";
import { LANDING_HERO_POSTER, LANDING_HERO_VIDEO } from "./landingAssets";
import { LandingScrollCue } from "./LandingScrollCue";
import { OfferVisual } from "./OfferVisual";
import {
  type LandingOffer,
  type SpecSwatch,
  type OfferBuy,
  type OfferGlance,
  type OfferGlossary,
  type OfferIcon,
  type OfferVisual as OfferVisualModel,
} from "./landingOffers";

const TYPO = landingTypo;
const SKY = landingSky;

function DiameterDots({ swatches }: { swatches: SpecSwatch[] }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
      {swatches.map((swatch) => (
        <span
          key={swatch.name}
          role="img"
          aria-label={swatch.name}
          title={swatch.name}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-full text-[11px] font-bold leading-none ring-1 ring-inset ring-black/15 sm:h-8 sm:text-[12px]",
            swatch.label.length <= 2 ? "w-7 sm:w-8" : "min-w-7 px-1.5 sm:min-w-8 sm:px-2",
          )}
          style={{ backgroundColor: swatch.color, color: swatch.ink }}
        >
          {swatch.label}
        </span>
      ))}
    </span>
  );
}

const ICONS: Record<OfferIcon, typeof FileText> = {
  request: FileText,
  start: Play,
  pay: Receipt,
  ship: Truck,
  store: ShoppingBag,
  scan: ScanLine,
  healing: Sparkles,
  abutment: Box,
  kit: Wrench,
  crown: Crown,
  cnc: Cpu,
  lab: Crown,
  quality: ShieldCheck,
  box: Box,
};

type YtPlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate?: (rate: number) => void;
  getPlaybackRate?: () => number;
  getCurrentTime: () => number;
  getPlayerState?: () => number;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  cueVideoById?: (args: {
    videoId: string;
    startSeconds?: number;
    endSeconds?: number;
  }) => void;
  loadVideoById?: (args: {
    videoId: string;
    startSeconds?: number;
    endSeconds?: number;
  }) => void;
};

type YtNamespace = {
  Player: new (
    element: string | HTMLElement,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { data: number; target: YtPlayer }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState: { ENDED: number; PLAYING: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  return youtubeApiPromise;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function Lines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <p className={cn("break-keep", className)}>
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

function SectionEyebrow({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn(TYPO.eyebrow, SKY.accent, className)}>{children}</p>
  );
}

const GLANCE_ICONS = [HelpCircle, Waypoints, ShieldCheck] as const;

function GlanceSection({ glance }: { glance: OfferGlance }) {
  return (
    <section
      id="after-hero"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>AT A GLANCE</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5 break-keep", SKY.ink)}>
            {glance.title}
          </h2>
          {glance.lead.length ? (
            <Lines lines={glance.lead} className={cn("mt-2.5", TYPO.lead)} />
          ) : null}
        </div>
        <ul
          className={cn(
            "mt-8 grid gap-3 sm:mt-10 lg:gap-4",
            glance.columns === "3-7"
              ? "sm:grid-cols-[3fr_7fr]"
              : "sm:grid-cols-3",
          )}
        >
          {glance.items.map((item, index) => {
            const Icon = GLANCE_ICONS[index] ?? HelpCircle;
            return (
              <li
                key={item.label}
                className={cn(SKY.card, "bg-white px-4 py-5 sm:px-5 sm:py-6")}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    "bg-[#eef6ff] text-[#2563eb]",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className={cn("mt-4 text-[12px] font-semibold", SKY.accent)}>
                  {item.label}
                </p>
                <h3
                  className={cn(
                    "mt-1.5 break-keep text-base font-semibold tracking-tight sm:text-lg",
                    SKY.ink,
                  )}
                >
                  {item.title}
                </h3>
                {Array.isArray(item.body) ? (
                  <Lines lines={item.body} className={cn("mt-2", TYPO.body)} />
                ) : (
                  <p className={cn("mt-2", TYPO.body)}>{item.body}</p>
                )}
              </li>
            );
          })}
        </ul>
        {glance.summary ? (
          <div
            className={cn(
              "mt-4 flex items-start gap-3 rounded-2xl border border-sky-100 bg-white/80 px-4 py-4 sm:mt-5 sm:items-center sm:px-5",
            )}
          >
            <MapPin
              className={cn("mt-0.5 h-4 w-4 shrink-0 sm:mt-0", SKY.accentStrong)}
              aria-hidden
            />
            <p className={cn("text-[14px] font-semibold tracking-tight", SKY.ink)}>
              {glance.summary}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GlossarySection({ glossary }: { glossary: OfferGlossary }) {
  return (
    <section className={cn("bg-white", landingSectionY.bandTight)}>
      <div className={landingContent}>
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>GLOSSARY</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5 break-keep", SKY.ink)}>
            {glossary.title}
          </h2>
          <p className={cn("mt-2.5", TYPO.lead)}>{glossary.lead}</p>
        </div>
        <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {glossary.items.map((item) => (
            <li
              key={item.term}
              className={cn(SKY.card, "px-4 py-5 sm:px-5 sm:py-6")}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    "bg-[#eef6ff] text-[#2563eb]",
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div>
                  <h3
                    className={cn(
                      "break-keep text-[15px] font-semibold tracking-tight sm:text-base",
                      SKY.ink,
                    )}
                  >
                    {item.term}
                  </h3>
                  <p className={cn("mt-1.5", TYPO.body)}>{item.line}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** YouTube 짧은 구간 루프 — 풀블리드 커버 배경. segments면 순서 순환. */
function YoutubeLoopBackground({
  videoId,
  startSec = 0,
  endSec = 16,
  segments,
  poster,
  playbackRate = 1,
  fit = "cover",
  reduced,
}: {
  videoId: string;
  startSec?: number;
  endSec?: number;
  segments?: Array<{ startSec: number; endSec: number }>;
  poster?: string;
  playbackRate?: number;
  /** cover=히어로 크롭 · frame=16:9 박스에 맞춤 */
  fit?: "cover" | "frame";
  reduced: boolean;
}) {
  const hostId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const segmentIndexRef = useRef(0);
  const inClipStreakRef = useRef(0);
  const [ready, setReady] = useState(false);
  const posterSrc =
    poster || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  const clipList =
    segments && segments.length > 0
      ? segments
      : [{ startSec, endSec }];

  const clipKey = clipList.map((c) => `${c.startSec}-${c.endSec}`).join("|");

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let pollId = 0;
    segmentIndexRef.current = 0;
    inClipStreakRef.current = 0;
    setReady(false);
    const clips =
      clipKey.split("|").map((part) => {
        const [s, e] = part.split("-").map(Number);
        return { startSec: s ?? 0, endSec: e ?? 16 };
      });
    const first = clips[0]!;
    const inClip = (t: number, clip: { startSec: number; endSec: number }) =>
      t >= clip.startSec - 0.25 && t < clip.endSec;

    void loadYoutubeApi().then(() => {
      if (cancelled || !window.YT?.Player || !hostRef.current) return;
      const host = hostRef.current;
      host.replaceChildren();
      const mount = document.createElement("div");
      mount.id = `yt-bg-${hostId}`;
      host.appendChild(mount);
      let lastForceSeekAt = 0;

      const ensureMuted = (player: YtPlayer) => {
        player.mute();
        player.setVolume?.(0);
      };

      const ensureRate = (player: YtPlayer) => {
        if (playbackRate === 1) return;
        try {
          if (player.getPlaybackRate?.() !== playbackRate) {
            player.setPlaybackRate?.(playbackRate);
          }
        } catch {
          /* rate list not ready yet */
        }
      };

      const seekClip = (player: YtPlayer, index: number) => {
        inClipStreakRef.current = 0;
        if (!cancelled) setReady(false);
        const clip = clips[index] ?? clips[0]!;
        const start = clip.startSec;
        const end = clip.endSec;
        if (player.loadVideoById) {
          player.loadVideoById({
            videoId,
            startSeconds: start,
            endSeconds: end,
          });
        } else {
          player.seekTo(start, true);
          player.playVideo();
        }
        ensureMuted(player);
        ensureRate(player);
      };

      const player = new window.YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          start: Math.max(0, Math.floor(first.startSec)),
        },
        events: {
          onReady: (e) => {
            ensureMuted(e.target);
            ensureRate(e.target);
            seekClip(e.target, 0);
          },
          onStateChange: (e) => {
            ensureMuted(e.target);
            ensureRate(e.target);
            if (e.data === window.YT?.PlayerState.ENDED) {
              segmentIndexRef.current =
                (segmentIndexRef.current + 1) % clips.length;
              seekClip(e.target, segmentIndexRef.current);
            }
          },
        },
      });
      playerRef.current = player;

      pollId = window.setInterval(() => {
        try {
          ensureMuted(player);
          ensureRate(player);
          const idx = segmentIndexRef.current;
          const clip = clips[idx] ?? clips[0]!;
          const t = player.getCurrentTime();
          if (typeof t !== "number" || Number.isNaN(t)) return;

          if (inClip(t, clip)) {
            inClipStreakRef.current += 1;
            // 시크 직후 잘못된 프레임이 잠깐 잡히지 않도록 연속 확인
            if (inClipStreakRef.current >= 3 && !cancelled) {
              setReady(true);
            }
          } else {
            inClipStreakRef.current = 0;
            if (!cancelled) setReady(false);
            // 시크가 무시되면 Install 등 초반 프레임이 노출됨 → 재시크
            const now = Date.now();
            if (
              (t < clip.startSec - 1.5 || t >= clip.endSec + 1) &&
              now - lastForceSeekAt > 1500
            ) {
              lastForceSeekAt = now;
              seekClip(player, idx);
            }
          }

          if (t >= clip.endSec) {
            segmentIndexRef.current = (idx + 1) % clips.length;
            seekClip(player, segmentIndexRef.current);
          }
        } catch {
          /* player torn down */
        }
      }, 200);
    });

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId, reduced, hostId, clipKey, playbackRate]);

  if (reduced) {
    return (
      <img
        src={posterSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
      {/* 포스터는 항상 깔아 두고, 구간 진입 후에만 영상 표시 */}
      <img
        src={posterSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div
        ref={hostRef}
        className={cn(
          "transition-opacity duration-300 [&_div]:!h-full [&_div]:!w-full [&_iframe]:!h-full [&_iframe]:!w-full",
          fit === "frame"
            ? "absolute inset-0"
            : "absolute left-1/2 top-1/2 aspect-video h-auto w-[max(100vw,177.78vh)] min-h-full min-w-full -translate-x-1/2 -translate-y-1/2",
          ready ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
    </div>
  );
}

/** 소스보다 키우지 않는다. srcs가 둘이면 같은 높이로 한 줄에 둔다. */
function NativeResolutionPhoto({
  srcs,
  alts,
}: {
  srcs: string[];
  alts?: string[];
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Array<HTMLImageElement | null>>([]);
  const [boxes, setBoxes] = useState<Array<{
    width: number;
    height: number;
  }> | null>(null);
  const srcKey = srcs.join("|");

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const imgs = srcs
      .map((_, index) => imgRefs.current[index])
      .filter((img): img is HTMLImageElement => !!img?.naturalWidth);
    if (!frame || imgs.length !== srcs.length) return;
    const dpr = window.devicePixelRatio || 1;
    const gap = Math.max(0, srcs.length - 1) * 40;
    let height = Math.min(320, frame.clientHeight);
    for (const img of imgs) {
      height = Math.min(height, img.naturalHeight / dpr);
    }
    let widths = imgs.map(
      (img) => height * (img.naturalWidth / img.naturalHeight),
    );
    const maxTotal = frame.clientWidth * 0.86;
    const total = widths.reduce((sum, width) => sum + width, 0) + gap;
    if (total > maxTotal && maxTotal > gap) {
      const scale = (maxTotal - gap) / (total - gap);
      height *= scale;
      widths = widths.map((width) => width * scale);
    }
    setBoxes(widths.map((width) => ({ width, height })));
  }, [srcKey, srcs]);

  useLayoutEffect(() => {
    fit();
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 flex items-end justify-center gap-8 bg-white"
    >
      {srcs.map((src, index) => (
        <figure
          key={src}
          className="flex shrink-0 flex-col items-center"
          style={boxes?.[index] ? { width: boxes[index].width } : undefined}
        >
          <img
            ref={(node) => {
              imgRefs.current[index] = node;
            }}
            src={src}
            alt={alts?.[index] ?? ""}
            draggable={false}
            onLoad={fit}
            className="max-w-none"
            style={
              boxes?.[index]
                ? { width: boxes[index].width, height: boxes[index].height }
                : { visibility: "hidden" }
            }
          />
        </figure>
      ))}
    </div>
  );
}

function MediaFrame({
  visual,
  video,
  youtube,
  reduced,
  drift,
  native,
  companionSrc,
  companionAlt,
  className,
}: {
  visual: OfferVisualModel;
  video?: boolean;
  youtube?: LandingOffer["youtube"];
  reduced: boolean;
  drift?: boolean;
  /** 히어로 스틸. 소스보다 키우지 않고 작게 둔다. */
  native?: boolean;
  /** native 스틸 오른쪽 짝 */
  companionSrc?: string;
  companionAlt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        native ? "bg-white" : "bg-[#e8f2ff]",
        className,
      )}
    >
      {youtube && !reduced ? (
        <YoutubeLoopBackground
          videoId={youtube.id}
          startSec={youtube.startSec}
          endSec={youtube.endSec}
          segments={youtube.segments}
          poster={youtube.poster}
          reduced={reduced}
        />
      ) : youtube && reduced ? (
        <img
          src={
            youtube.poster ||
            `https://i.ytimg.com/vi/${youtube.id}/maxresdefault.jpg`
          }
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : video && !reduced ? (
        <video
          className="absolute inset-0 h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          poster={LANDING_HERO_POSTER}
          aria-label="심플웨이 시술 키트 영상"
        >
          <source src={LANDING_HERO_VIDEO} type="video/mp4" />
        </video>
      ) : visual.kind === "photo" && native ? (
        <NativeResolutionPhoto
          srcs={companionSrc ? [visual.src, companionSrc] : [visual.src]}
          alts={
            visual.kind === "photo"
              ? [visual.alt, companionAlt ?? ""]
              : undefined
          }
        />
      ) : (
        <div
          className={cn(
            "absolute inset-0",
            drift && !reduced && "offer-hero-drift",
          )}
        >
          {video && reduced ? (
            <img
              src={LANDING_HERO_POSTER}
              alt=""
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <OfferVisual visual={visual} fill className="h-full min-h-0" />
          )}
        </div>
      )}
    </div>
  );
}

function ProductCards({
  products,
}: {
  products: NonNullable<LandingOffer["products"]>;
}) {
  return (
    <section
      id="products"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={cn(landingContent, "grid gap-4 md:grid-cols-2 sm:gap-5")}>
        {products.map((product) => (
          <article
            key={product.name}
            className={cn("flex flex-col overflow-hidden", SKY.card)}
          >
            <div className="relative min-h-[12.5rem] overflow-hidden bg-[#e8f2ff] sm:min-h-[16rem]">
              <OfferVisual visual={product.visual} fill className="h-full min-h-0" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-sky-500/10 via-transparent to-blue-500/10" />
            </div>
            <div className="flex flex-1 flex-col px-5 py-6 sm:px-7 sm:py-7">
              <h2 className={cn(TYPO.h3, SKY.ink)}>{product.name}</h2>
              <p className={cn("mt-2", TYPO.body)}>{product.line}</p>
              <ul className="mt-5 space-y-2 border-t border-sky-100 pt-5">
                {product.specs.map((spec) => (
                  <li key={spec} className={cn(TYPO.body, "text-slate-700")}>
                    {spec}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoryRows({
  stories,
}: {
  stories: NonNullable<LandingOffer["stories"]>;
}) {
  return (
    <section className={cn("bg-white pb-4 pt-12 sm:pb-5 sm:pt-16")}>
      <div className={landingContent}>
        <div className="flex flex-col gap-10 sm:gap-14">
          {stories.map((story, index) => {
            const full = story.layout === "full";
            if (full) {
              return (
                <article
                  key={story.name}
                  className={cn("overflow-hidden", SKY.card)}
                >
                  {story.visual?.kind === "photo" ? (
                    <div className="bg-white px-3 pt-3 sm:px-5 sm:pt-5">
                      <img
                        src={story.visual.src}
                        alt={story.visual.alt}
                        className="mx-auto h-auto w-full max-w-4xl object-contain"
                      />
                    </div>
                  ) : story.visual ? (
                    <div className="relative overflow-hidden bg-white">
                      <OfferVisual
                        visual={story.visual}
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col justify-center px-5 py-7 sm:px-8 sm:py-9">
                    <SectionEyebrow>
                      {String(index + 1).padStart(2, "0")}
                    </SectionEyebrow>
                    <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>{story.name}</h3>
                    <p
                      className={cn(
                        "mt-1.5 text-[14px] font-medium sm:text-[15px]",
                        SKY.accentStrong,
                      )}
                    >
                      {story.line}
                    </p>
                    {story.body?.length ? (
                      <Lines
                        lines={story.body}
                        className={cn("mt-3", TYPO.body)}
                      />
                    ) : null}
                    {story.points?.length ? (
                      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {story.points.map((point) => (
                          <li key={point} className={TYPO.body}>
                            {point}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            }

            return (
              <article
                key={story.name}
                className={cn(
                  "grid items-center gap-0 overflow-hidden lg:grid-cols-2",
                  SKY.card,
                )}
              >
                {story.visual?.kind === "photo" ? (
                  <div
                    className={cn(
                      "relative flex min-h-[18rem] items-center justify-center overflow-hidden bg-white px-5 py-7 sm:min-h-[20rem] sm:px-8 sm:py-9 lg:min-h-[22rem]",
                      index % 2 === 1 && "lg:order-2",
                    )}
                  >
                    <img
                      src={`${story.visual.src}?v=4`}
                      alt={story.visual.alt}
                      className="h-auto max-h-[17rem] w-full object-contain object-center sm:max-h-[19rem] lg:max-h-[21rem]"
                    />
                  </div>
                ) : story.visual ? (
                  <div
                    className={cn(
                      "relative min-h-[12.5rem] overflow-hidden bg-white sm:min-h-[16rem] lg:min-h-[18rem]",
                      index % 2 === 1 && "lg:order-2",
                    )}
                  >
                    <OfferVisual
                      visual={story.visual}
                      fill
                      className="h-full min-h-0 object-contain"
                    />
                  </div>
                ) : null}
                <div
                  className={cn(
                    "flex flex-col justify-center px-5 py-5 sm:px-8 sm:py-7",
                    !story.visual && "lg:col-span-2",
                  )}
                >
                  <SectionEyebrow>
                    {String(index + 1).padStart(2, "0")}
                  </SectionEyebrow>
                  <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>{story.name}</h3>
                  <p
                    className={cn(
                      "mt-1.5 text-[14px] font-medium sm:text-[15px]",
                      SKY.accentStrong,
                    )}
                  >
                    {story.line}
                  </p>
                  {story.body?.length ? (
                    <Lines
                      lines={story.body}
                      className={cn("mt-3", TYPO.body)}
                    />
                  ) : null}
                  {story.points?.length ? (
                    <ul className="mt-4 space-y-1.5">
                      {story.points.map((point) => (
                        <li key={point} className={TYPO.body}>
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FlowChartSection({ chart }: { chart: NonNullable<LandingOffer["flowChart"]> }) {
  const [expanded, setExpanded] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);
  const pinViewportTopRef = useRef<number | null>(null);
  const fullChartSrc = "/landing/simpleway/catalog-flow-chart.png?v=10";
  const collapsedRows = chart.rows.filter((row) => row.id === chart.defaultRowId);

  const restoreScrollPin = () => {
    const pin = pinViewportTopRef.current;
    const el = mediaRef.current;
    if (pin == null || !el) return;
    const topAfter = el.getBoundingClientRect().top;
    const delta = topAfter - pin;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    }
  };

  useLayoutEffect(() => {
    if (pinViewportTopRef.current == null || !mediaRef.current) return;

    restoreScrollPin();

    const el = mediaRef.current;
    const imgs = [...el.querySelectorAll("img")];
    const onImg = () => restoreScrollPin();
    for (const img of imgs) {
      if (!img.complete) {
        img.addEventListener("load", onImg);
        img.addEventListener("error", onImg);
      }
    }

    const ro = new ResizeObserver(() => {
      restoreScrollPin();
    });
    ro.observe(el);

    // 이미지·레이아웃이 안정될 때까지 보정 후 핀 해제
    let frames = 0;
    let rafId = 0;
    const tick = () => {
      restoreScrollPin();
      frames += 1;
      if (frames < 8) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      pinViewportTopRef.current = null;
      ro.disconnect();
      for (const img of imgs) {
        img.removeEventListener("load", onImg);
        img.removeEventListener("error", onImg);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    const releaseId = window.setTimeout(() => {
      restoreScrollPin();
      pinViewportTopRef.current = null;
      ro.disconnect();
      for (const img of imgs) {
        img.removeEventListener("load", onImg);
        img.removeEventListener("error", onImg);
      }
    }, 500);

    return () => {
      window.clearTimeout(releaseId);
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      for (const img of imgs) {
        img.removeEventListener("load", onImg);
        img.removeEventListener("error", onImg);
      }
    };
  }, [expanded]);

  // 펼침/접힘 시 높이 깜빡임 줄이려고 양쪽 이미지 미리 로드
  useEffect(() => {
    const urls = [
      fullChartSrc,
      ...chart.rows.map((row) => `${row.src}?v=10`),
    ];
    for (const src of urls) {
      const img = new Image();
      img.src = src;
    }
  }, [chart.rows, fullChartSrc]);

  const toggleExpanded = () => {
    pinViewportTopRef.current = mediaRef.current?.getBoundingClientRect().top ?? 0;
    setExpanded((v) => !v);
  };

  /** 마우스 클릭 시 포커스 자체를 막아 큰 컨트롤 scrollIntoView 점프 방지 */
  const suppressFocusScroll = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  };

  return (
    <section className={cn(SKY.band, landingSectionY.bandTight, "[overflow-anchor:none]")}>
      <div className={landingContent}>
        <article className="[overflow-anchor:none]">
          <div className="px-5 pt-8 sm:px-8 sm:pt-10">
            <p className={cn("text-center text-[12px] font-semibold", SKY.accent)}>
              FLOW CHART
            </p>
            {chart.body.length ? (
              <Lines
                lines={chart.body}
                className={cn("mx-auto mt-3 text-center", TYPO.h2, SKY.ink)}
              />
            ) : null}
            <div
              ref={mediaRef}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? "접어서 노랑(6) 라인만 보기"
                  : "클릭하면 직경 6·7·8·9·10 전체 표시"
              }
              className="mt-4 cursor-pointer rounded-xl bg-white px-2 py-3 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 sm:px-3 sm:py-4 [overflow-anchor:none]"
              onMouseDown={suppressFocusScroll}
              onClick={toggleExpanded}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleExpanded();
                }
              }}
            >
              {/* 양쪽 이미지를 항상 마운트해 디코드·높이 측정 지연을 줄임 */}
              <img
                src={fullChartSrc}
                alt="Flow Chart 직경 10·9·8·7·6 전체"
                className={cn(
                  "block h-auto w-full object-contain",
                  !expanded && "hidden",
                )}
              />
              <div className={cn("flex flex-col gap-1", expanded && "hidden")}>
                {collapsedRows.map((row) => (
                  <img
                    key={row.id}
                    src={`${row.src}?v=10`}
                    alt={row.alt}
                    className="block h-auto w-full object-contain"
                  />
                ))}
              </div>
            </div>
            <p className={cn("mt-2.5 text-center text-[13px]", SKY.accent)}>
              {expanded
                ? "접어서 노랑(6) 라인만 보기"
                : "클릭하면 직경 6·7·8·9·10 전체 표시"}
            </p>
            <p className="mt-1.5 break-keep pb-5 text-center text-[12px] font-normal leading-snug text-slate-500 sm:pb-6">
              위 숫자는 제품의 실직경이 아니라
              <br />
              최종 보철의 근원심경을 의미합니다.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

/** 소개 영상 — 1:32~2:11 구간을 무음·배속으로 반복. */
function KitsColor({
  clip,
  reduced,
}: {
  clip: NonNullable<LandingOffer["kitsClip"]>;
  reduced: boolean;
}) {
  return (
    <section className={cn("bg-white", landingSectionY.bandTight)}>
      <div className={landingContent}>
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>{clip.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{clip.heading}</h2>
        </div>
        <div
          className={cn(
            "relative mt-8 aspect-video overflow-hidden sm:mt-10",
            SKY.card,
          )}
        >
          <YoutubeLoopBackground
            videoId={clip.id}
            startSec={clip.startSec}
            endSec={clip.endSec}
            playbackRate={clip.playbackRate}
            fit="frame"
            reduced={reduced}
          />
        </div>
      </div>
    </section>
  );
}

/** `/offer/*` — `/` Waveon 톤(타이포·하늘색·여백)과 동일 */
export function LandingOfferPage({ offer }: { offer: LandingOffer }) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const reduced = usePrefersReducedMotion();

  const onBuy = (buy: OfferBuy) => {
    if (buy.kind === "store") {
      if (isAuthenticated && user?.role === "requestor") {
        navigate(`/dashboard/store/${buy.productId}`);
        return;
      }
      navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
      return;
    }
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  const goStart = () => {
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  const heroVisual = offer.pageVisual ?? offer.tile;
  const fullBleedHero = offer.hero === "video" || offer.hero === "photo";
  const heroEyebrow =
    offer.heroEyebrow ?? offer.navLabel.toUpperCase().replace(/\s+/g, "");
  const heroLines = offer.heroBody?.length
    ? offer.heroBody
    : [offer.line];

  return (
    <div className="bg-white text-slate-900">
      {fullBleedHero ? (
        <section className="bg-white">
          {/* fixed 헤더(h-14/sm:h-16) 아래부터 히어로 */}
          <div className="h-14 sm:h-16" aria-hidden />
          {offer.hero === "photo" ? (
            <div className="relative flex min-h-[78svh] items-center pb-16 sm:min-h-[82svh]">
              <div
                className={cn(
                  landingContent,
                  "flex w-full flex-col items-center gap-6 py-8 text-center sm:py-10 lg:flex-row lg:items-end lg:justify-center lg:gap-12",
                )}
              >
                <div className="max-w-lg text-center">
                  <p className={cn(TYPO.eyebrow, "text-[#0b2a5c]/80")}>
                    {heroEyebrow}
                  </p>
                  <h1 className={cn(TYPO.h1, "mt-2 text-[#0b2a5c]")}>
                    {offer.heroTitle}
                  </h1>
                  {offer.heroLead ? (
                    <p className="mt-3 break-keep text-[15px] font-medium leading-6 text-[#0b2a5c]/90 sm:text-[16px] sm:leading-7">
                      {offer.heroLead}
                    </p>
                  ) : null}
                  <Lines
                    lines={heroLines}
                    className="mt-3 text-[14px] leading-6 text-slate-700 sm:text-[15px]"
                  />
                </div>
                <div className="relative h-[min(46vh,22rem)] w-full shrink-0 lg:w-[26rem]">
                  <MediaFrame
                    visual={heroVisual}
                    reduced={reduced}
                    drift={false}
                    native
                    companionSrc={
                      offer.heroCompanion?.kind === "photo"
                        ? offer.heroCompanion.src
                        : undefined
                    }
                    companionAlt={
                      offer.heroCompanion?.kind === "photo"
                        ? offer.heroCompanion.alt
                        : undefined
                    }
                    className="absolute inset-0 h-full"
                  />
                </div>
              </div>
              <LandingScrollCue tone="onLight" />
            </div>
          ) : (
          <div className="relative min-h-[calc(100svh-3.5rem)] overflow-hidden sm:min-h-[calc(100svh-4rem)]">
            <div className="absolute inset-0">
              <MediaFrame
                visual={heroVisual}
                video={offer.hero === "video" && !offer.youtube}
                youtube={offer.hero === "video" ? offer.youtube : undefined}
                reduced={reduced}
                drift={false}
                className="h-full"
              />
            </div>

            <div
              className={cn(
                landingContent,
                "relative z-10 flex min-h-[calc(100svh-3.5rem)] items-end pb-16 pt-10 sm:min-h-[calc(100svh-4rem)] sm:pb-20",
              )}
            >
              <div className="max-w-lg text-left [text-shadow:0_1px_14px_rgba(255,255,255,0.9),0_1px_28px_rgba(255,255,255,0.7)]">
                <p className={cn(TYPO.eyebrow, "text-[#0b2a5c]/80")}>
                  {heroEyebrow}
                </p>
                <h1 className={cn(TYPO.h1, "mt-2 text-[#0b2a5c]")}>
                  {offer.heroTitle}
                </h1>
                {offer.heroLead ? (
                  <p className="mt-3 break-keep text-[15px] font-medium leading-6 text-[#0b2a5c]/90 sm:text-[16px] sm:leading-7">
                    {offer.heroLead}
                  </p>
                ) : null}
                <Lines
                  lines={heroLines}
                  className="mt-3 text-[14px] leading-6 text-slate-700 sm:text-[15px]"
                />
                {offer.cta ? (
                  <Button
                    type="button"
                    className={cn(
                      "mt-6 h-10 px-5 text-[14px] font-semibold",
                      SKY.pill,
                    )}
                    onClick={() => {
                      if (offer.cta) onBuy(offer.cta);
                    }}
                  >
                    {offer.cta.label}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            <LandingScrollCue />
          </div>
          )}
        </section>
      ) : (
        <section className={cn(SKY.band)}>
          <div className="h-14 sm:h-16" aria-hidden />
          <div
            className={cn(
              landingContent,
              "grid items-center gap-6 pb-10 pt-4 lg:grid-cols-2 lg:gap-10 lg:pb-14 lg:pt-6",
            )}
          >
            <div className="text-center lg:text-left">
              <p className={cn(TYPO.eyebrow, SKY.accent)}>{heroEyebrow}</p>
              <h1 className={cn(TYPO.h1, "mt-3", SKY.ink)}>{offer.heroTitle}</h1>
              <Lines lines={heroLines} className={cn("mt-4", TYPO.lead)} />
              {offer.cta ? (
                <Button
                  type="button"
                  className={cn(
                    "mt-6 h-10 px-6 text-[14px] font-semibold",
                    SKY.pill,
                  )}
                  onClick={() => {
                    if (offer.cta) onBuy(offer.cta);
                  }}
                >
                  {offer.cta.label}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <div className={cn("overflow-hidden", SKY.card)}>
              <div className="h-[min(48vh,22rem)] w-full sm:h-[min(52vh,26rem)]">
                <MediaFrame
                  visual={heroVisual}
                  reduced={reduced}
                  drift={heroVisual.kind !== "slideshow"}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {offer.glance ? <GlanceSection glance={offer.glance} /> : null}
      {offer.guides ? <StoryRows stories={offer.guides} /> : null}
      {offer.kitsClip ? (
        <KitsColor clip={offer.kitsClip} reduced={reduced} />
      ) : null}

      {offer.highlights ? (
        <section
          id="offer-content"
          className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
        >
          <div className={landingContent}>
            <div className="mx-auto max-w-2xl text-center">
              <SectionEyebrow>
                {offer.slug === "simple-way" ? "THE SIMPLE WAY" : "OVERVIEW"}
              </SectionEyebrow>
              <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{offer.lead}</h2>
              <p className={cn("mt-2.5", TYPO.lead)}>{offer.line}</p>
            </div>
            <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {offer.highlights.slice(0, 6).map((item, index) => {
                const Icon = ICONS[item.icon];
                return (
                  <li
                    key={item.label}
                    className={cn(SKY.card, "px-4 py-5 sm:px-5 sm:py-6")}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef6ff] text-[#2563eb]">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <p className={cn("text-[13px] font-bold", SKY.accentStrong)}>
                        {String(index + 1).padStart(2, "0")}
                      </p>
                    </div>
                    <h3
                      className={cn(
                        "mt-3 break-keep text-base font-semibold tracking-tight sm:text-lg",
                        SKY.ink,
                      )}
                    >
                      {item.label}
                    </h3>
                    <p className={cn("mt-1.5", TYPO.body)}>{item.line}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      ) : null}

      {offer.scene ? (
        <section className={cn("relative overflow-hidden bg-[#071937]", landingSectionY.bandTight)}>
          <div className="absolute inset-0 opacity-50">
            <MediaFrame visual={offer.scene.visual} reduced={reduced} />
          </div>
          <div className={cn("pointer-events-none absolute inset-0", SKY.heroWash)} />
          <div className={cn("relative", landingContent)}>
            <div className="mx-auto max-w-2xl py-10 text-center sm:py-14">
              <p className={cn(TYPO.eyebrow, "text-white/80")}>TOP-DOWN GUIDE</p>
              <h2 className={cn(TYPO.h2, "mt-2.5 text-white")}>
                {offer.scene.title}
              </h2>
              <p className="mt-2.5 text-[14px] leading-6 text-white/90 sm:text-[15px]">
                {offer.scene.line}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {offer.products ? (
        <ProductCards products={offer.products} />
      ) : null}
      {offer.stories ? <StoryRows stories={offer.stories} /> : null}
      {offer.flowChart ? <FlowChartSection chart={offer.flowChart} /> : null}

      {offer.specs ? (
        <section className={cn("bg-white", landingSectionY.bandTight)}>
          <div className={landingContent}>
            <div className="mx-auto max-w-2xl text-center">
              <SectionEyebrow>SPECS</SectionEyebrow>
              <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>간단히 보는 스펙</h2>
            </div>
            <dl className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {offer.specs.map((spec) => (
                <div key={spec.label} className={cn(SKY.card, "px-4 py-5 text-center sm:px-5")}>
                  <dt className={cn("text-[13px] font-semibold", SKY.accent)}>
                    {spec.label}
                  </dt>
                  <dd
                    className={cn(
                      "mt-1.5 text-base font-semibold tracking-tight sm:text-lg",
                      SKY.ink,
                    )}
                  >
                    {spec.swatches?.length ? (
                      <DiameterDots swatches={spec.swatches} />
                    ) : Array.isArray(spec.value) ? (
                      <span className="flex flex-col items-center gap-2.5">
                        {spec.value.map((line) =>
                          typeof line === "string" ? (
                            <span key={line}>{line}</span>
                          ) : (
                            <span
                              key={line.lead}
                              className="inline-flex flex-wrap items-center justify-center gap-1.5"
                            >
                              {line.lead ? <span>{line.lead}</span> : null}
                              <DiameterDots swatches={line.swatches} />
                            </span>
                          ),
                        )}
                      </span>
                    ) : (
                      spec.value
                    )}
                  </dd>
                  {spec.note?.length ? (
                    <p className="mt-3 break-keep text-[12px] font-normal leading-snug text-slate-500">
                      {spec.note.map((line, index) => (
                        <span key={line}>
                          {index > 0 ? <br /> : null}
                          {line}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {offer.glossary ? <GlossarySection glossary={offer.glossary} /> : null}

      <section id="contact" className={cn("scroll-mt-20", SKY.band)}>
        <div
          className={cn(
            landingContent,
            "flex flex-col items-start py-12 sm:py-14 lg:flex-row lg:items-end lg:justify-between lg:gap-8",
          )}
        >
          <div className="max-w-lg">
            <SectionEyebrow>START SIMPLE WAY</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.ctaBandTitle}
            </h2>
            <Lines
              lines={[...landingHome.ctaBandBody]}
              className={cn("mt-3", TYPO.lead)}
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5 lg:mt-0">
            <Button
              type="button"
              className={cn("h-10 shrink-0 px-6 text-[14px] font-semibold", SKY.pill)}
              onClick={goStart}
            >
              {landingHome.ctaStart}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-10 shrink-0 px-6 text-[14px] font-semibold",
                SKY.pillGhost,
              )}
              onClick={() => navigate("/contact")}
            >
              {landingHome.ctaConsult}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
