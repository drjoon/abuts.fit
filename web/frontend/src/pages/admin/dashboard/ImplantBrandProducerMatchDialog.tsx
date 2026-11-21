// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/implantProducerMatch.controller.js
import { useEffect, useMemo, useRef, useState } from "react";
import { Unlink2 } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";

type ManufacturerOption = {
  anchorId: string;
  name: string;
  operatingStatus: "running" | "paused";
  productionControl: "platform" | "self";
  approved: boolean;
};

type BrandRow = {
  brandKey: string;
  implantManufacturer: string;
  implantBrand: string;
  label: string;
  defaultManufacturerAnchorId: string;
  alternateManufacturerAnchorId: string;
};

type MatchPayload = {
  brands: BrandRow[];
  manufacturers: ManufacturerOption[];
};

type LinkRole = "default" | "alternate";

type PortPoint = { x: number; y: number; clipped: boolean };

type MeasuredPorts = {
  brands: Record<string, PortPoint>;
  manufacturers: Record<string, PortPoint>;
};

type DragState = {
  brandKey: string;
  role: LinkRole;
  x: number;
  y: number;
};

type HoverState =
  | { kind: "brand"; id: string }
  | { kind: "manufacturer"; id: string }
  | { kind: "link"; brandKey: string; role: LinkRole }
  | null;

const EMPTY_PORTS: MeasuredPorts = { brands: {}, manufacturers: {} };

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function applyBrandLink(
  brands: BrandRow[],
  brandKey: string,
  anchorId: string,
  role: LinkRole,
): BrandRow[] {
  if (!anchorId) return brands;
  return brands.map((item) => {
    if (item.brandKey !== brandKey) return item;
    const defaultId = item.defaultManufacturerAnchorId;
    const alternateId = item.alternateManufacturerAnchorId;
    if (role === "default") {
      if (defaultId === anchorId) return item;
      return {
        ...item,
        defaultManufacturerAnchorId: anchorId,
        alternateManufacturerAnchorId: alternateId === anchorId ? "" : alternateId,
      };
    }
    if (alternateId === anchorId) return item;
    return {
      ...item,
      alternateManufacturerAnchorId: anchorId,
      defaultManufacturerAnchorId: defaultId === anchorId ? "" : defaultId,
    };
  });
}

function clearBrandLink(brands: BrandRow[], brandKey: string, role: LinkRole): BrandRow[] {
  return brands.map((item) => {
    if (item.brandKey !== brandKey) return item;
    return role === "default"
      ? { ...item, defaultManufacturerAnchorId: "" }
      : { ...item, alternateManufacturerAnchorId: "" };
  });
}

function curveBetween(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.46);
  const sign = x2 >= x1 ? 1 : -1;
  const c1x = x1 + dx * sign;
  const c1y = y1;
  const c2x = x2 - dx * sign;
  const c2y = y2;
  const t = 0.5;
  const u = 1 - t;
  return {
    d: `M ${round1(x1)} ${round1(y1)} C ${round1(c1x)} ${round1(c1y)}, ${round1(c2x)} ${round1(c2y)}, ${round1(x2)} ${round1(y2)}`,
    mid: {
      x: round1(u ** 3 * x1 + 3 * u ** 2 * t * c1x + 3 * u * t ** 2 * c2x + t ** 3 * x2),
      y: round1(u ** 3 * y1 + 3 * u ** 2 * t * c1y + 3 * u * t ** 2 * c2y + t ** 3 * y2),
    },
  };
}

function readPort(node: HTMLElement, origin: DOMRect, clip: DOMRect): PortPoint {
  const rect = node.getBoundingClientRect();
  const rawY = rect.top + rect.height / 2 - origin.top;
  const minY = clip.top - origin.top + 6;
  const maxY = clip.bottom - origin.top - 6;
  return {
    x: round1(rect.left + rect.width / 2 - origin.left),
    y: round1(Math.min(maxY, Math.max(minY, rawY))),
    clipped: rawY < minY || rawY > maxY,
  };
}

export function ImplantBrandProducerMatchDialog({
  open,
  token,
  onOpenChange,
}: {
  open: boolean;
  token: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkRole, setLinkRole] = useState<LinkRole>("default");
  const [ports, setPorts] = useState<MeasuredPorts>(EMPTY_PORTS);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropId, setDropId] = useState("");
  const [hover, setHover] = useState<HoverState>(null);
  const [selectedBrandKey, setSelectedBrandKey] = useState("");

  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const linkRoleRef = useRef<LinkRole>("default");
  const measureSigRef = useRef("");
  linkRoleRef.current = linkRole;

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void apiFetch<{ success: boolean; data: MatchPayload }>({
      path: "/api/admin/implant-producer-matches",
      method: "GET",
      token,
    })
      .then((res) => {
        if (cancelled) return;
        setReady(true);
        if (!res.ok || !res.data?.data) return;
        setBrands(res.data.data.brands || []);
        setManufacturers(res.data.data.manufacturers || []);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const layoutKey = `${brands
    .map(
      (row) =>
        `${row.brandKey}:${row.defaultManufacturerAnchorId}:${row.alternateManufacturerAnchorId}`,
    )
    .join("|")}::${manufacturers.map((row) => row.anchorId).join("|")}`;

  useEffect(() => {
    if (!open) return;
    const board = boardRef.current;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!board || !left || !right) return;

    const measure = () => {
      const origin = board.getBoundingClientRect();
      const leftClip = left.getBoundingClientRect();
      const rightClip = right.getBoundingClientRect();
      if (leftClip.height < 8 || rightClip.height < 8) return;
      const nextBrands: Record<string, PortPoint> = {};
      const nextManufacturers: Record<string, PortPoint> = {};
      board.querySelectorAll<HTMLElement>("[data-brand-port]").forEach((node) => {
        const key = node.dataset.brandPort || "";
        if (!key) return;
        const point = readPort(node, origin, rightClip);
        const role = node.dataset.portRole || "";
        if (role === "default" || role === "alternate") {
          nextBrands[`${key}:${role}`] = point;
        }
        if (role === "" || role === "default" || (role === "alternate" && !nextBrands[key])) {
          nextBrands[key] = point;
        }
      });
      board.querySelectorAll<HTMLElement>("[data-manufacturer-port]").forEach((node) => {
        const key = node.dataset.manufacturerPort || "";
        if (!key) return;
        nextManufacturers[key] = readPort(node, origin, leftClip);
      });
      const sig = JSON.stringify([nextBrands, nextManufacturers]);
      if (sig === measureSigRef.current) return;
      measureSigRef.current = sig;
      setPorts({ brands: nextBrands, manufacturers: nextManufacturers });
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    left.addEventListener("scroll", schedule, { passive: true });
    right.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(board);
    observer.observe(left);
    observer.observe(right);
    let warmup = 0;
    let warmFrame = 0;
    const warm = () => {
      schedule();
      warmup += 1;
      if (warmup < 24) warmFrame = requestAnimationFrame(warm);
    };
    warmFrame = requestAnimationFrame(warm);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(warmFrame);
      left.removeEventListener("scroll", schedule);
      right.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [open, layoutKey, ready]);

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  const grouped = useMemo(() => {
    const map = new Map<string, BrandRow[]>();
    for (const brand of brands) {
      const key = brand.implantManufacturer || "기타";
      const list = map.get(key) || [];
      list.push(brand);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [brands]);

  const platformId =
    manufacturers.find((row) => row.productionControl === "platform")?.anchorId || "";

  const manufacturerById = useMemo(
    () => new Map(manufacturers.map((row) => [row.anchorId, row])),
    [manufacturers],
  );

  const brandByKey = useMemo(
    () => new Map(brands.map((row) => [row.brandKey, row])),
    [brands],
  );

  const setPlatform = (anchorId: string) => {
    setManufacturers((current) =>
      current.map((row) => ({
        ...row,
        productionControl: row.anchorId === anchorId ? "platform" : "self",
      })),
    );
  };

  const save = async () => {
    if (!token || saving) return;
    setSaving(true);
    const res = await apiFetch<{ success: boolean; message?: string; data?: MatchPayload }>({
      path: "/api/admin/implant-producer-matches",
      method: "PUT",
      token,
      jsonBody: {
        matches: brands.map((brand) => ({
          brandKey: brand.brandKey,
          defaultManufacturerAnchorId: brand.defaultManufacturerAnchorId,
          alternateManufacturerAnchorId: brand.alternateManufacturerAnchorId,
        })),
        operating: manufacturers.map((row) => ({
          anchorId: row.anchorId,
          operatingStatus: row.operatingStatus,
        })),
        platformAnchorId: platformId,
      },
    });
    setSaving(false);
    if (!res.ok || !res.data?.success) {
      toast({
        title: "저장하지 못했습니다",
        description: res.data?.message || "다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    if (res.data.data) {
      setBrands(res.data.data.brands || []);
      setManufacturers(res.data.data.manufacturers || []);
    }
    toast({ title: "생산 제조사 매칭을 저장했습니다" });
  };

  const startDrag = (event: React.PointerEvent, brandKey: string) => {
    if (event.button !== 0 || saving || dragRef.current) return;
    event.preventDefault();
    const board = boardRef.current;
    if (!board) return;
    const origin = board.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const next: DragState = {
      brandKey,
      role: linkRoleRef.current,
      x: startX - origin.left,
      y: startY - origin.top,
    };
    dragRef.current = next;
    setHover(null);

    const swallowClick = (clickEvent: MouseEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      window.removeEventListener("click", swallowClick, true);
    };
    window.addEventListener("click", swallowClick, true);

    const cleanupListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
      dragRef.current = null;
      dragCleanupRef.current = null;
      setDrag(null);
      setDropId("");
    };

    let draggingLine = false;
    const onMove = (moveEvent: PointerEvent) => {
      const currentBoard = boardRef.current;
      if (!currentBoard || !dragRef.current) return;
      const moved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!draggingLine && moved < 6) return;
      draggingLine = true;
      const box = currentBoard.getBoundingClientRect();
      const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const anchorId =
        hit?.closest("[data-manufacturer-id]")?.getAttribute("data-manufacturer-id") || "";
      setDropId(anchorId);
      const point = {
        x: moveEvent.clientX - box.left,
        y: moveEvent.clientY - box.top,
      };
      dragRef.current = { ...dragRef.current, ...point };
      setDrag(dragRef.current);
    };

    const onUp = (upEvent: PointerEvent) => {
      const current = dragRef.current;
      cleanupListeners();
      if (!current || upEvent.type === "pointercancel") {
        window.removeEventListener("click", swallowClick, true);
        return;
      }
      setSelectedBrandKey(current.brandKey);
      if (!draggingLine) return;
      const hit = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const anchorId =
        hit?.closest("[data-manufacturer-id]")?.getAttribute("data-manufacturer-id") || "";
      if (!anchorId) return;
      setBrands((rows) => applyBrandLink(rows, current.brandKey, anchorId, current.role));
    };

    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      window.removeEventListener("click", swallowClick, true);
      cleanupListeners();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    dragCleanupRef.current = () => {
      window.removeEventListener("click", swallowClick, true);
      cleanupListeners();
    };
  };

  const links = useMemo(() => {
    const drawn: Array<{
      key: string;
      brandKey: string;
      anchorId: string;
      role: LinkRole;
      d: string;
      mid: { x: number; y: number };
      clipped: boolean;
      quiet: boolean;
      emphasis: number;
    }> = [];
    for (const brand of brands) {
      const pairs: Array<[LinkRole, string]> = [
        ["default", brand.defaultManufacturerAnchorId],
        ["alternate", brand.alternateManufacturerAnchorId],
      ];
      for (const [role, anchorId] of pairs) {
        if (!anchorId) continue;
        const start = ports.brands[`${brand.brandKey}:${role}`];
        const end = ports.manufacturers[anchorId];
        if (!start || !end) continue;
        const curve = curveBetween(start.x, start.y, end.x, end.y);
        const maker = manufacturerById.get(anchorId);
        const quiet = !maker || maker.operatingStatus === "paused" || !maker.approved;
        let emphasis = 1;
        if (!drag && hover) {
          const related =
            (hover.kind === "brand" && hover.id === brand.brandKey) ||
            (hover.kind === "manufacturer" && hover.id === anchorId) ||
            (hover.kind === "link" &&
              hover.brandKey === brand.brandKey &&
              hover.role === role);
          emphasis = related ? 1 : 0.14;
        }
        drawn.push({
          key: `${brand.brandKey}:${role}`,
          brandKey: brand.brandKey,
          anchorId,
          role,
          d: curve.d,
          mid: curve.mid,
          clipped: start.clipped || end.clipped,
          quiet,
          emphasis: (quiet ? emphasis * 0.4 : emphasis) * (start.clipped || end.clipped ? 0.28 : 1),
        });
      }
    }
    return drawn;
  }, [brands, drag, hover, manufacturerById, ports]);

  const dragCurve = useMemo(() => {
    if (!drag) return null;
    const start = ports.brands[drag.brandKey];
    if (!start) return null;
    const snapped = dropId ? ports.manufacturers[dropId] : undefined;
    return curveBetween(start.x, start.y, snapped?.x ?? drag.x, snapped?.y ?? drag.y);
  }, [drag, dropId, ports]);

  const brandLit = (brand: BrandRow) => {
    if (drag?.brandKey === brand.brandKey) return true;
    if (!hover || drag) return false;
    if (hover.kind === "brand") return hover.id === brand.brandKey;
    if (hover.kind === "manufacturer") {
      return (
        brand.defaultManufacturerAnchorId === hover.id ||
        brand.alternateManufacturerAnchorId === hover.id
      );
    }
    return hover.brandKey === brand.brandKey;
  };

  const manufacturerLit = (anchorId: string) => {
    if (dropId === anchorId && drag) return true;
    if (!hover || drag) return false;
    if (hover.kind === "manufacturer") return hover.id === anchorId;
    if (hover.kind === "brand") {
      const brand = brandByKey.get(hover.id);
      return (
        brand?.defaultManufacturerAnchorId === anchorId ||
        brand?.alternateManufacturerAnchorId === anchorId
      );
    }
    return hover.role
      ? brandByKey.get(hover.brandKey)?.[
          hover.role === "default"
            ? "defaultManufacturerAnchorId"
            : "alternateManufacturerAnchorId"
        ] === anchorId
      : false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(46rem,90vh)] max-h-[90vh] flex-col gap-3 overflow-hidden sm:w-[min(54rem,calc(100vw-2rem))] sm:max-w-none">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <DialogHeader className="max-w-xl space-y-1.5 text-left">
            <DialogTitle>임플란트 브랜드 · 생산 제조사</DialogTitle>
            <DialogDescription>
              모두 연결을 누르면 모든 브랜드·패밀리가 이어집니다.
              <br />
              끊기 아이콘은 선이 시작되는 곳에 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div
            role="group"
            aria-label="연결 종류"
            className="inline-flex shrink-0 rounded-full bg-slate-100 p-1"
          >
            {(["default", "alternate"] as const).map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={linkRole === role}
                onClick={() => setLinkRole(role)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  linkRole === role
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {role === "default" ? (
                  <span className="h-0.5 w-5 rounded-full bg-primary" />
                ) : (
                  <span className="w-5 border-t-2 border-dashed border-accent" />
                )}
                {role === "default" ? "기본" : "대체"}
              </button>
            ))}
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(148 163 184 / 0.45) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <div ref={boardRef} className="relative h-full">
            <div className="pointer-events-none relative grid h-full grid-rows-[auto_minmax(0,1fr)]">
              <div className="grid grid-cols-[minmax(0,1.25fr)_3.25rem_minmax(0,1fr)] border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-sm">
                <div className="px-3 py-2 text-xs font-semibold tracking-wide text-slate-500">
                  생산 제조사
                </div>
                <div />
                <div className="px-3 py-2 text-xs font-semibold tracking-wide text-slate-500">
                  브랜드 · 패밀리
                </div>
              </div>
              <div className="grid min-h-0 grid-cols-[minmax(0,1.25fr)_3.25rem_minmax(0,1fr)]">
                <div
                  ref={leftScrollRef}
                  className="pointer-events-auto min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain py-1.5 pl-1.5 pr-5"
                >
                  {!ready && manufacturers.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">불러오는 중…</p>
                  ) : manufacturers.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">
                      등록된 제조사가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {manufacturers.map((row) => {
                        const paused = row.operatingStatus === "paused";
                        const isPlatform = row.anchorId === platformId;
                        const lit = manufacturerLit(row.anchorId);
                        const dim = Boolean(hover) && !drag && !lit;
                        const dropping = drag && dropId === row.anchorId;
                        const allLinked =
                          brands.length > 0 &&
                          brands.every(
                            (brand) =>
                              (linkRole === "default"
                                ? brand.defaultManufacturerAnchorId
                                : brand.alternateManufacturerAnchorId) === row.anchorId,
                          );
                        return (
                          <article
                            key={row.anchorId}
                            data-manufacturer-id={row.anchorId}
                            onMouseEnter={() => {
                              if (!dragRef.current) {
                                setHover({ kind: "manufacturer", id: row.anchorId });
                              }
                            }}
                            onMouseLeave={() =>
                              setHover((current) =>
                                current?.kind === "manufacturer" && current.id === row.anchorId
                                  ? null
                                  : current,
                              )
                            }
                            className={cn(
                              "flex items-center gap-1.5 rounded-xl border bg-white py-1.5 pl-2.5 pr-1 shadow-sm transition-[border-color,box-shadow,opacity]",
                              dropping && drag?.role === "alternate" && "border-accent ring-2 ring-accent/30",
                              dropping && drag?.role !== "alternate" && "border-primary ring-2 ring-primary/25",
                              !dropping && lit && "border-primary/40 shadow-md",
                              !dropping && !lit && "border-slate-200",
                              paused && "bg-slate-50",
                              dim && "opacity-40",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                              <p className="mt-0.5 truncate text-[11px]">
                                <span className="text-slate-500">
                                  {row.approved ? "승인" : "승인 전"}
                                </span>
                                <span className="text-slate-300"> · </span>
                                <span className={paused ? "text-rose-600" : "text-emerald-700"}>
                                  {paused ? "중단" : "가동"}
                                </span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-pressed={isPlatform}
                                onClick={() => setPlatform(row.anchorId)}
                                className={cn(
                                  "h-7 rounded-full px-2.5 text-xs font-medium",
                                  isPlatform
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                                )}
                              >
                                플랫폼
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setManufacturers((current) =>
                                    current.map((item) =>
                                      item.anchorId === row.anchorId
                                        ? {
                                            ...item,
                                            operatingStatus:
                                              item.operatingStatus === "paused"
                                                ? "running"
                                                : "paused",
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                {paused ? "가동" : "중단"}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setBrands((current) =>
                                  current.map((brand) => {
                                    if (linkRole === "default") {
                                      return {
                                        ...brand,
                                        defaultManufacturerAnchorId: row.anchorId,
                                        alternateManufacturerAnchorId:
                                          brand.alternateManufacturerAnchorId === row.anchorId
                                            ? ""
                                            : brand.alternateManufacturerAnchorId,
                                      };
                                    }
                                    return {
                                      ...brand,
                                      alternateManufacturerAnchorId: row.anchorId,
                                      defaultManufacturerAnchorId:
                                        brand.defaultManufacturerAnchorId === row.anchorId
                                          ? ""
                                          : brand.defaultManufacturerAnchorId,
                                    };
                                  }),
                                );
                              }}
                              className={cn(
                                "ml-4 h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium",
                                allLinked
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                              )}
                            >
                              모두 연결
                            </button>
                            <span
                              data-manufacturer-port={row.anchorId}
                              className="grid h-7 w-7 shrink-0 translate-x-1/2 place-items-center"
                            >
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white shadow-[0_0_0_2px_white]" />
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div />
                <div
                  ref={rightScrollRef}
                  className="pointer-events-auto min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain py-1.5 pl-5 pr-1.5"
                >
                  {!ready && brands.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">불러오는 중…</p>
                  ) : grouped.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">
                      등록된 브랜드가 없습니다.
                    </p>
                  ) : (
                    grouped.map(([manufacturer, rows]) => (
                      <section key={manufacturer} className="mb-3">
                        <div className="sticky top-0 z-20 -ml-5 -mr-1.5 mb-1.5 bg-slate-50 py-1.5 pl-5 pr-1.5 text-[11px] font-semibold tracking-wide text-slate-400">
                          {manufacturer}
                        </div>
                        <div className="space-y-1.5">
                          {rows.map((brand) => {
                            const hasDefault = Boolean(brand.defaultManufacturerAnchorId);
                            const hasAlternate = Boolean(brand.alternateManufacturerAnchorId);
                            const lit = brandLit(brand);
                            const dim = Boolean(hover) && !drag && !lit;
                            return (
                              <div
                                key={brand.brandKey}
                                onPointerDown={(event) => startDrag(event, brand.brandKey)}
                                onMouseEnter={() => {
                                  if (!dragRef.current) setHover({ kind: "brand", id: brand.brandKey });
                                }}
                                onMouseLeave={() =>
                                  setHover((current) =>
                                    current?.kind === "brand" && current.id === brand.brandKey
                                      ? null
                                      : current,
                                  )
                                }
                                className={cn(
                                  "flex cursor-grab select-none items-center gap-1 rounded-xl border bg-white py-1.5 pl-1 pr-2 text-left shadow-sm touch-none transition-[border-color,box-shadow,opacity] active:cursor-grabbing",
                                  selectedBrandKey === brand.brandKey
                                    ? "border-primary ring-2 ring-primary/25"
                                    : lit
                                      ? "border-primary/50 shadow-md"
                                      : "border-slate-200 hover:border-slate-300",
                                  dim && selectedBrandKey !== brand.brandKey && "opacity-40",
                                )}
                              >
                                <span className="relative z-50 flex shrink-0 -translate-x-1/2 flex-col items-center gap-0.5">
                                  {hasDefault ? (
                                    <button
                                      type="button"
                                      data-brand-port={brand.brandKey}
                                      data-port-role="default"
                                      aria-label={`${brand.label} 기본 연결 해제`}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setBrands((current) =>
                                          clearBrandLink(current, brand.brandKey, "default"),
                                        );
                                      }}
                                      className="grid h-5 w-5 place-items-center rounded-full border border-primary/40 bg-white text-primary shadow-[0_0_0_2px_white] hover:bg-primary/10"
                                    >
                                      <Unlink2 className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                  {hasAlternate ? (
                                    <button
                                      type="button"
                                      data-brand-port={brand.brandKey}
                                      data-port-role="alternate"
                                      aria-label={`${brand.label} 대체 연결 해제`}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setBrands((current) =>
                                          clearBrandLink(current, brand.brandKey, "alternate"),
                                        );
                                      }}
                                      className="grid h-5 w-5 place-items-center rounded-full border border-accent/50 bg-white text-accent-strong shadow-[0_0_0_2px_white] hover:bg-accent/10"
                                    >
                                      <Unlink2 className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                  {!hasDefault && !hasAlternate ? (
                                    <span
                                      data-brand-port={brand.brandKey}
                                      className="grid h-7 w-7 place-items-center"
                                    >
                                      <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white shadow-[0_0_0_2px_white]" />
                                    </span>
                                  ) : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                                  {brand.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </div>
            </div>

            <svg className="pointer-events-none absolute inset-0 z-40 h-full w-full">
              {links.map((link) => {
                const brand = brandByKey.get(link.brandKey);
                const hot = hover?.kind === "link" && hover.brandKey === link.brandKey && hover.role === link.role;
                const stroke = link.role === "default" ? "hsl(var(--primary))" : "hsl(var(--accent))";
                return (
                  <g
                    key={link.key}
                    opacity={link.emphasis}
                    className="transition-opacity"
                    onMouseEnter={() =>
                      setHover({ kind: "link", brandKey: link.brandKey, role: link.role })
                    }
                    onMouseLeave={() =>
                      setHover((current) =>
                        current?.kind === "link" &&
                        current.brandKey === link.brandKey &&
                        current.role === link.role
                          ? null
                          : current,
                      )
                    }
                  >
                    <path
                      d={link.d}
                      fill="none"
                      stroke="white"
                      strokeWidth={6}
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                    <path
                      d={link.d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={hot ? 3 : 2.25}
                      strokeLinecap="round"
                      strokeDasharray={link.role === "alternate" ? "5 7" : undefined}
                      className="pointer-events-none"
                    />
                    <path
                      d={link.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      strokeLinecap="round"
                      className="cursor-pointer"
                      style={{ pointerEvents: dragging ? "none" : "stroke" }}
                      role="button"
                      aria-label={`${brand?.label || "브랜드"} ${link.role === "default" ? "기본" : "대체"} 해제`}
                      onClick={() =>
                        setBrands((rows) => clearBrandLink(rows, link.brandKey, link.role))
                      }
                    />
                    {hot ? (
                      <g
                        transform={`translate(${link.mid.x} ${link.mid.y})`}
                        className="cursor-pointer"
                        style={{ pointerEvents: dragging ? "none" : "auto" }}
                        role="button"
                        aria-label="연결 해제"
                        onClick={() =>
                          setBrands((rows) => clearBrandLink(rows, link.brandKey, link.role))
                        }
                      >
                        <circle r="9" fill="white" stroke="rgb(203 213 225)" />
                        <path
                          d="M -3.2 -3.2 L 3.2 3.2 M 3.2 -3.2 L -3.2 3.2"
                          fill="none"
                          stroke="rgb(71 85 105)"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          className="pointer-events-none"
                        />
                      </g>
                    ) : null}
                  </g>
                );
              })}
              {drag && dragCurve ? (
                <path
                  d={dragCurve.d}
                  fill="none"
                  stroke={drag.role === "default" ? "hsl(var(--primary))" : "hsl(var(--accent))"}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={drag.role === "alternate" ? "5 7" : undefined}
                  opacity={0.9}
                  className="pointer-events-none"
                />
              ) : null}
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            기본이 멈추면 대체로 넘어갑니다.
            <br />
            대체도 없으면 플랫폼 제조사입니다.
          </p>
          <Button type="button" disabled={saving || !token} onClick={() => void save()}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
