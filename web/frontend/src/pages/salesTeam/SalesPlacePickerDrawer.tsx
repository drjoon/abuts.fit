// related files:
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/pages/salesTeam/SalesRouteMap.tsx
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/shared/ui/cn";
import {
  KIND_LABEL,
  salesTeamApi,
  type SalesPlaceSuggest,
} from "./salesTeamApi";
import { loadKakaoMaps } from "./SalesRouteMap";

type Step = "search" | "candidates" | "confirm";

type SalesPlacePickerDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  /** Prefill / skip search when opening for a known BA or account */
  seed?: Partial<SalesPlaceSuggest> | null;
  onConfirm: (place: SalesPlaceSuggest) => void;
  /** confirm 단계 저장 버튼 라벨 */
  confirmLabel?: string;
  /** confirm 단계 안내 문구 */
  confirmDescription?: string;
};

function hasCoords(p: { lat?: number | null; lng?: number | null } | null) {
  return (
    p != null &&
    p.lat != null &&
    p.lng != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

function PlaceConfirmMap({
  lat,
  lng,
  className,
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let markerCleanup: (() => void) | null = null;

    async function draw() {
      if (!containerRef.current) return;
      try {
        const maps = await loadKakaoMaps();
        if (cancelled || !containerRef.current) return;
        setError(null);
        containerRef.current.innerHTML = "";
        const center = new maps.LatLng(lat, lng);
        const map = new maps.Map(containerRef.current, {
          center,
          level: 3,
        });
        const marker = new maps.Marker({ position: center, map });
        markerCleanup = () => marker.setMap(null);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "map_error";
        setError(
          msg === "missing_key"
            ? "지도 앱키가 없습니다."
            : "지도를 불러오지 못했습니다.",
        );
      }
    }

    void draw();
    return () => {
      cancelled = true;
      markerCleanup?.();
    };
  }, [lat, lng]);

  return (
    <div className={cn("space-y-1", className)}>
      <div
        ref={containerRef}
        className="h-48 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      />
      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
    </div>
  );
}

function ResultRow({
  item,
  onClick,
  busy,
}: {
  item: SalesPlaceSuggest;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex w-full flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left active:bg-slate-50 disabled:opacity-60"
    >
      <span className="flex items-center gap-1.5 font-medium text-slate-900">
        <span className="min-w-0 flex-1 truncate text-[15px]">{item.name}</span>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
          {item.label || KIND_LABEL[item.kind] || item.source}
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {[KIND_LABEL[item.kind], item.address || item.phone]
          .filter(Boolean)
          .join(" · ") || "상세 없음"}
      </span>
    </button>
  );
}

export default function SalesPlacePickerDrawer({
  open,
  onOpenChange,
  initialQuery = "",
  seed = null,
  onConfirm,
  confirmLabel = "이 위치로",
  confirmDescription = "지도에서 맞는지 확인한 뒤 이 위치로 저장합니다.",
}: SalesPlacePickerDrawerProps) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<SalesPlaceSuggest[]>([]);
  const [candidates, setCandidates] = useState<SalesPlaceSuggest[]>([]);
  const [selected, setSelected] = useState<SalesPlaceSuggest | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);
  const seededRef = useRef(false);

  const reset = () => {
    setStep("search");
    setQuery(initialQuery);
    setItems([]);
    setCandidates([]);
    setSelected(null);
    setLoading(false);
    setResolving(false);
    seededRef.current = false;
  };

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setQuery(initialQuery);
    // Auto-resolve seed with BA or coords when drawer opens
    if (seededRef.current) return;
    seededRef.current = true;
    if (seed?.businessAnchorId || (seed && hasCoords(seed))) {
      void handlePick(seed as SalesPlaceSuggest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);
      void salesTeamApi
        .suggestPlaces(token, q)
        .then((res) => {
          if (reqId !== reqRef.current) return;
          setItems(res.items || []);
        })
        .catch(() => {
          if (reqId !== reqRef.current) return;
          setItems([]);
        })
        .finally(() => {
          if (reqId !== reqRef.current) return;
          setLoading(false);
        });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, step, token, query]);

  const goConfirm = (place: SalesPlaceSuggest) => {
    if (!hasCoords(place)) {
      toast({
        title: "좌표를 확인할 수 없습니다",
        description: "다른 장소를 선택해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setSelected(place);
    setStep("confirm");
  };

  const toastEmptyCandidates = (res: {
    kakaoLocalAuthError?: boolean;
    kakaoLocalConfigured?: boolean;
  }) => {
    if (res.kakaoLocalAuthError) {
      toast({
        title: "카카오 지도 검색 권한이 없습니다",
        description:
          "카카오 개발자 콘솔에서 앱의 「카카오맵」 제품을 활성화하거나, 주소가 있는 목록 항목을 선택해 주세요.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "추천 위치를 찾지 못했습니다",
      description: "상호명을 조금 바꿔 다시 검색해 보세요.",
      variant: "destructive",
    });
  };

  const handlePick = async (item: SalesPlaceSuggest) => {
    // Kakao / already-geocoded: go straight to map
    if (item.source === "kakao" && hasCoords(item)) {
      goConfirm(item);
      return;
    }
    if (item.source === "account" && hasCoords(item) && !item.businessAnchorId) {
      goConfirm(item);
      return;
    }

    // BA / platform / account-with-BA / missing coords → resolve
    setResolving(true);
    try {
      const res = await salesTeamApi.resolvePlace(token, {
        businessAnchorId: item.businessAnchorId || null,
        name: item.name,
        address: item.address || "",
      });
      if (!res.needsPick && res.place && hasCoords(res.place)) {
        const merged: SalesPlaceSuggest = {
          ...item,
          ...res.place,
          accountId: item.accountId || res.place.accountId,
          businessAnchorId:
            item.businessAnchorId || res.place.businessAnchorId || null,
          representativeName:
            item.representativeName || res.place.representativeName || "",
          phone: item.phone || res.place.phone || "",
          kind: item.kind || res.place.kind,
        };
        goConfirm(merged);
        return;
      }
      const list = res.candidates || [];
      if (list.length === 0) {
        toastEmptyCandidates(res);
        setStep("search");
        return;
      }
      setCandidates(
        list.map((c) => ({
          ...c,
          businessAnchorId: item.businessAnchorId || c.businessAnchorId,
          kind: item.kind || c.kind,
        })),
      );
      setStep("candidates");
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "위치 확인에 실패했습니다",
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  };

  const searchByNameOnly = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setResolving(true);
    try {
      // Prefer address from the top suggest hit when resolving by button/Enter.
      const top = items.find(
        (it) =>
          it.name.includes(q) ||
          q.includes(it.name) ||
          String(it.address || "").includes(q),
      );
      const res = await salesTeamApi.resolvePlace(token, {
        name: q,
        address: top?.address || "",
        businessAnchorId: top?.businessAnchorId || null,
      });
      if (!res.needsPick && res.place && hasCoords(res.place)) {
        goConfirm({
          ...res.place,
          accountId: top?.accountId || res.place.accountId,
          businessAnchorId:
            top?.businessAnchorId || res.place.businessAnchorId || null,
          representativeName:
            top?.representativeName || res.place.representativeName || "",
          phone: top?.phone || res.place.phone || "",
          kind: top?.kind || res.place.kind,
        });
        return;
      }
      const list = res.candidates || [];
      if (list.length === 0) {
        if (res.kakaoLocalAuthError) {
          toastEmptyCandidates(res);
        } else {
          toast({
            title: "지도에서 찾지 못했습니다",
            description: top?.address
              ? "목록의 항목을 직접 눌러 주소로 위치를 확인해 보세요."
              : "상호명을 조금 바꿔 다시 검색해 보세요.",
            variant: "destructive",
          });
        }
        return;
      }
      setCandidates(list);
      setStep("candidates");
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "검색에 실패했습니다",
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  };

  const title =
    step === "confirm"
      ? "위치 확인"
      : step === "candidates"
        ? "추천 위치 선택"
        : "위치 찾기";

  const isMobile = useIsMobile();

  const description =
    step === "confirm"
      ? confirmDescription
      : step === "candidates"
        ? "카카오맵 추천 중 맞는 곳을 고르세요."
        : "상호 몇 글자만 치면 플랫폼·지도에서 찾아줍니다.";

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const headerNav = (
    <div className="flex items-center gap-2">
      {step !== "search" ? (
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="뒤로"
          onClick={() => {
            if (step === "confirm" && candidates.length) {
              setStep("candidates");
            } else {
              setStep("search");
              setCandidates([]);
              setSelected(null);
            }
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        {isMobile ? (
          <>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </>
        ) : (
          <>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="min-h-0 overflow-y-auto px-1 pb-1 sm:px-0">
      {step === "search" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="치과·기공소 상호"
              className="h-12 pl-10 text-base"
              autoFocus
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchByNameOnly();
                }
              }}
            />
            {loading || resolving ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            ) : null}
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <ResultRow
                key={`${item.source}-${item.accountId || item.businessAnchorId || item.name}-${idx}`}
                item={item}
                busy={resolving}
                onClick={() => void handlePick(item)}
              />
            ))}
            {query.trim().length >= 2 && !loading && items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                자동완성에 없습니다. 아래 「지도에서 찾기」를 눌러 보세요.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "candidates" ? (
        <div className="space-y-2">
          {candidates.map((item, idx) => (
            <ResultRow
              key={`cand-${item.name}-${idx}`}
              item={item}
              onClick={() => goConfirm(item)}
            />
          ))}
        </div>
      ) : null}

      {step === "confirm" && selected && hasCoords(selected) ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{selected.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.address || "주소 없음"}
                </p>
              </div>
            </div>
          </div>
          <PlaceConfirmMap lat={selected.lat!} lng={selected.lng!} />
        </div>
      ) : null}
    </div>
  );

  const actions = (
    <div className="flex w-full flex-col gap-2">
      {step === "search" ? (
        <Button
          className="h-12 text-base"
          disabled={query.trim().length < 2 || resolving}
          onClick={() => void searchByNameOnly()}
        >
          {resolving ? "찾는 중…" : "지도에서 찾기"}
        </Button>
      ) : null}
      {step === "confirm" && selected ? (
        <Button
          className="h-12 text-base"
          onClick={() => {
            onConfirm(selected);
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="h-11"
        onClick={() => onOpenChange(false)}
      >
        닫기
      </Button>
    </div>
  );

  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          hideClose
          overlayClassName="z-[120]"
          className="z-[120] flex max-h-[min(88vh,40rem)] w-[min(100vw-2rem,26rem)] max-w-[26rem] flex-col gap-3 overflow-hidden rounded-2xl p-4 sm:max-w-[26rem] sm:p-5"
        >
          <DialogHeader className="space-y-0 p-0 text-left">
            {headerNav}
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">{body}</div>
          <DialogFooter className="mt-0 flex-col gap-0 space-x-0 sm:flex-col sm:justify-stretch sm:space-x-0">
            {actions}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="pb-2 text-left">{headerNav}</DrawerHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-2">{body}</div>
        <DrawerFooter className="gap-2 pt-2">{actions}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
