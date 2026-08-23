// change-log:
// - 2026-08-23: 스토어 전용 장바구니. 크레딧·커스텀어벗과 합치지 않음(별도 persist key).
// - 2026-08-23: 스토어 장바구니(localStorage).
// related files:
// - web/frontend/src/pages/requestor/store/RequestorStoreCartPage.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StoreCartLine = {
  productId: string;
  qty: number;
};

type StoreCartState = {
  lines: StoreCartLine[];
  addItem: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalQty: () => number;
};

/** 크레딧 충전·커스텀어벗 주문과 키/스토어를 공유하지 않음. */
export const STORE_CART_STORAGE_KEY = "abuts_store_cart_v1";

export const useStoreCartStore = create<StoreCartState>()(
  persist(
    (set, get) => ({
      lines: [],
      addItem: (productId, qty = 1) => {
        const id = String(productId || "").trim();
        const add = Math.max(1, Math.round(Number(qty) || 1));
        if (!id) return;
        set((state) => {
          const existing = state.lines.find((l) => l.productId === id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.productId === id ? { ...l, qty: l.qty + add } : l,
              ),
            };
          }
          return { lines: [...state.lines, { productId: id, qty: add }] };
        });
      },
      setQty: (productId, qty) => {
        const id = String(productId || "").trim();
        const next = Math.round(Number(qty) || 0);
        if (!id) return;
        set((state) => {
          if (next <= 0) {
            return { lines: state.lines.filter((l) => l.productId !== id) };
          }
          return {
            lines: state.lines.map((l) =>
              l.productId === id ? { ...l, qty: next } : l,
            ),
          };
        });
      },
      removeItem: (productId) => {
        const id = String(productId || "").trim();
        set((state) => ({
          lines: state.lines.filter((l) => l.productId !== id),
        }));
      },
      clear: () => set({ lines: [] }),
      totalQty: () =>
        get().lines.reduce((sum, l) => sum + Math.max(0, Number(l.qty) || 0), 0),
    }),
    { name: STORE_CART_STORAGE_KEY },
  ),
);
