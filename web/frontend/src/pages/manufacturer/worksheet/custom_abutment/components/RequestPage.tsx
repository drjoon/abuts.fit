// change-log:
// - 2026-09-03: 준비 탭「라이노 작업중」중단 — 샘플 삭제 / 일반 의뢰 stl cancel-regeneration.
// - 2026-08-23: 워크시트 스크롤바 — 작업영역 카드 오른쪽 끝에 붙이도록 nested scroll breakout.
// - 2026-08-18: Filled STL/NC 재생성 완료 상단 alert 제거.
// - 2026-08-11: 디자인 어벗 파일 선택은 STL만 허용.
// - 2026-08-11: 디자인 클레임 목록 갱신 — 프론트 타이머 제거, websocket(request:design-claim-changed)만 사용.
// - 2026-08-11: transferChat(의뢰수신) 빈/로딩 시 빈 상태 카드 미표시(상위 전송 내역과 중복 방지).
// - 2026-08-10: 디자인 승인=완성 어벗 STL 업로드 후 design-handoff(제조사 가공).
// - 2026-08-10: detailMode=transferChat — 디자인 큐는 기공의뢰서형 카드·채팅 모달(PreviewModal 미사용).
// - 2026-08-04: 컨텐츠 영역 검색 바 제거. 헤더 worksheetSearch만 사용(중복 제거).
// - 2026-08-03: 제조사 워크시트의 공정 필터 기본값 및 탭 라벨을 '준비'로 표시되도록 수정함. (display-only)
// - 2026-08-03: request(준비) 탭 API 조회를 `manufacturerStageIn=준비` 단일값으로 정리.
// - 2026-08-04: 오늘 발송 체크 해제 시 mailbox summary/details 캐시를 강제 갱신하도록 수정
// - impact: deriveStageForFilter, computeStageLabel, realtime badge 처리 로직에 영향
// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/shipping.controller.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxManagement.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/regenerationPending.ts
// - web/frontend/rules.md
import {
  useMemo,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { useToast } from "@/shared/hooks/use-toast";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  stageOrder,
  getDiameterBucketIndex,
  getReviewStageKeyByTab,
  isAnySampleRequest,
  isRndSampleRequest,
  getWorksheetStageFilterForTab,
  PRODUCT_MODE,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  filterRequestsByStage,
  filterAndSortRequests,
  mergeTransientRealtimeProgress,
  isPrePickupShippingVisible,
  shouldShowRequestInIncludeCompleted,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import {
  usePagination,
  useInfiniteScroll,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestPagination";
import {
  MailboxGrid,
  type MailboxRefreshOptions,
  type MailboxSummaryItem,
} from "../shipping/components/MailboxGrid";
import { MailboxContentsModal } from "../shipping/components/MailboxContentsModal";
import { WorksheetCardGrid } from "./WorksheetCardGrid";
import { MachiningQueueBoard } from "../machining/MachiningQueueBoard";
import { PreviewModal } from "./PreviewModal";
import { DesignRequestTransferView } from "@/pages/requestor/design/DesignRequestTransferView";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useStageDropHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useStageDropHandlers";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { useRequestPageState } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestPageState";
import { useMailboxManagement } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxManagement";
import { useRequestCardHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestCardHandlers";
import { useCardActions } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions";
import { useRequestFiltering } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFiltering";
import {
  markFilledStlRegenerationPending,
  markNcRegenerationPending,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/regenerationPending";
import { resolveAdminVerifiedHexFromRequest, normalizeManufacturerHexRotationMode } from "@/pages/manufacturer/worksheet/custom_abutment/utils/hexRotation";
import type { ManufacturerHexRotationMode } from "@/pages/manufacturer/worksheet/custom_abutment/utils/hexRotation";
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// useRequestNavigation 제거: 승인 후 다음 의뢰 자동 열기 방지 정책에 따라 미사용
import { usePackingSelection } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePackingSelection";
import { useMailboxSync } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxSync";
import { useDiameterQueue } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useDiameterQueue";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import { BodyPortal } from "@/shared/ui/BodyPortal";
import { pickOsFilesViaInput } from "@/shared/files/pickOsFilesViaInput";
import { PRACTICE_TRANSFER_STL_ACCEPT } from "@/shared/practice/practiceTransferAccept";
import {
  RemakeStartQuickModal,
  type RemakeQuickStartStage,
} from "./RemakeStartQuickModal";

const MAILBOX_DETAILS_CACHE_TTL_MS = 60 * 1000;
// change-log:
// - 2026-08-11: 우편함 상세 stale-while-revalidate + hover prefetch + requestIds 단축 조회
// - 2026-08-07: 우편함 상세 캐시 TTL 1h→30s, 캐시 hit여도 항상 재조회로 출고일 동기화.
const MAILBOX_DETAILS_STORAGE_PREFIX = "ca:shipping:mailbox-details:";

export const RequestPage = ({
  showQueueBar = true,
  showBulkCamRegenerate = true,
  filterRequests,
  productMode,
  productModeNe,
  useManufacturerQueueList = false,
  detailMode = "preview",
}: {
  showQueueBar?: boolean;
  /** 준비/CAM 탭의 전체 Filled STL·가공 준비 재생성 버튼 */
  showBulkCamRegenerate?: boolean;
  filterRequests?: (req: ManufacturerRequest) => boolean;
  /** API: caseInfos.productMode 일치 (디자인 페이지) */
  productMode?: string;
  /** API: caseInfos.productMode 제외 (가공작업 준비) */
  productModeNe?: string;
  /** 지정 의뢰자(디자인 파트너)도 제조사 큐 `/api/requests/all` 사용 */
  useManufacturerQueueList?: boolean;
  /** preview=제조 PreviewModal, transferChat=기공의뢰서형 상세/채팅(디자인 큐) */
  detailMode?: "preview" | "transferChat";
}) => {
  const isTransferChatDetail = detailMode === "transferChat";
  const queryClient = useQueryClient();
  const { user, token } = useAuthStore();
  const canUseManufacturerQueue =
    user?.role === "manufacturer" ||
    user?.role === "admin" ||
    user?.role === "internalLab" ||
    (useManufacturerQueueList && user?.role === "requestor");
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTabStage = String(searchParams.get("stage") || "request").trim();
  // 작업 공정 변경: CAM 탭 비노출. legacy cam URL은 machining 탭으로 동작시킨다.
  const tabStage = rawTabStage === "cam" ? "machining" : rawTabStage;
  const isCamStage = false;
  const isMachiningStage = tabStage === "machining";

  const DEFAULT_PAGE_LIMIT = 12;
  const SHIPPING_PAGE_LIMIT = 200;
  const effectivePageLimit =
    tabStage === "shipping" ? SHIPPING_PAGE_LIMIT : DEFAULT_PAGE_LIMIT;

  const pageState = useRequestPageState();
  const [mailboxSummaries, setMailboxSummaries] = useState<
    MailboxSummaryItem[]
  >([]);
  const mailboxSummarySnapshotRef = useRef<{
    fetchedAt: number;
    payload: { mailboxes: MailboxSummaryItem[]; totalRequests: number };
  } | null>(null);
  const mailboxSummaryInFlightRef = useRef<Promise<{
    success: boolean;
    data: { mailboxes: MailboxSummaryItem[]; totalRequests: number };
  }> | null>(null);
  const mailboxDetailsCacheRef = useRef<
    Record<string, { fetchedAt: number; requests: ManufacturerRequest[] }>
  >({});
  const mailboxDetailsInFlightRef = useRef<
    Record<string, Promise<ManufacturerRequest[]>>
  >({});
  const openMailboxAddressRef = useRef("");

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      const eucKrDecoder = new TextDecoder("euc-kr", { fatal: false });
      return eucKrDecoder.decode(buffer);
    } catch (error) {
      console.error("Error decoding NC text:", error);
      return utf8Text;
    }
  }, []);

  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const pendingStageTransitionToastRef = useRef<
    Record<
      string,
      {
        toastId: string;
        expectedStages: string[];
        createdAt: number;
      }
    >
  >({});

  const fetchRequestsCore = useCallback(
    async (
      silent = false,
      append = false,
      options?: { forceMailboxRefresh?: boolean },
    ) => {
      if (!token) return null;

      try {
        if (!silent) pageState.setIsLoading(true);
        const basePath =
          user?.role === "admin"
            ? "/api/admin/requests"
            : canUseManufacturerQueue
              ? "/api/requests/all"
              : "/api/requests";
        const stageFilterForTab = getWorksheetStageFilterForTab(
          tabStage,
          showCompleted,
        );



        if (tabStage === "shipping") {
          if (append) {
            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
            return [] as ManufacturerRequest[];
          }

          const applySummaryPayload = (payload: {
            mailboxes: MailboxSummaryItem[];
            totalRequests: number;
          }) => {
            const mailboxList = Array.isArray(payload?.mailboxes)
              ? payload.mailboxes
              : [];
            setMailboxSummaries(mailboxList);
            pageState.setRequests([]);

            pageState.setServerTotal(
              Number.isFinite(payload?.totalRequests)
                ? Number(payload.totalRequests)
                : mailboxList.reduce(
                    (acc, item) => acc + Number(item?.requestCount || 0),
                    0,
                  ),
            );

            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
          };

          const summaryCache = mailboxSummarySnapshotRef.current;
          const nowTs = Date.now();
          const CLIENT_CACHE_TTL_MS = 60 * 60 * 1000;
          if (
            !options?.forceMailboxRefresh &&
            summaryCache &&
            nowTs - summaryCache.fetchedAt <= CLIENT_CACHE_TTL_MS
          ) {
            applySummaryPayload(summaryCache.payload);
            return [] as ManufacturerRequest[];
          }

          if (!mailboxSummaryInFlightRef.current) {
            mailboxSummaryInFlightRef.current = (async () => {
              const summaryUrl = options?.forceMailboxRefresh
                ? `/api/requests/shipping/mailbox-summary?refresh=1&t=${Date.now()}`
                : "/api/requests/shipping/mailbox-summary";
              const summaryRes = await fetch(summaryUrl, {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (summaryRes.status === 304) {
                if (mailboxSummarySnapshotRef.current?.payload) {
                  return {
                    success: true,
                    data: mailboxSummarySnapshotRef.current.payload,
                  };
                }
                throw new Error("우편함 요약 캐시를 찾지 못했습니다.");
              }

              const summaryJson = await summaryRes.json().catch(() => ({}));
              if (!summaryRes.ok || !summaryJson?.success) {
                throw new Error("우편함 요약 불러오기에 실패했습니다.");
              }
              return summaryJson;
            })().finally(() => {
              mailboxSummaryInFlightRef.current = null;
            });
          }

          try {
            const summaryJson = await mailboxSummaryInFlightRef.current;
            const payload = {
              mailboxes: Array.isArray(summaryJson?.data?.mailboxes)
                ? (summaryJson.data.mailboxes as MailboxSummaryItem[])
                : [],
              totalRequests: Number(summaryJson?.data?.totalRequests || 0),
            };
            mailboxSummarySnapshotRef.current = {
              fetchedAt: Date.now(),
              payload,
            };
            applySummaryPayload(payload);
          } catch {
            toast({
              title: "우편함 요약 불러오기 실패",
              description: "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
            return null;
          }

          if (!silent) {
            void queryClient.invalidateQueries({
              queryKey: ["worksheet-assigned-summary"],
            });
            void queryClient.refetchQueries({
              queryKey: ["worksheet-assigned-summary"],
              type: "active",
            });
          }

          return [] as ManufacturerRequest[];
        }

        setMailboxSummaries([]);

        const buildPath = (targetPage: number) => {
          const url = new URL(basePath, window.location.origin);
          url.searchParams.set("page", String(targetPage));
          url.searchParams.set("limit", String(effectivePageLimit));
          url.searchParams.set("view", "worksheet");
          if (tabStage === "shipping") {
            url.searchParams.set("worksheetProfile", "shipping");
          }
          if (tabStage === "rnd") {
            url.searchParams.set("rndDone", "1");
            url.searchParams.set("rndUnmachinable", "0");
          } else if (tabStage === "unmachinable") {
            url.searchParams.set("rndUnmachinable", "1");
          } else {
            // 일반 공정 탭은 작업용 샘플(doneAt=null)만 처리한다.
            // R&D 보관 샘플(doneAt!=null)은 R&D 탭 전용.
            url.searchParams.set("rndDone", "0");
            url.searchParams.set("rndUnmachinable", "0");
          }
          url.searchParams.set("includeTotal", append ? "0" : "1");
          if (tabStage === "shipping" || tabStage === "tracking") {
            url.searchParams.set("includeDelivery", "1");
          }
          if (stageFilterForTab.length === 1) {
            url.searchParams.set("manufacturerStage", stageFilterForTab[0]);
          } else if (stageFilterForTab.length > 1) {
            for (const stage of stageFilterForTab) {
              url.searchParams.append("manufacturerStageIn", stage);
            }
          }
          if (productMode) {
            url.searchParams.set("productMode", productMode);
          }
          if (productModeNe) {
            url.searchParams.set("productModeNe", productModeNe);
          }
          return url.pathname + url.search;
        };

        const fetchPage = async (targetPage: number) => {
          const path = buildPath(targetPage);

          const res = await fetch(path, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          });

          if (!res.ok) {
            return {
              ok: false,
              list: [] as ManufacturerRequest[],
              total: null,
            };
          }

          const data = await res.json();
          const raw = data?.data;
          const pageList = Array.isArray(raw?.requests)
            ? raw.requests
            : Array.isArray(raw)
              ? raw
              : [];


          const total =
            typeof raw?.pagination?.total === "number"
              ? raw.pagination.total
              : null;

          return {
            ok: Boolean(data?.success),
            list: pageList as ManufacturerRequest[],
            total,
          };
        };

        const firstPage = await fetchPage(pageRef.current);
        if (!firstPage.ok) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return null;
        }

        let list = firstPage.list;
        let totalFromServer = firstPage.total;

        if (tabStage === "shipping" && !append) {
          let currentPage = pageRef.current;
          let merged = [...firstPage.list];
          let lastBatchSize = firstPage.list.length;

          while (lastBatchSize >= effectivePageLimit) {
            currentPage += 1;
            const nextPage = await fetchPage(currentPage);
            if (!nextPage.ok || !nextPage.list.length) {
              break;
            }
            merged = merged.concat(nextPage.list);
            lastBatchSize = nextPage.list.length;
            if (typeof nextPage.total === "number") {
              totalFromServer = nextPage.total;
            }
          }

          list = merged;
        }

        if (Array.isArray(list)) {
          if (!append && typeof totalFromServer === "number") {
            pageState.setServerTotal(totalFromServer);
          }
          if (append) {
            pageState.setRequests((prev) => {
              const map = new Map<string, any>();
              for (const r of prev)
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              for (const r of list)
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              return mergeTransientRealtimeProgress(
                prev,
                Array.from(map.values()) as any[],
              );
            });
          } else {
            // append=false: 페이지 새로고침이므로 prev를 무시하고 list만 사용
            // realtimeProgress만 prev에서 복원
            pageState.setRequests((prev) =>
              mergeTransientRealtimeProgress(
                prev,
                list as ManufacturerRequest[],
              ),
            );
          }
          if (tabStage === "shipping" && !append) {
            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
          } else {
            pageState.hasMoreRefForCore.current =
              list.length >= effectivePageLimit;
            hasMoreRef.current = list.length >= effectivePageLimit;
          }
          if (append && list.length > 0) {
            pageState.setVisibleCount((prev) => prev + list.length);
          }

          // 상단 워크시트 요약(assigned/dashboard-summary) 호출 정책:
          // - 최초 페이지 로드(append=false && silent=false) 1회
          // - 무한스크롤 추가 로드(append=true) 시 1회
          // - 실시간 동기화용 조용한 리로드(append=false && silent=true)는 호출하지 않음
          const shouldRefreshWorksheetSummary = append || !silent;
          if (shouldRefreshWorksheetSummary) {
            void queryClient.invalidateQueries({
              queryKey: ["worksheet-assigned-summary"],
            });
            void queryClient.refetchQueries({
              queryKey: ["worksheet-assigned-summary"],
              type: "active",
            });
          }
        } else {
          pageState.hasMoreRefForCore.current = false;
          hasMoreRef.current = false;
        }

        return list as ManufacturerRequest[];
      } catch (error) {
        console.error("Error fetching requests:", error);
        pageState.hasMoreRefForCore.current = false;
        hasMoreRef.current = false;
        if (!silent) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "네트워크 오류가 발생했습니다.",
            variant: "destructive",
          });
        }
        return null;
      } finally {
        if (!silent) pageState.setIsLoading(false);
      }
    },
    [
      token,
      user?.role,
      canUseManufacturerQueue,
      toast,
      tabStage,
      rawTabStage,
      isMachiningStage,
      showCompleted,
      effectivePageLimit,
      pageState,
      productMode,
      productModeNe,
      queryClient,
    ],
  );

  const { pageRef, hasMoreRef, fetchNextPage, resetPagination } = usePagination(
    fetchRequestsCore,
    effectivePageLimit,
  );

  const fetchRequests = useCallback(
    async (silent = false, options?: { forceMailboxRefresh?: boolean }) => {
      resetPagination();
      return await fetchRequestsCore(silent, false, options);
    },
    [fetchRequestsCore, resetPagination],
  );

  const refreshRequests = useCallback(
    async (silent = false, options?: { forceMailboxRefresh?: boolean }) => {
      resetPagination();
      return await fetchRequestsCore(silent, false, options);
    },
    [fetchRequestsCore, resetPagination],
  );

  const reloadRequests = useCallback(
    async (forceMailboxRefresh = false) => {
      await refreshRequests(false, { forceMailboxRefresh });
    },
    [refreshRequests],
  );

  const clearMailboxDetailsCache = useCallback(() => {
    mailboxDetailsCacheRef.current = {};
    mailboxDetailsInFlightRef.current = {};

    if (typeof window === "undefined") return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (!key.startsWith(MAILBOX_DETAILS_STORAGE_PREFIX)) continue;
        keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // noop
    }
  }, []);

  const handleMailboxGridRefresh = useCallback(
    async (options?: MailboxRefreshOptions) => {
      if (options?.invalidateMailboxDetailsCache) {
        clearMailboxDetailsCache();
      }
      await reloadRequests(true);
    },
    [clearMailboxDetailsCache, reloadRequests],
  );

  const mailboxState = useMailboxManagement(token, async () => {
    clearMailboxDetailsCache();
    await fetchRequests(true, { forceMailboxRefresh: true });
  });

  // related files:
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx
  // - web/backend/controllers/requests/shipping.controller.js
  const resolveMailboxCacheEntry = useCallback(
    (normalizedAddress: string) => {
      const storageKey = `${MAILBOX_DETAILS_STORAGE_PREFIX}${normalizedAddress}`;
      const inMemoryCacheEntry =
        mailboxDetailsCacheRef.current[normalizedAddress] || null;

      let persistedCacheEntry: {
        fetchedAt: number;
        requests: ManufacturerRequest[];
      } | null = null;

      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              fetchedAt?: number;
              requests?: ManufacturerRequest[];
            };
            const parsedFetchedAt = Number(parsed?.fetchedAt || 0);
            const parsedRequests = Array.isArray(parsed?.requests)
              ? parsed.requests
              : [];
            if (parsedFetchedAt > 0) {
              persistedCacheEntry = {
                fetchedAt: parsedFetchedAt,
                requests: parsedRequests,
              };
            }
          }
        } catch {
          // noop
        }
      }

      const cachedEntry = inMemoryCacheEntry || persistedCacheEntry;
      if (cachedEntry && !inMemoryCacheEntry) {
        mailboxDetailsCacheRef.current[normalizedAddress] = cachedEntry;
      }
      return { cachedEntry, storageKey };
    },
    [],
  );

  const fetchMailboxDetailsRequests = useCallback(
    async (mailboxAddress: string, options?: { force?: boolean }) => {
      const normalizedAddress = String(mailboxAddress || "")
        .trim()
        .toUpperCase();
      if (!normalizedAddress || !token) return [];

      const summary = mailboxSummaries.find(
        (item) =>
          String(item?.mailboxAddress || "")
            .trim()
            .toUpperCase() === normalizedAddress,
      );
      const expectedRequestCount = Number(summary?.requestCount || 0);
      const requestIds = Array.isArray(summary?.requestIds)
        ? summary!.requestIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
            .slice(0, 200)
        : [];

      const { cachedEntry, storageKey } =
        resolveMailboxCacheEntry(normalizedAddress);
      const now = Date.now();
      const hasFreshCache =
        Boolean(cachedEntry) &&
        now - Number(cachedEntry?.fetchedAt || 0) <
          MAILBOX_DETAILS_CACHE_TTL_MS;
      const cachedRequestCount = Array.isArray(cachedEntry?.requests)
        ? cachedEntry!.requests.length
        : 0;
      const hasCountMismatchWithSummary =
        Boolean(cachedEntry) && cachedRequestCount !== expectedRequestCount;
      const hasUsableFreshCache =
        hasFreshCache && !hasCountMismatchWithSummary && !options?.force;

      if (hasUsableFreshCache) {
        return cachedEntry?.requests || [];
      }

      let inFlight = mailboxDetailsInFlightRef.current[normalizedAddress];
      if (!inFlight) {
        inFlight = (async () => {
          const params = new URLSearchParams({
            mailboxAddress,
          });
          if (requestIds.length > 0) {
            params.set("requestIds", requestIds.join(","));
          }
          const response = await fetch(
            `/api/requests/shipping/mailbox-requests?${params.toString()}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            },
          );

          if (!response.ok) {
            throw new Error("우편함 상세 조회에 실패했습니다.");
          }

          const body = await response.json();
          const detailRequests = Array.isArray(body?.data?.requests)
            ? (body.data.requests as ManufacturerRequest[])
            : [];

          const shouldPersistCache =
            detailRequests.length > 0 || expectedRequestCount === 0;

          if (shouldPersistCache) {
            const nextCacheEntry = {
              fetchedAt: Date.now(),
              requests: detailRequests,
            };

            mailboxDetailsCacheRef.current[normalizedAddress] = nextCacheEntry;
            if (typeof window !== "undefined") {
              try {
                window.localStorage.setItem(
                  storageKey,
                  JSON.stringify(nextCacheEntry),
                );
              } catch {
                // noop
              }
            }
          } else {
            delete mailboxDetailsCacheRef.current[normalizedAddress];
            if (typeof window !== "undefined") {
              try {
                window.localStorage.removeItem(storageKey);
              } catch {
                // noop
              }
            }
          }

          return detailRequests;
        })().finally(() => {
          delete mailboxDetailsInFlightRef.current[normalizedAddress];
        });

        mailboxDetailsInFlightRef.current[normalizedAddress] = inFlight;
      }

      return inFlight;
    },
    [mailboxSummaries, resolveMailboxCacheEntry, token],
  );

  const handlePrefetchMailboxDetails = useCallback(
    (address: string) => {
      const mailboxAddress = String(address || "").trim();
      if (!mailboxAddress || !token) return;
      void fetchMailboxDetailsRequests(mailboxAddress).catch(() => {
        // prefetch 실패는 무시 (클릭 시 재시도)
      });
    },
    [fetchMailboxDetailsRequests, token],
  );

  const handleOpenMailboxDetails = useCallback(
    async (address: string) => {
      const mailboxAddress = String(address || "").trim();
      if (!mailboxAddress || !token) return;

      const normalizedAddress = mailboxAddress.toUpperCase();
      const expectedRequestCount = Number(
        mailboxSummaries.find(
          (item) =>
            String(item?.mailboxAddress || "")
              .trim()
              .toUpperCase() === normalizedAddress,
        )?.requestCount || 0,
      );

      const { cachedEntry } = resolveMailboxCacheEntry(normalizedAddress);
      const cachedRequestCount = Array.isArray(cachedEntry?.requests)
        ? cachedEntry!.requests.length
        : 0;
      const hasCountMismatchWithSummary =
        Boolean(cachedEntry) && cachedRequestCount !== expectedRequestCount;
      const hasUsableStaleCache =
        Boolean(cachedEntry) &&
        !hasCountMismatchWithSummary &&
        cachedRequestCount > 0;

      const requestsFromCurrentPage = pageState.requests.filter((req) => {
        const reqMailboxAddress = String(req.mailboxAddress || "")
          .trim()
          .toUpperCase();
        return reqMailboxAddress === normalizedAddress;
      });

      const initialRequests = hasUsableStaleCache
        ? cachedEntry?.requests || []
        : requestsFromCurrentPage.length > 0
          ? requestsFromCurrentPage
          : [];

      // 클릭 즉시 모달 오픈. stale 캐시/페이지 데이터가 있으면 로딩 스피너 없이 표시하고 백그라운드 재동기화.
      openMailboxAddressRef.current = normalizedAddress;
      mailboxState.setIsMailboxDetailsLoading(initialRequests.length === 0);

      await mailboxState.handleRegisterShipment(
        mailboxAddress,
        initialRequests,
      );

      const applyDetailRequests = (detailRequests: ManufacturerRequest[]) => {
        if (openMailboxAddressRef.current !== normalizedAddress) return;
        mailboxState.setMailboxModalRequests(detailRequests);
      };

      if (initialRequests.length > 0) {
        void fetchMailboxDetailsRequests(mailboxAddress, { force: true })
          .then(applyDetailRequests)
          .catch(() => {
            // 이미 표시 중이므로 백그라운드 실패는 무시
          })
          .finally(() => {
            mailboxState.setIsMailboxDetailsLoading(false);
          });
        return;
      }

      try {
        // 캐시/프리패치로 즉시 표시한 뒤에도 timeline·출고일은 네트워크로 재동기화
        const detailRequests = await fetchMailboxDetailsRequests(
          mailboxAddress,
          { force: true },
        );
        applyDetailRequests(detailRequests);
      } catch (error) {
        toast({
          title: "우편함 상세 조회 실패",
          description:
            error instanceof Error && error.message
              ? error.message
              : "우편함 상세 조회 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        mailboxState.setIsMailboxDetailsLoading(false);
      }
    },
    [
      fetchMailboxDetailsRequests,
      mailboxState,
      mailboxSummaries,
      pageState.requests,
      resolveMailboxCacheEntry,
      toast,
      token,
    ],
  );

  const currentStageForTab = isMachiningStage
    ? "가공"
    : tabStage === "rnd" || tabStage === "unmachinable"
        ? "추적관리"
        : tabStage === "shipping"
          ? "포장.발송"
          : tabStage === "tracking"
            ? "추적관리"
            : "준비";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const matchesCurrentPage = useCallback(
    (req: ManufacturerRequest) => {
      const isDoneRndSample = isRndSampleRequest(req);
      const isUnmachinable = Boolean((req as any)?.rnd?.unmachinableAt);
      if (tabStage === "rnd") {
        return isDoneRndSample && !isUnmachinable;
      }
      if (tabStage === "unmachinable") {
        return isUnmachinable;
      }
      // 일반 공정 탭은 작업용 샘플(doneAt=null)만 처리하고,
      // R&D 보관 샘플(doneAt!=null)은 제외한다.
      if (isDoneRndSample || isUnmachinable) {
        return false;
      }

      if (filterRequests) {
        return filterRequests(req);
      }

      if (showCompleted && tabStage !== "tracking") {
        return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
      }
      const stage = deriveStageForFilter(req);
      if (tabStage === "request") {
        const requestReviewStatus = String(
          req?.caseInfos?.reviewByStage?.request?.status || "",
        )
          .trim()
          .toUpperCase();
        // request 탭에서는 준비 단계만 노출한다.
        // 승인 완료 건은 NC 콜백 직전 일시 상태를 제외하기 위해 숨긴다.
        return stage === "준비" && requestReviewStatus !== "APPROVED";
      }
      if (isMachiningStage) {
        return stage === "가공";
      }
      if (tabStage === "packing") {
        return stage === "세척.패킹";
      }
      if (tabStage === "shipping") {
        return stage === "포장.발송";
      }
      if (tabStage === "tracking") {
        return stage === "추적관리";
      }
      return true;
    },
    [
      currentStageOrder,
      filterRequests,
      isMachiningStage,
      showCompleted,
      tabStage,
    ],
  );

  useEffect(() => {
    pageState.pageRefForCore.current = pageRef.current;
    pageState.hasMoreRefForCore.current = hasMoreRef.current;
  }, [pageRef, hasMoreRef, pageState]);

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage,
    isMachiningStage,
    tabStage,
    decodeNcText,
    setPreviewLoading: pageState.setPreviewLoading,
    setPreviewNcText: pageState.setPreviewNcText,
    setPreviewNcName: pageState.setPreviewNcName,
    setPreviewStageUrl: pageState.setPreviewStageUrl,
    setPreviewStageName: pageState.setPreviewStageName,
    setPreviewFiles: pageState.setPreviewFiles,
    setPreviewOpen: pageState.setPreviewOpen,
  });

  const {
    handleDownloadOriginalStl,
    handleDownloadCamStl,
    handleDownloadNcFile,
    handleDownloadStageFile,
    handleUpdateReviewStatus,
    handleDeleteCam,
    handleDeleteNc,
    handleUploadCam,
    handleUploadNc,
    handleUploadStageFile,
    handleDeleteStageFile,
  } = useRequestFileHandlers({
    token,
    stage: tabStage,
    isCamStage,
    isMachiningStage,
    fetchRequests: reloadRequests,
    setRequests: pageState.setRequests,
    matchesCurrentPage,
    setDownloading: pageState.setDownloading,
    setUploading: pageState.setUploading,
    setDeletingCam: pageState.setDeletingCam,
    setDeletingNc: pageState.setDeletingNc,
    setReviewSaving: pageState.setReviewSaving,
    setPreviewOpen: pageState.setPreviewOpen,
    setPreviewFiles: pageState.setPreviewFiles,
    setPreviewNcText: pageState.setPreviewNcText,
    setPreviewNcName: pageState.setPreviewNcName,
    setPreviewStageUrl: pageState.setPreviewStageUrl,
    setPreviewStageName: pageState.setPreviewStageName,
    setPreviewLoading: pageState.setPreviewLoading,
    setSearchParams,
    setUploadProgress: pageState.setUploadProgress,
    decodeNcText,
  });

  const blockedPreviewReopenRef = useRef<{
    requestId: string;
    requestMongoId: string;
    untilMs: number;
  } | null>(null);

  const handlePreviewOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const currentReq = pageState.previewFiles?.request as
          | ManufacturerRequest
          | undefined;
        blockedPreviewReopenRef.current = {
          requestId: String(currentReq?.requestId || "").trim(),
          requestMongoId: String(currentReq?._id || "").trim(),
          untilMs: Date.now() + 2000,
        };
      }
      pageState.setPreviewOpen(nextOpen);
    },
    [pageState.previewFiles, pageState.setPreviewOpen],
  );

  const handleOpenPreviewWithSameReopenGuard = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: {
        forceRefresh?: boolean;
        openOnlyIfAlreadyOpen?: boolean;
        silent?: boolean;
      },
    ) => {
      const rid = String(req?.requestId || "").trim();
      const mid = String(req?._id || "").trim();
      const blocked = blockedPreviewReopenRef.current;
      if (
        blocked &&
        ((rid && blocked.requestId === rid) ||
          (mid && blocked.requestMongoId === mid))
      ) {
        if (Date.now() <= Number(blocked.untilMs || 0)) {
          return false;
        }
      }
      blockedPreviewReopenRef.current = null;
      await handleOpenPreview(req, opts);
      return true;
    },
    [handleOpenPreview],
  );

  const { realtimeBaseRef } = useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests: pageState.setRequests,
    fetchRequests,
    fetchRequestsCore,
    previewOpen: pageState.previewOpen,
    previewFiles: pageState.previewFiles,
    handleOpenPreview: handleOpenPreviewWithSameReopenGuard,
    removeOnMachiningComplete: true,
    matchesCurrentPage,
    pendingStageTransitionToastRef,
  });

  const {
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    isDraggingOver,
    ocrProcessing,
  } = useStageDropHandlers({
    isMachiningStage,
    isCamStage,
    token,
    requests: pageState.requests,
    handleUploadStageFile,
    handleUploadCam,
  });

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      if (isCamStage) return handleUploadCam(req, files);
      if (isMachiningStage) return handleUploadNc(req, files);
      return handleUploadStageFile({
        req,
        stage: tabStage as "machining" | "packing" | "shipping" | "tracking",
        file: files[0],
        source: "manual",
      });
    },
    [
      isCamStage,
      isMachiningStage,
      handleUploadNc,
      handleUploadCam,
      handleUploadStageFile,
      tabStage,
    ],
  );

  const handleUploadFromModal = useCallback(
    (req: ManufacturerRequest, file: File) => {
      if (!req?._id) return;
      void handleUploadByStage(req, [file]);
    },
    [handleUploadByStage],
  );

  const handleSaveToRnd = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      try {
        const res = await fetch(`/api/requests/${req._id}/clone-as-sample`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "R&D 저장에 실패했습니다.");
        }
        toast({
          title: "R&D 저장 완료",
          description: `R&D 페이지로 샘플 복사 저장 완료 (새 의뢰ID: ${data?.data?.requestId || "-"})`,
        });
        // 저장 직후 상단 탭 카운트를 즉시 반영
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        toast({
          title: "R&D 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast, token],
  );

  const handleCloneSampleForProduction = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      try {
        // 생산용 샘플은 R&D 보관(done) 경로가 아니라 작업 복사본(rnd.doneAt=null)으로 생성한다.
        // 탭 기준으로 시작 공정을 고정한다.
        // - 의뢰 탭: 의뢰로 생성
        // - 그 외 단계: 가공으로 생성(허용 시작 공정 제한)
        const startStage = tabStage === "request" ? "의뢰" : "가공";

        const sourceIsRndSample = isRndSampleRequest(req);

        let res: Response;
        if (sourceIsRndSample) {
          // R&D 보관 샘플 원본은 전용 엔드포인트로 작업 복사본(copied_sample) 생성
          res = await fetch(
            `/api/requests/${encodeURIComponent(String(req._id))}/clone-from-sample-to-request`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ startStage }),
            },
          );
        } else {
          // 일반 의뢰/복사샘플은 재제작 복사 엔드포인트 사용
          res = await fetch(`/api/requests/remake-clone`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ requestIds: [req._id], startStage }),
          });
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "샘플 복사에 실패했습니다.");
        }

        const createdCategory = String(
          sourceIsRndSample
            ? data?.data?.requestCategory || ""
            : data?.data?.created?.[0]?.requestCategory || "",
        ).trim();

        if (createdCategory !== "copied_sample") {
          throw new Error(
            `복사 결과가 copied_sample이 아닙니다. (현재: ${createdCategory || "미응답"})`,
          );
        }

        const clonedRequestId =
          data?.data?.created?.[0]?.clonedRequestId || data?.data?.requestId || "-";

        toast({
          title: "샘플 복사 완료",
          description: `복사샘플(copied_sample)을 ${startStage} 공정으로 생성했습니다. (새 의뢰ID: ${clonedRequestId})`,
        });

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
        void reloadRequests();
      } catch (e: any) {
        toast({
          title: "샘플 복사 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [queryClient, reloadRequests, tabStage, toast, token],
  );

  // 샘플 의뢰 삭제 핸들러 (제조사/관리자만 가능)
  const handleCardDelete = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const isSample = isAnySampleRequest(req);
      if (!isSample) {
        toast({
          title: "삭제 불가",
          description: "샘플 의뢰만 삭제할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const mongoId = String(req._id || "").trim();
      const requestId = String(req.requestId || "").trim();
      pageState.setRequests((prev) =>
        prev.filter((item) => {
          const itemMongoId = String(item?._id || "").trim();
          const itemRequestId = String(item?.requestId || "").trim();
          if (mongoId && itemMongoId === mongoId) return false;
          if (requestId && itemRequestId === requestId) return false;
          return true;
        }),
      );
      if (tabStage === "shipping") {
        mailboxState.setMailboxModalRequests((prev) => {
          const next = prev.filter((item) => {
            const itemMongoId = String(item?._id || "").trim();
            const itemRequestId = String(item?.requestId || "").trim();
            if (mongoId && itemMongoId === mongoId) return false;
            if (requestId && itemRequestId === requestId) return false;
            return true;
          });
          if (next.length === 0) {
            mailboxState.handleShipmentModalClose();
          }
          return next;
        });
      }

      try {
        const res = await fetch(`/api/requests/${req._id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "삭제에 실패했습니다.");
        }
        toast({
          title: "삭제 완료",
          description: `의뢰 ${req.requestId}가 삭제되었습니다.`,
        });
        if (tabStage === "shipping") {
          await fetchRequests(true, { forceMailboxRefresh: true });
        }
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) => {
          const exists = prev.some((item) => {
            const itemMongoId = String(item?._id || "").trim();
            const itemRequestId = String(item?.requestId || "").trim();
            return (
              (mongoId && itemMongoId === mongoId) ||
              (requestId && itemRequestId === requestId)
            );
          });
          if (exists) return prev;
          return [req, ...prev];
        });
        if (tabStage === "shipping") {
          await fetchRequests(true, { forceMailboxRefresh: true });
        }

        toast({
          title: "삭제 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [
      fetchRequests,
      mailboxState,
      pageState,
      queryClient,
      tabStage,
      token,
      toast,
    ],
  );

  const [rhinoCancellingIds, setRhinoCancellingIds] = useState<
    Record<string, boolean>
  >({});

  const handleCancelRhinoWork = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id && !req?.requestId) return;

      // 샘플 고스트: 삭제(블러 뒤 X와 동일). 일반 의뢰: Filled STL 생성만 중단.
      if (isAnySampleRequest(req)) {
        await handleCardDelete(req);
        return;
      }

      const requestId = String(req.requestId || "").trim();
      const cancelKey = String(req._id || requestId || "").trim();
      if (!requestId || !cancelKey || !token) {
        toast({
          title: "중단 실패",
          description: !token
            ? "로그인이 필요합니다."
            : "의뢰 식별자가 없습니다.",
          variant: "destructive",
        });
        return;
      }
      if (rhinoCancellingIds[cancelKey]) return;

      setRhinoCancellingIds((prev) => ({ ...prev, [cancelKey]: true }));

      // 낙관적 패치 — 응답 전 블러 해제
      pageState.setRequests((prev) =>
        prev.map((item) => {
          const itemMongoId = String(item?._id || "").trim();
          const itemRequestId = String(item?.requestId || "").trim();
          if (
            (cancelKey && itemMongoId === cancelKey) ||
            (requestId && itemRequestId === requestId)
          ) {
            return {
              ...item,
              productionSchedule: {
                ...(item.productionSchedule || {}),
                stlPreload: {
                  status: "CANCELLED",
                  updatedAt: new Date().toISOString(),
                  error: "filled_stl_regeneration_cancelled",
                },
              },
            };
          }
          return item;
        }),
      );

      try {
        const controller = new AbortController();
        const timeoutRef = window.setTimeout(() => controller.abort(), 20000);
        let res: Response;
        try {
          res = await fetch(
            `/api/requests/by-request/${encodeURIComponent(requestId)}/stl-file/cancel-regeneration`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
              signal: controller.signal,
            },
          );
        } finally {
          window.clearTimeout(timeoutRef);
        }
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(
            body?.message || body?.error || "라이노 작업 중단에 실패했습니다.",
          );
        }

        const patched = body?.data?.request;
        if (patched && typeof patched === "object") {
          pageState.setRequests((prev) =>
            prev.map((item) => {
              const itemMongoId = String(item?._id || "").trim();
              const itemRequestId = String(item?.requestId || "").trim();
              if (
                (cancelKey && itemMongoId === cancelKey) ||
                (requestId && itemRequestId === requestId)
              ) {
                return { ...item, ...patched };
              }
              return item;
            }),
          );
        }

        toast({
          title: "생성 중단",
          description: "라이노 작업을 중단했습니다. Filled STL 재생성으로 다시 시작할 수 있습니다.",
        });
      } catch (e: any) {
        // 롤백: CANCELLED 제거 → 블러 복원
        pageState.setRequests((prev) =>
          prev.map((item) => {
            const itemMongoId = String(item?._id || "").trim();
            const itemRequestId = String(item?.requestId || "").trim();
            if (
              (cancelKey && itemMongoId === cancelKey) ||
              (requestId && itemRequestId === requestId)
            ) {
              const nextSchedule = { ...(item.productionSchedule || {}) };
              delete (nextSchedule as any).stlPreload;
              return { ...item, productionSchedule: nextSchedule };
            }
            return item;
          }),
        );
        toast({
          title: "중단 실패",
          description:
            e?.name === "AbortError"
              ? "중단 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
              : e?.message || "라이노 작업 중단에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setRhinoCancellingIds((prev) => {
          const next = { ...prev };
          delete next[cancelKey];
          return next;
        });
      }
    },
    [handleCardDelete, pageState, rhinoCancellingIds, toast, token],
  );

  const handleCardDone = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const isSample = isAnySampleRequest(req);
      if (!isSample) {
        toast({
          title: "Done 불가",
          description: "R&D 샘플만 Done 처리할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const requestMongoId = String(req._id || "").trim();
      const optimisticDoneAt = new Date().toISOString();
      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              doneAt: optimisticDoneAt,
              doneFromStage:
                String(item.manufacturerStage || "").trim() || null,
            },
            requestCategory: "rnd_sample",
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-done`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ done: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "Done 처리에 실패했습니다.");
        }
        toast({
          title: "Done 완료",
          description: `의뢰 ${req.requestId}가 R&D 탭으로 이동되었습니다.`,
        });

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                doneAt: req?.rnd?.doneAt || null,
              },
              requestCategory: req?.requestCategory || "copied_sample",
            };
          }),
        );

        toast({
          title: "Done 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [pageState, queryClient, toast, token],
  );

  const handleMarkUnmachinable = useCallback(
    async (req: ManufacturerRequest, reasonRaw: string) => {
      if (!req?._id) return;
      const reason = String(reasonRaw || "").slice(0, 500).trim();
      if (!reason) {
        throw new Error("불완전가공 사유를 입력해주세요.");
      }

      const requestMongoId = String(req._id || "").trim();
      const optimisticAt = new Date().toISOString();

      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              unmachinableAt: optimisticAt,
              unmachinableReason: reason,
              unmachinableFromStage:
                String(item.manufacturerStage || "").trim() || null,
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-unmachinable`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unmachinable: true,
            reason,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "불완전가공 처리에 실패했습니다.");
        }

        toast({
          title: "불완전가공 처리 완료",
          description: `의뢰 ${req.requestId}가 불완전가공 탭으로 이동되었습니다.`,
        });

        // 현재 탭 목록에서 해당 의뢰만 즉시 제거해 잔상(이전 탭 잔류)을 방지한다.
        if (tabStage !== "unmachinable") {
          pageState.setRequests((prev) =>
            prev.filter(
              (item) =>
                String(item?._id || "").trim() !== requestMongoId,
            ),
          );
        }

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                unmachinableAt: (req as any)?.rnd?.unmachinableAt || null,
                unmachinableReason:
                  String((req as any)?.rnd?.unmachinableReason || "") || "",
              },
            };
          }),
        );

        toast({
          title: "불완전가공 처리 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });

        throw e;
      }
    },
    [pageState, queryClient, tabStage, toast, token],
  );

  const handleRestoreUnmachinable = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;

      const requestMongoId = String(req._id || "").trim();
      const prevAt = req.rnd?.unmachinableAt || null;
      const prevReason = String(req.rnd?.unmachinableReason || "");
      const prevFromStage = String(req.rnd?.unmachinableFromStage || "") || null;

      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              unmachinableAt: null,
              unmachinableReason: "",
              unmachinableFromStage: prevFromStage,
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-unmachinable`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unmachinable: false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "불완전가공 복귀에 실패했습니다.");
        }

        const restoreStageLabel =
          String(prevFromStage || req.manufacturerStage || "").trim() || "원래";

        toast({
          title: "불완전가공 복귀 완료",
          description: `의뢰 ${req.requestId}가 ${restoreStageLabel} 공정으로 복귀되었습니다.`,
        });

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                unmachinableAt: prevAt,
                unmachinableReason: prevReason,
                unmachinableFromStage: prevFromStage,
              },
            };
          }),
        );

        toast({
          title: "불완전가공 복귀 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });

        throw e;
      }
    },
    [pageState, queryClient, toast, token],
  );

  const [remakeDialogOpen, setRemakeDialogOpen] = useState(false);
  const [remakeSubmitting, setRemakeSubmitting] = useState(false);
  const [remakeSourceRequest, setRemakeSourceRequest] =
    useState<ManufacturerRequest | null>(null);

  const handleSubmitRemake = useCallback(
    async (startStage: RemakeQuickStartStage) => {
      if (!remakeSourceRequest?._id || remakeSubmitting) return;
      try {
        setRemakeSubmitting(true);
        const res = await fetch(
          `/api/requests/${remakeSourceRequest._id}/clone-from-sample-to-request`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ startStage }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "재제작 복사에 실패했습니다.");
        }

        toast({
          title: "재제작 복사 완료",
          description: `의뢰 ${remakeSourceRequest.requestId}가 ${startStage} 공정으로 복사되었습니다. (새 의뢰ID: ${data?.data?.requestId || "-"})`,
        });

        setRemakeDialogOpen(false);
        setRemakeSourceRequest(null);

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
        void reloadRequests();
      } catch (e: any) {
        toast({
          title: "재제작 복사 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      } finally {
        setRemakeSubmitting(false);
      }
    },
    [queryClient, reloadRequests, remakeSourceRequest, remakeSubmitting, toast, token],
  );

  const [rndMemoSaving, setRndMemoSaving] = useState<Record<string, boolean>>(
    {},
  );
  const [, setHexRotationSavingMap] = useState<Record<string, boolean>>({});
  const [anodizingSavingMap, setAnodizingSavingMap] = useState<
    Record<string, boolean>
  >({});
  const [wideSplitSavingMap, setWideSplitSavingMap] = useState<
    Record<string, boolean>
  >({});
  const [bulkCamRegenerating, setBulkCamRegenerating] = useState(false);

  // related files (manufacturer hex rotation label/canonical mapping):
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
  // - web/backend/controllers/requests/common.requests.controller.js
  // - bg/pc1/esprit-addin/StlFileProcessor.cs
  const handleSaveManufacturerHexRotation = useCallback(
    async (
      req: ManufacturerRequest,
      value: ManufacturerHexRotationMode,
    ) => {
      if (!req?._id) return;
      const requestMongoId = String(req._id || "").trim();

      type HexRotationUiMode = ManufacturerHexRotationMode;

      const normalizeManufacturerHexMode = (raw: unknown): HexRotationUiMode | null =>
        normalizeManufacturerHexRotationMode(raw);

      const toBackendManufacturerHexRotation = (
        mode: HexRotationUiMode,
      ): ManufacturerHexRotationMode => mode;

      const toFinalHexRotation = (
        mode: HexRotationUiMode,
      ): ManufacturerHexRotationMode => mode;

      const toHexRotationLabel = (mode: HexRotationUiMode) => mode;

      const nextValue: HexRotationUiMode = value;
      const backendValue = toBackendManufacturerHexRotation(nextValue);

      const adminVerifiedHex = resolveAdminVerifiedHexFromRequest(req as any);
      if (adminVerifiedHex && backendValue !== adminVerifiedHex) {
        toast({
          title: "헥스 회전 변경 불가",
          description:
            "관리자가 헥스 회전을 확정한 계정입니다. 제조사가 변경할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const prevManufacturer =
        normalizeManufacturerHexMode((req as any)?.rnd?.manufacturerHexRotation) ||
        normalizeManufacturerHexMode((req as any)?.caseInfos?.finalHexRotation) ||
        normalizeManufacturerHexMode((req as any)?.caseInfos?.requestorHexRotation) ||
        "STL모델대로";
      const prevFinalRaw = String((req as any)?.caseInfos?.finalHexRotation || "").trim();
      const prevFinal: ManufacturerHexRotationMode =
        normalizeManufacturerHexMode(prevFinalRaw) || "STL모델대로";
      const prevUpdatedAt = (req as any)?.rnd?.manufacturerHexRotationUpdatedAt || null;
      const prevUpdatedBy = (req as any)?.rnd?.manufacturerHexRotationUpdatedBy || null;

      setHexRotationSavingMap((prev) => ({ ...prev, [requestMongoId]: true }));

      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          const prevMode =
            normalizeManufacturerHexMode(
              ((item.caseInfos || {}) as any)?.hexRotation?.mode,
            ) ||
            normalizeManufacturerHexMode((item as any)?.rnd?.manufacturerHexRotation) ||
            null;
          const modeChanged = Boolean(prevMode) && prevMode !== backendValue;
          return {
            ...item,
            caseInfos: {
              ...(item.caseInfos || {}),
              manufacturerHexRotation: backendValue,
              finalHexRotation: toFinalHexRotation(nextValue),
              hexRotation: {
                ...(((item.caseInfos || {}) as any)?.hexRotation || {}),
                mode: backendValue,
              },
              ...(modeChanged ? { ncFile: null } : {}),
            },
            rnd: {
              ...(item.rnd || {}),
              // UI/서버 canonical: STL모델대로 | 헥스30도회전 | STL모델+ | 헥스30+
              manufacturerHexRotation: nextValue as any,
              manufacturerHexRotationUpdatedAt: new Date().toISOString(),
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-hex-rotation`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            manufacturerHexRotation: backendValue,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "헥스 회전 저장에 실패했습니다.");
        }

        const savedManufacturer =
          normalizeManufacturerHexMode(data?.data?.manufacturerHexRotation) ||
          nextValue;
        const savedFinal: ManufacturerHexRotationMode =
          normalizeManufacturerHexMode(data?.data?.finalHexRotation) ||
          savedManufacturer;

        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            const nextCaseInfos: any = {
              ...(item.caseInfos || {}),
              requestorHexRotation:
                String(item.caseInfos?.requestorHexRotation || "").trim() ===
                  "헥스30도회전" ||
                String(item.caseInfos?.requestorHexRotation || "").trim() === "30"
                  ? "헥스30도회전"
                  : "STL모델대로",
              manufacturerHexRotation: savedManufacturer,
              finalHexRotation: savedFinal,
              hexRotation: {
                ...(((item.caseInfos || {}) as any)?.hexRotation || {}),
                mode: savedManufacturer,
              },
            };
            // 백엔드가 mode 변경 시 stale NC를 비운다 (재제작 복사 NC의 C30.0 잔여 방지).
            if (Object.prototype.hasOwnProperty.call(data?.data || {}, "ncFile")) {
              nextCaseInfos.ncFile = data?.data?.ncFile ?? null;
            }
            return {
              ...item,
              caseInfos: nextCaseInfos,
              rnd: {
                ...(item.rnd || {}),
                manufacturerHexRotation: savedManufacturer as any,
                manufacturerHexRotationUpdatedAt:
                  data?.data?.manufacturerHexRotationUpdatedAt || null,
                manufacturerHexRotationUpdatedBy:
                  data?.data?.manufacturerHexRotationUpdatedBy || null,
              },
            };
          }),
        );

        toast({
          title: "헥스 회전 저장 완료",
          description: `제조사 기준 ${toHexRotationLabel(savedManufacturer)}로 저장되었습니다.`,
        });
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              caseInfos: {
                ...(item.caseInfos || {}),
                finalHexRotation: prevFinal,
              },
              rnd: {
                ...(item.rnd || {}),
                manufacturerHexRotation: prevManufacturer as any,
                manufacturerHexRotationUpdatedAt: prevUpdatedAt,
                manufacturerHexRotationUpdatedBy: prevUpdatedBy,
              },
            };
          }),
        );

        toast({
          title: "헥스 회전 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });

        throw e;
      } finally {
        setHexRotationSavingMap((prev) => ({ ...prev, [requestMongoId]: false }));
      }
    },
    [pageState, toast, token],
  );

  const handleSaveAnodizingEnabledOverride = useCallback(
    async (req: ManufacturerRequest, nextValue: boolean) => {
      if (!req?._id) return;
      const requestMongoId = String(req._id || "").trim();
      if (!requestMongoId) return;

      const stageLabel = String(req.manufacturerStage || "").trim();
      if (!["준비", "CAM", "가공"].includes(stageLabel)) {
        toast({
          title: "변경 불가",
          description: "아노다이징 여부는 준비/가공 단계에서만 변경할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      if (anodizingSavingMap[requestMongoId]) return;

      const prevValue =
        typeof req.caseInfos?.anodizingEnabled === "boolean"
          ? req.caseInfos.anodizingEnabled
          : null;

      setAnodizingSavingMap((prev) => ({ ...prev, [requestMongoId]: true }));
      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            caseInfos: {
              ...(item.caseInfos || {}),
              anodizingEnabled: nextValue,
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/anodizing-override`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ anodizingEnabled: nextValue }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "아노다이징 여부 저장에 실패했습니다.");
        }

        const savedValue =
          typeof data?.data?.anodizingEnabled === "boolean"
            ? Boolean(data.data.anodizingEnabled)
            : nextValue;

        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              caseInfos: {
                ...(item.caseInfos || {}),
                anodizingEnabled: savedValue,
              },
            };
          }),
        );
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            const nextCaseInfos = { ...(item.caseInfos || {}) };
            if (typeof prevValue === "boolean") {
              nextCaseInfos.anodizingEnabled = prevValue;
            } else {
              delete nextCaseInfos.anodizingEnabled;
            }
            return {
              ...item,
              caseInfos: nextCaseInfos,
            };
          }),
        );
        toast({
          title: "아노다이징 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
        throw e;
      } finally {
        setAnodizingSavingMap((prev) => ({ ...prev, [requestMongoId]: false }));
      }
    },
    [anodizingSavingMap, pageState, toast, token],
  );

  const handleSaveWideSplitEnabledOverride = useCallback(
    async (req: ManufacturerRequest, nextValue: boolean) => {
      if (!req?._id) return;
      const requestMongoId = String(req._id || "").trim();
      if (!requestMongoId) return;

      const stageLabel = String(req.manufacturerStage || "").trim();
      if (!["준비", "의뢰", "CAM", "request", "cam"].includes(stageLabel)) {
        toast({
          title: "변경 불가",
          description: "Wide Split 설정은 준비 단계에서만 변경할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      if (wideSplitSavingMap[requestMongoId]) return;

      const prevValue =
        typeof req.caseInfos?.wideSplitEnabled === "boolean"
          ? req.caseInfos.wideSplitEnabled
          : null;

      setWideSplitSavingMap((prev) => ({ ...prev, [requestMongoId]: true }));
      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            caseInfos: {
              ...(item.caseInfos || {}),
              wideSplitEnabled: nextValue,
            },
          };
        }),
      );

      try {
        const res = await fetch(
          `/api/requests/${req._id}/wide-split-override`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ wideSplitEnabled: nextValue }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "Wide Split 설정 저장에 실패했습니다.");
        }

        const savedValue =
          typeof data?.data?.wideSplitEnabled === "boolean"
            ? Boolean(data.data.wideSplitEnabled)
            : nextValue;

        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              caseInfos: {
                ...(item.caseInfos || {}),
                wideSplitEnabled: savedValue,
              },
            };
          }),
        );
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            const nextCaseInfos = { ...(item.caseInfos || {}) };
            if (typeof prevValue === "boolean") {
              nextCaseInfos.wideSplitEnabled = prevValue;
            } else {
              delete nextCaseInfos.wideSplitEnabled;
            }
            return {
              ...item,
              caseInfos: nextCaseInfos,
            };
          }),
        );
        toast({
          title: "Wide Split 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
        throw e;
      } finally {
        setWideSplitSavingMap((prev) => ({ ...prev, [requestMongoId]: false }));
      }
    },
    [pageState, toast, token, wideSplitSavingMap],
  );

  const { handleCardRollback, handleCardApprove } = useCardActions(
    tabStage,
    isCamStage,
    isMachiningStage,
    {
      handleDeleteStageFile,
      handleDeleteNc,
      handleUpdateReviewStatus,
      handleSaveManufacturerHexRotation,
      handleSaveAnodizingEnabledOverride,
      token,
    },
    realtimeBaseRef,
    pendingStageTransitionToastRef,
  );

  const handleCardRollbackForTab = useCallback(
    async (req: ManufacturerRequest) => {
      if (tabStage !== "rnd") {
        return handleCardRollback(req);
      }
      if (!req?._id) return;
      setRemakeSourceRequest(req);
      setRemakeDialogOpen(true);
    },
    [handleCardRollback, tabStage],
  );

  const handleSaveRndMemo = useCallback(
    async (req: ManufacturerRequest, memoRaw: string) => {
      if (!req?._id) {
        return {
          memo: "",
          memoUpdatedAt: null,
          memoUpdatedBy: null,
          memoUpdatedByName: null,
        };
      }
      const memo = String(memoRaw || "")
        .slice(0, 500)
        .trim();
      const requestId = String(req._id);
      try {
        setRndMemoSaving((prev) => ({ ...prev, [requestId]: true }));
        const res = await fetch(`/api/requests/${req._id}/rnd-memo`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ memo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "메모 저장에 실패했습니다.");
        }
        const savedMemo = String(data?.data?.memo || "");
        const savedAt = data?.data?.memoUpdatedAt || null;
        const savedBy = data?.data?.memoUpdatedBy || null;
        const savedByName =
          typeof data?.data?.memoUpdatedByName === "string"
            ? data.data.memoUpdatedByName
            : null;

        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "") !== requestId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                memo: savedMemo,
                memoUpdatedAt: savedAt,
                memoUpdatedBy: savedBy,
                memoUpdatedByName: savedByName,
              },
            };
          }),
        );

        return {
          memo: savedMemo,
          memoUpdatedAt: savedAt,
          memoUpdatedBy: savedBy,
          memoUpdatedByName: savedByName,
        };
      } catch (e: any) {
        toast({
          title: "메모 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
        throw e;
      } finally {
        setRndMemoSaving((prev) => ({ ...prev, [requestId]: false }));
      }
    },
    [pageState, toast, token],
  );

  const enableCardRollback =
    tabStage === "machining" ||
    tabStage === "packing" ||
    tabStage === "shipping" ||
    tabStage === "tracking" ||
    tabStage === "rnd";

  const enableCardApprove =
    tabStage === "machining" ||
    tabStage === "packing" ||
    tabStage === "shipping" ||
    tabStage === "tracking" ||
    tabStage === "request";

  const enableDesignClaim =
    productMode === PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT &&
    user?.role === "requestor";

  const [designClaimBusyIds, setDesignClaimBusyIds] = useState<
    Record<string, boolean>
  >({});

  const handleDesignClaim = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token || !req?._id) return;
      const id = String(req._id);
      setDesignClaimBusyIds((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/requests/${id}/design-claim`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
        toast({
          title: "수락 실패",
          description:
            json?.message ||
            (res.status === 409
              ? "다른 디자이너가 이미 작업 중입니다."
              : "디자인 수락에 실패했습니다."),
          variant: "destructive",
        });
        if (res.status === 409) {
          void fetchRequestsCore(true);
        }
        return;
      }
      const claimed = json?.data?.request;
      const meta = json?.data?.designClaimMeta;
      pageState.setRequests((prev) =>
        prev.map((row) => {
          if (String(row._id) !== id) return row;
          return {
            ...row,
            designClaim: claimed?.designClaim || row.designClaim,
            designClaimMeta: meta || row.designClaimMeta,
            designClaimMine: true,
            designClaimPeerBusy: false,
            designClaimClaimable: false,
            designClaimRemainingMs: meta?.remainingMs ?? null,
            designClaimWarn: Boolean(meta?.warn),
          };
        }),
      );
      toast({
        title: "수락됨",
        description: "이 디자인을 수락했습니다. 마감 전에 승인해 주세요.",
      });
    } catch (error) {
      toast({
        title: "수락 실패",
        description:
          error instanceof Error
            ? error.message
            : "디자인 수락에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
        setDesignClaimBusyIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [token, toast, fetchRequestsCore, pageState],
  );

  const pickDesignAbutmentFile = useCallback((): Promise<File | null> => {
    return pickOsFilesViaInput({
      accept: PRACTICE_TRANSFER_STL_ACCEPT,
      multiple: false,
    }).then((files) => files[0] || null);
  }, []);

  const handleDesignHandoffApprove = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token || !req?._id) return;
      const id = String(req._id);
      if (designClaimBusyIds[id]) return;

      const file = await pickDesignAbutmentFile();
      if (!file) {
        toast({
          title: "승인 취소",
          description: "완성 어벗 STL을 선택해야 제조사로 넘길 수 있습니다.",
        });
        return;
      }

      setDesignClaimBusyIds((prev) => ({ ...prev, [id]: true }));
      try {
        const uploaded = await uploadFilesWithToast([file]);
        const temp = uploaded?.[0];
        const s3Key = String(temp?.key || "").trim();
        if (!s3Key) {
          throw new Error("파일 업로드에 실패했습니다.");
        }

        const res = await fetch(`/api/requests/${id}/design-handoff`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file: {
              originalName: temp.originalName || file.name,
              size: temp.size ?? file.size,
              mimetype: temp.mimetype || file.type || "application/octet-stream",
              s3Key,
              s3Url: temp.location || "",
            },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          throw new Error(
            String(json?.message || "디자인 승인(핸드오프)에 실패했습니다."),
          );
        }

        pageState.setRequests((prev) =>
          prev.filter((row) => String(row._id) !== id),
        );
        toast({
          title: "제조사로 전달됨",
          description:
            "완성 어벗이 업로드되어 커스텀어벗 생산(가공)으로 넘어갔습니다.",
        });
        void fetchRequestsCore(true);
      } catch (error) {
        toast({
          title: "승인 실패",
          description:
            error instanceof Error
              ? error.message
              : "디자인 승인에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDesignClaimBusyIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [
      token,
      toast,
      designClaimBusyIds,
      pickDesignAbutmentFile,
      uploadFilesWithToast,
      pageState,
      fetchRequestsCore,
    ],
  );

  const { handleDownloadOriginal } = useRequestCardHandlers(
    token,
    isMachiningStage,
    isCamStage,
  );

  const setPreviewOpen = pageState.setPreviewOpen;

  useEffect(() => {
    resetPagination();
    // 포장.발송 탭 진입 시에는 우편함 요약을 강제 새로고침해 사용자별 stale 서버 캐시 영향을 줄인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void fetchRequestsCore(
      false,
      false,
      tabStage === "shipping" ? { forceMailboxRefresh: true } : undefined,
    );
  }, [tabStage, showCompleted, productMode, productModeNe]);

  const { filteredBase, filteredAndSorted, getFilteredAndSortedRequests } =
    useRequestFiltering(
      pageState.requests,
      tabStage,
      showCompleted,
      currentStageOrder,
      worksheetSearch,
      filterRequests,
    );

  const handleRegenerateAllCam = useCallback(async () => {
    if (!token || bulkCamRegenerating) return;

    const targets = filteredAndSorted;

    if (!targets.length) {
      toast({
        title: "재생성 대상 없음",
        description:
          tabStage === "request"
            ? "Filled STL 재생성할 의뢰가 없습니다."
            : "가공 준비 재생성할 의뢰가 없습니다.",
      });
      return;
    }

    const buildStandardStlFileName = (req: ManufacturerRequest) => {
      const requestId = String(req?.requestId || "").trim();
      if (!requestId) return "";
      const originalFileName = String(req?.caseInfos?.file?.originalName || "");
      const ext = originalFileName.includes(".")
        ? `.${String(originalFileName).split(".").pop()?.toLowerCase()}`
        : ".stl";
      return `${requestId}-${String(req?.caseInfos?.clinicName || "")}-${String(req?.caseInfos?.patientName || "")}-${String(req?.caseInfos?.tooth || "")}${ext}`;
    };

    setBulkCamRegenerating(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const req of targets) {
        const requestId = String(req?.requestId || "").trim();
        if (!requestId) {
          failCount += 1;
          continue;
        }

        try {
          let res: Response;

          if (tabStage === "request") {
            const standardFilePath = buildStandardStlFileName(req);
            const filePath = String(
              standardFilePath ||
                req?.caseInfos?.file?.filePath ||
                req?.caseInfos?.file?.originalName ||
                "",
            ).trim();

            if (!filePath) {
              failCount += 1;
              continue;
            }

            res = await fetch("/api/rhino/process-file", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                filePath,
                fileName: filePath,
                requestId,
                force: true,
              }),
            });
          } else {
            res = await fetch(
              `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
              },
            );
          }

          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.success === false) {
            failCount += 1;
            continue;
          }
          if (tabStage === "request") {
            markFilledStlRegenerationPending(requestId);
            // CANCELLED 후 재생성 — 블러 재개
            pageState.setRequests((prev) =>
              prev.map((item) => {
                if (String(item?.requestId || "").trim() !== requestId) {
                  return item;
                }
                return {
                  ...item,
                  productionSchedule: {
                    ...(item.productionSchedule || {}),
                    stlPreload: {
                      status: "GENERATING",
                      updatedAt: new Date().toISOString(),
                    },
                  },
                };
              }),
            );
          } else {
            markNcRegenerationPending(requestId);
          }
          successCount += 1;
        } catch {
          failCount += 1;
        }
      }

      toast({
        title:
          tabStage === "request"
            ? "Filled STL 재생성 요청 완료"
            : "가공 준비 재생성 요청 완료",
        description: `성공 ${successCount}건, 실패 ${failCount}건`,
        variant: failCount > 0 ? "destructive" : undefined,
      });

      void reloadRequests();
    } finally {
      setBulkCamRegenerating(false);
    }
  }, [
    bulkCamRegenerating,
    filteredAndSorted,
    reloadRequests,
    tabStage,
    toast,
    token,
  ]);

  useEffect(() => {
    if (!Object.keys(mailboxState.mailboxErrorByAddress).length) return;
    mailboxState.setMailboxErrorByAddress((prev) => {
      const next = { ...prev };
      for (const address of Object.keys(prev)) {
        const mailboxRequests = filteredAndSorted.filter(
          (r) => String(r?.mailboxAddress || "").trim() === address,
        );
        const hasPickup = mailboxRequests.some((req) => {
          const di =
            req?.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
              ? (req.deliveryInfoRef as any)
              : null;
          return Boolean(di?.trackingNumber || di?.shippedAt);
        });
        if (hasPickup) {
          delete next[address];
        }
      }
      return next;
    });
  }, [filteredAndSorted, mailboxState.mailboxErrorByAddress, mailboxState]);



  const handleOpenNextRequest = useCallback(
    async (currentRequestId: string): Promise<boolean> => {
      const normalizedCurrentRequestId = String(currentRequestId || "").trim();
      if (!normalizedCurrentRequestId) return false;

      const getRequestId = (req: ManufacturerRequest | undefined | null) =>
        String(req?.requestId || "").trim();
      const getMongoId = (req: ManufacturerRequest | undefined | null) =>
        String(req?._id || "").trim();

      const currentPreviewReq =
        pageState.previewFiles?.request &&
        String(pageState.previewFiles.request?.requestId || "").trim() ===
          normalizedCurrentRequestId
          ? (pageState.previewFiles.request as ManufacturerRequest)
          : null;
      const normalizedCurrentMongoId = getMongoId(currentPreviewReq);

      const currentIndex = filteredAndSorted.findIndex(
        (req) => getRequestId(req) === normalizedCurrentRequestId,
      );
      const preferredNextRequestId =
        currentIndex >= 0
          ? getRequestId(filteredAndSorted[currentIndex + 1]) || null
          : null;

      const refreshed = await refreshRequests(true);
      const latestList = Array.isArray(refreshed) ? refreshed : pageState.requests;
      const latestFilteredAndSorted = getFilteredAndSortedRequests(latestList);

      let nextReq: ManufacturerRequest | undefined;
      if (preferredNextRequestId) {
        nextReq = latestFilteredAndSorted.find((req) => {
          const rid = getRequestId(req);
          const mid = getMongoId(req);
          if (!rid) return false;
          if (rid !== preferredNextRequestId) return false;
          if (rid === normalizedCurrentRequestId) return false;
          if (normalizedCurrentMongoId && mid === normalizedCurrentMongoId) return false;
          return true;
        });
      }
      if (!nextReq) {
        nextReq = latestFilteredAndSorted.find((req) => {
          const rid = getRequestId(req);
          const mid = getMongoId(req);
          if (!rid) return false;
          if (rid === normalizedCurrentRequestId) return false;
          if (normalizedCurrentMongoId && mid === normalizedCurrentMongoId) return false;
          return true;
        });
      }

      if (!nextReq) {
        return false;
      }

      return handleOpenPreviewWithSameReopenGuard(nextReq);
    },
    [
      filteredAndSorted,
      getFilteredAndSortedRequests,
      handleOpenPreviewWithSameReopenGuard,
      pageState.requests,
      refreshRequests,
    ],
  );

  const setVisibleCount = pageState.setVisibleCount;
  const visibleCountRef = pageState.visibleCountRef;
  const setServerTotal = pageState.setServerTotal;
  useEffect(() => {
    visibleCountRef.current = 12;
    setVisibleCount(12);
    setServerTotal(null);
  }, [
    worksheetSearch,
    showCompleted,
    tabStage,
    setVisibleCount,
    visibleCountRef,
    setServerTotal,
  ]);

  useInfiniteScroll(
    pageState.sentinelRef,
    pageState.visibleCount,
    filteredAndSorted.length,
    hasMoreRef.current,
    fetchNextPage,
    pageState.setVisibleCount,
    pageState.userScrolledRef,
  );

  pageState.totalCountRef.current = filteredAndSorted.length;
  const paginatedRequests = filteredAndSorted.slice(0, pageState.visibleCount);

  const {
    handleTogglePackingRequest,
    handleSelectAllPackingRequests,
    handleClearPackingRequests,
  } = usePackingSelection(tabStage, filteredAndSorted, pageState);

  useMailboxSync(pageState, mailboxState);

  const diameterQueueForReceive = useDiameterQueue(filteredAndSorted);

  const queueTotal =
    showCompleted
      ? diameterQueueForReceive.total
      : (pageState.serverTotal ?? diameterQueueForReceive.total);

  const usesCompactQueueHeader =
    showQueueBar &&
    (tabStage === "request" ||
      tabStage === "rnd" ||
      tabStage === "unmachinable");

  if (pageState.isLoading) {
    if (isTransferChatDetail) {
      return null;
    }
    return <WorksheetLoading />;
  }

  const isEmpty = filteredAndSorted.length === 0;

  if (isTransferChatDetail && isEmpty) {
    return null;
  }

  return (
    <div
      onDrop={handlePageDrop}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      className="relative w-full h-full text-gray-800 flex flex-col items-stretch"
      onWheelCapture={() => {
        pageState.userScrolledRef.current = true;
        const node = pageState.scrollContainerRef.current;
        if (
          node &&
          node.scrollHeight <= node.clientHeight + 20 &&
          hasMoreRef.current
        ) {
          void fetchNextPage();
        }
      }}
      onScrollCapture={() => {
        pageState.userScrolledRef.current = true;
      }}
    >
      <div
        className="custom-scrollbar workspace-nested-scroll flex-1 overflow-y-auto"
        ref={pageState.setScrollContainer}
        data-worksheet-scroll="1"
        onScroll={() => {
          pageState.userScrolledRef.current = true;
        }}
      >
        {isCamStage && isDraggingOver && (
          <BodyPortal>
          <div className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-solid border-primary text-center">
              <div className="text-2xl font-bold text-primary-strong mb-2">
                NC 파일을 드롭하세요
              </div>
              <div className="text-sm text-slate-600">
                파일명이 일치하는 의뢰건에 자동으로 업로드됩니다
              </div>
            </div>
          </div>
          </BodyPortal>
        )}
        {usesCompactQueueHeader ? (
          <WorksheetQueueSummary
            total={queueTotal}
            labels={diameterQueueForReceive.labels}
            counts={diameterQueueForReceive.counts}
            variant="compact"
            className="px-4 pt-2"
            toolbar={
              showBulkCamRegenerate && tabStage === "request" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!filteredAndSorted.length || bulkCamRegenerating}
                  onClick={() => {
                    pageState.setConfirmTitle("전체 Filled STL 재생성");
                    pageState.setConfirmDescription(
                      `현재 목록의 ${filteredAndSorted.length}개 의뢰에 전체 Filled STL 재생성 요청을 보냅니다. 진행할까요?`,
                    );
                    pageState.setConfirmAction(() => async () => {
                      await handleRegenerateAllCam();
                    });
                    pageState.setConfirmOpen(true);
                  }}
                >
                  {bulkCamRegenerating
                    ? "Filled STL 재생성 요청 중..."
                    : "전체 Filled STL 재생성"}
                </Button>
              ) : null
            }
          />
        ) : null}

        <div
          className={`space-y-4 ${
            tabStage === "shipping"
              ? "mt-0"
              : tabStage === "machining"
                ? "mt-0"
                : usesCompactQueueHeader
                  ? "mt-2"
                  : "mt-6"
          }`}
        >
          <div
            className={
              tabStage === "shipping" || tabStage === "machining"
                ? "pb-6 pt-0"
                : "pb-12 pt-2"
            }
          >
            {tabStage === "machining" ? (
              // 가공 큐 우선순위/자동시작 정책은 백엔드 SSOT로 관리한다.
              // - 아노다이징 ON 우선
              // - 아노다이징 OFF는 큐 마지막 + "아노 X 가공" 수동 시작
              <MachiningQueueBoard
                searchQuery={worksheetSearch}
                queueTotal={
                  showCompleted
                    ? diameterQueueForReceive.total
                    : (pageState.serverTotal ?? diameterQueueForReceive.total)
                }
                queueLabels={diameterQueueForReceive.labels}
                queueCounts={diameterQueueForReceive.counts}
              />
            ) : tabStage === "shipping" ? (
              <div className="w-full">
                <MailboxGrid
                  mailboxSummaries={mailboxSummaries}
                  forceTodayMailboxAddresses={
                    mailboxState.forceTodayMailboxAddresses
                  }
                  clearedForceTodayMailboxAddresses={
                    mailboxState.clearedForceTodayMailboxAddresses
                  }
                  onBoxClick={(address) => {
                    void handleOpenMailboxDetails(address);
                  }}
                  onBoxPrefetch={handlePrefetchMailboxDetails}
                  onMailboxError={(address, message) => {
                    const key = String(address || "").trim();
                    if (!key) return;
                    const normalized = String(message || "").trim();
                    if (!normalized) return;
                    mailboxState.setMailboxErrorByAddress((prev) => ({
                      ...prev,
                      [key]: normalized,
                    }));
                  }}
                  onRefresh={handleMailboxGridRefresh}
                />
              </div>
            ) : isEmpty ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
                표시할 의뢰가 없습니다.
              </div>
            ) : (
              <>
                {isTransferChatDetail ? (
                  <DesignRequestTransferView
                    requests={paginatedRequests}
                    hasMoreLabel={
                      pageState.visibleCount >= filteredAndSorted.length
                        ? "모든 의뢰를 표시했습니다."
                        : "스크롤하여 더보기"
                    }
                    sentinelRef={pageState.sentinelRef}
                    onDesignClaim={
                      enableDesignClaim ? handleDesignClaim : undefined
                    }
                    onApprove={
                      enableDesignClaim
                        ? handleDesignHandoffApprove
                        : enableCardApprove
                          ? handleCardApprove
                          : undefined
                    }
                    designClaimBusyIds={designClaimBusyIds}
                  />
                ) : (
                  <>
                    <WorksheetCardGrid
                      requests={paginatedRequests}
                      selectedRequestIds={
                        tabStage === "packing"
                          ? pageState.selectedPackingRequestIds
                          : []
                      }
                      onToggleSelected={
                        tabStage === "packing"
                          ? handleTogglePackingRequest
                          : undefined
                      }
                      onDownload={handleDownloadOriginal}
                      onOpenPreview={(req) => {
                        void handleOpenPreviewWithSameReopenGuard(req);
                      }}
                      onDeleteCam={handleDeleteCam}
                      onDeleteNc={handleDeleteNc}
                      onCloneSample={
                        tabStage === "request"
                          ? handleCloneSampleForProduction
                          : undefined
                      }
                      onSaveToRnd={
                        tabStage === "request" ? handleSaveToRnd : undefined
                      }
                      onRollback={
                        enableCardRollback
                          ? handleCardRollbackForTab
                          : undefined
                      }
                      onApprove={
                        enableDesignClaim
                          ? handleDesignHandoffApprove
                          : enableCardApprove
                            ? handleCardApprove
                            : undefined
                      }
                      onDesignClaim={
                        enableDesignClaim ? handleDesignClaim : undefined
                      }
                      enableDesignClaim={enableDesignClaim}
                      designClaimBusyIds={designClaimBusyIds}
                      onDelete={handleCardDelete}
                      onCancelRhinoWork={handleCancelRhinoWork}
                      rhinoCancellingIds={rhinoCancellingIds}
                      onDone={handleCardDone}
                      onRestoreUnmachinable={handleRestoreUnmachinable}
                      onUploadNc={handleUploadNc}
                      uploadProgress={pageState.uploadProgress}
                      uploading={pageState.uploading}
                      deletingCam={pageState.deletingCam}
                      deletingNc={pageState.deletingNc}
                      isCamStage={isCamStage}
                      isMachiningStage={isMachiningStage}
                      downloading={pageState.downloading}
                      currentStageOrder={currentStageOrder}
                      tabStage={tabStage}
                      onSaveRndMemo={handleSaveRndMemo}
                      rndMemoSaving={rndMemoSaving}
                    />

                    <div
                      ref={pageState.sentinelRef}
                      className="py-4 text-center text-gray-500"
                    >
                      {pageState.visibleCount >= filteredAndSorted.length
                        ? "모든 의뢰를 표시했습니다."
                        : "스크롤하여 더보기"}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <WorksheetDiameterQueueModal
        open={pageState.receiveQueueModalOpen}
        onOpenChange={pageState.setReceiveQueueModalOpen}
        processLabel={`커스텀어벗 > ${currentStageForTab}`}
        queues={diameterQueueForReceive.buckets}
        selectedBucket={pageState.receiveSelectedBucket}
        onSelectBucket={pageState.setReceiveSelectedBucket}
      />

      <MailboxContentsModal
        open={mailboxState.mailboxModalOpen}
        onOpenChange={(next) => {
          if (
            !next &&
            !mailboxState.isForceTodayUpdating &&
            !mailboxState.isMailboxDetailsLoading
          ) {
            mailboxState.handleShipmentModalClose();
            openMailboxAddressRef.current = "";
          }
        }}
        address={mailboxState.mailboxModalAddress}
        requests={mailboxState.mailboxModalRequests}
        isLoading={mailboxState.isMailboxDetailsLoading}
        errorMessage={
          mailboxState.mailboxErrorByAddress[
            mailboxState.mailboxModalAddress
          ] || ""
        }
        token={token}
        onRollback={handleCardRollback}
        onApprove={handleCardApprove}
        onDelete={handleCardDelete}
        onRollbackAll={
          mailboxState.mailboxModalRequests.length
            ? mailboxState.handleRollbackAllInMailbox
            : undefined
        }
        isRollingBackAll={mailboxState.isRollingBackAll}
        onAddressSaved={mailboxState.handleMailboxAddressSaved}
        forceToday={
          mailboxState.clearedForceTodayMailboxAddresses.has(
            mailboxState.mailboxModalAddress,
          )
            ? false
            : mailboxState.forceTodayMailboxAddresses.has(
                mailboxState.mailboxModalAddress,
              ) ||
              mailboxState.mailboxModalRequests.some((req) =>
                Boolean(req?.timeline?.forceTodayShipment),
              )
        }
        onForceTodayChange={(checked) =>
          void (async () => {
            await mailboxState.setMailboxForceToday(
              mailboxState.mailboxModalAddress,
              checked,
            );
            mailboxState.handleShipmentModalClose();
            openMailboxAddressRef.current = "";
          })()
        }
      />

      {!isTransferChatDetail ? (
        <PreviewModal
          open={pageState.previewOpen}
          onOpenChange={handlePreviewOpenChange}
          previewLoading={pageState.previewLoading}
          previewFiles={pageState.previewFiles}
          previewNcText={pageState.previewNcText}
          previewNcName={pageState.previewNcName}
          previewStageUrl={pageState.previewStageUrl}
          previewStageName={pageState.previewStageName}
          uploading={pageState.uploading}
          reviewSaving={pageState.reviewSaving}
          stage={tabStage}
          isCamStage={isCamStage}
          isMachiningStage={isMachiningStage}
          onUpdateReviewStatus={handleUpdateReviewStatus}
          onDeleteCam={handleDeleteCam}
          onDeleteNc={handleDeleteNc}
          onDeleteStageFile={handleDeleteStageFile}
          onUploadCam={handleUploadCam}
          onUploadNc={handleUploadNc}
          onUploadStageFile={handleUploadStageFile}
          onDownloadOriginalStl={handleDownloadOriginalStl}
          onDownloadCamStl={handleDownloadCamStl}
          onDownloadNcFile={handleDownloadNcFile}
          onDownloadStageFile={handleDownloadStageFile}
          onRefreshPreview={handleOpenPreviewWithSameReopenGuard}
          onMarkUnmachinable={handleMarkUnmachinable}
          onRestoreUnmachinable={handleRestoreUnmachinable}
          onSaveManufacturerHexRotation={handleSaveManufacturerHexRotation}
          onSaveAnodizingEnabledOverride={handleSaveAnodizingEnabledOverride}
          onSaveWideSplitEnabledOverride={handleSaveWideSplitEnabledOverride}
          onOpenNextRequest={handleOpenNextRequest}
          setSearchParams={setSearchParams}
        />
      ) : null}

      <RemakeStartQuickModal
        open={remakeDialogOpen}
        onOpenChange={(open) => {
          if (remakeSubmitting) return;
          setRemakeDialogOpen(open);
          if (!open) {
            setRemakeSourceRequest(null);
          }
        }}
        sourceRequestId={remakeSourceRequest?.requestId || ""}
        submitting={remakeSubmitting}
        onSelectStage={handleSubmitRemake}
      />

      <ConfirmDialog
        open={pageState.confirmOpen}
        title={pageState.confirmTitle}
        description={pageState.confirmDescription}
        confirmLabel={pageState.confirmLabel}
        cancelLabel={pageState.cancelLabel}
        onConfirm={async () => {
          if (!pageState.confirmAction) return;
          const action = pageState.confirmAction;
          pageState.setConfirmOpen(false);
          pageState.setConfirmAction(null);
          pageState.setConfirmCancelAction(null);
          pageState.setConfirmLabel("확인");
          pageState.setCancelLabel("취소");

          try {
            await action();
          } catch (error) {
            console.error("Confirm action failed:", error);
          }
        }}
        onCancel={() => {
          const cancelAction = pageState.confirmCancelAction;
          pageState.setConfirmOpen(false);
          pageState.setConfirmAction(null);
          pageState.setConfirmCancelAction(null);
          pageState.setConfirmLabel("확인");
          pageState.setCancelLabel("취소");
          if (cancelAction) {
            void Promise.resolve(cancelAction()).catch((error) => {
              console.error("Confirm cancel action failed:", error);
            });
          }
        }}
      />
    </div>
  );
};

export default RequestPage;
