import { useMemo } from "react";

export interface QueueSlotItem {
  [key: string]: any;
}

export interface QueueSlots<T extends QueueSlotItem = QueueSlotItem> {
  currentSlot: T | null;
  nextSlot: T | null;
}

export const useQueueSlots = <T extends QueueSlotItem = QueueSlotItem>(
  items: T[],
): QueueSlots<T> => {
  return useMemo(() => {
    const validItems = Array.isArray(items) ? items : [];

    return {
      currentSlot: validItems[0] ?? null,
      nextSlot: validItems[1] ?? null,
    };
  }, [items]);
};
