import { useCallback, useRef, useEffect } from "react";

export interface PaginationState {
  page: number;
  hasMore: boolean;
  isFetching: boolean;
  lastFetchTime: number;
  bootstrapLoads: number;
}

export function usePagination(
  fetchRequestsCore: (silent: boolean, append: boolean) => Promise<any>,
  pageLimit: number,
) {
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const bootstrapLoadsRef = useRef(0);

  const fetchNextPage = useCallback(async () => {
    if (isFetchingPageRef.current) return;
    if (!hasMoreRef.current) return;

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    if (timeSinceLastFetch < 500) {
      console.log(
        "[RequestPage] Throttling fetchNextPage, too soon since last fetch",
      );
      return;
    }

    isFetchingPageRef.current = true;
    lastFetchTimeRef.current = now;
    try {
      pageRef.current += 1;
      await fetchRequestsCore(true, true);
    } finally {
      isFetchingPageRef.current = false;
    }
  }, [fetchRequestsCore]);

  const resetPagination = useCallback(() => {
    pageRef.current = 1;
    hasMoreRef.current = true;
  }, []);

  return {
    pageRef,
    hasMoreRef,
    isFetchingPageRef,
    lastFetchTimeRef,
    bootstrapLoadsRef,
    fetchNextPage,
    resetPagination,
  };
}

export function useInfiniteScroll(
  sentinelRef: React.RefObject<HTMLDivElement>,
  visibleCount: number,
  filteredLength: number,
  hasMore: boolean,
  fetchNextPage: () => Promise<void>,
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>,
  userScrolledRef: React.RefObject<boolean>,
) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!userScrolledRef.current) return;
        if (visibleCount >= filteredLength - 3 && hasMore) {
          void fetchNextPage();
        }
        if (visibleCount < filteredLength) {
          setVisibleCount((prev) => prev + 9);
        }
      },
      { threshold: 0.2 },
    );

    const target = sentinelRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
      observer.disconnect();
    };
  }, [
    visibleCount,
    filteredLength,
    fetchNextPage,
    sentinelRef,
    hasMore,
    setVisibleCount,
    userScrolledRef,
  ]);
}
