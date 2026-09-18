// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/ui/cn";
import {
  STORE_CATEGORIES,
  type StoreProduct,
} from "@/shared/store/storeCatalog";
import { landingTheme } from "./landingTheme";

type BrowseFilter = "all" | "abutment" | "healing" | "kits" | "parts";

const FILTERS: { id: BrowseFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "abutment", label: "어벗먼트" },
  { id: "healing", label: "힐링" },
  { id: "kits", label: "시술 키트" },
  { id: "parts", label: "기구" },
];

function isHealingProduct(product: StoreProduct) {
  return /healing/i.test(product.id) || /healing/i.test(product.name);
}

function productsForFilter(filter: BrowseFilter): StoreProduct[] {
  const abutment = STORE_CATEGORIES.find((c) => c.id === "abutment")?.products ?? [];
  const kits = STORE_CATEGORIES.find((c) => c.id === "kits")?.products ?? [];
  const parts = STORE_CATEGORIES.find((c) => c.id === "parts")?.products ?? [];

  if (filter === "abutment") {
    return abutment.filter((p) => !isHealingProduct(p));
  }
  if (filter === "healing") {
    return abutment.filter((p) => isHealingProduct(p));
  }
  if (filter === "kits") return kits.filter((p) => p.id !== "full-package");
  if (filter === "parts") return parts;
  return [
    ...abutment.filter((p) => !isHealingProduct(p)).slice(0, 1),
    ...abutment.filter((p) => isHealingProduct(p)).slice(0, 1),
    ...kits.filter((p) => p.id !== "full-package").slice(0, 1),
  ];
}

/** 기획: 제품 둘러보기 — 카테고리 탭 + 카드 그리드 */
export const LandingStoreShowcase = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const products = useMemo(() => productsForFilter(filter).slice(0, 6), [filter]);

  return (
    <section
      id="store"
      className="relative scroll-mt-20 border-t border-slate-200/80 bg-white sm:scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className={`text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
            >
              제품 둘러보기
            </h2>
            <p className={`mt-1.5 text-sm ${landingTheme.muted}`}>
              어벗먼트·힐링·시술 키트·기구
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:text-sky-700"
            onClick={() => navigate("/signup")}
          >
            전체 제품
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                filter === item.id
                  ? "bg-[#2563eb] text-white shadow-[0_6px_16px_rgba(37,99,235,0.25)]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/80",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => navigate("/signup")}
              className={cn(
                "group flex flex-col overflow-hidden text-left transition hover:border-sky-200 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]",
                landingTheme.panelSoft,
              )}
            >
              {/* 스토어 imageScale은 큰 타일용 — 랜딩 h-40에서는 잘리므로 적용하지 않음 */}
              <div className="flex h-40 items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-white p-4 sm:h-44">
                <img
                  src={product.image}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 border-t border-slate-100 px-4 py-3.5">
                <p className={`font-semibold ${landingTheme.headline}`}>
                  {product.name}
                </p>
                <p className={`text-xs ${landingTheme.muted}`}>{product.blurb}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-600">
                  제품 보기
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
