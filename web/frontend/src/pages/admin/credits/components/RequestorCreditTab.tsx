// change-log:
// - 2026-08-14: 스탯 라벨 「치과 · 기공소」로 표기.
// - 2026-08-13: 무료(의뢰/배송) 통합 표시, 스탯·탭 스타일 모던화.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoMatchVerificationTab } from "./AutoMatchVerificationTab";
import { RequestorFreeCreditTab } from "./RequestorFreeCreditTab";
import { RequestorOrdersTab } from "./RequestorOrdersTab";
import { RequestorOrganizationsTab } from "./RequestorOrganizationsTab";
import { RequestorTransactionsTab } from "./RequestorTransactionsTab";
import { CreditStatTile } from "../creditPageUi";
import type {
  BankTransaction,
  FreeCreditGrantHistoryRow,
  BusinessCredit,
  ChargeOrder,
  CreditStats,
  FreeCreditAmount,
} from "../adminCredit.types";

type RequestorCreditTabProps = {
  loadingStats: boolean;
  stats: CreditStats | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  orgSortKey: "paidBalance" | "freeBalance" | "spentPaid" | "name";
  setOrgSortKey: (
    value: "paidBalance" | "freeBalance" | "spentPaid" | "name",
  ) => void;
  loadingOrgs: boolean;
  allRequestorBusinesses: BusinessCredit[];
  businesses: BusinessCredit[];
  orgScrollRef: RefObject<HTMLDivElement | null>;
  orgSentinelRef: RefObject<HTMLDivElement | null>;
  onOpenOrgLedger: (business: BusinessCredit) => void;
  loadFreeCreditGrantHistory: (options?: {
    businessNumber?: string;
  }) => void | Promise<void>;
  loadingFreeCreditGrantRows: boolean;
  handleGrantFreeCredit: (options?: {
    businessAnchorId?: string;
    amount?: FreeCreditAmount;
    reason?: string;
  }) => void | Promise<void>;
  grantingFreeCredit: boolean;
  freeCreditGrantRows: FreeCreditGrantHistoryRow[];
  handleCancelFreeCredit: (options?: {
    grantId?: string;
    reason?: string;
  }) => boolean | Promise<boolean>;
  cancelingGrant: boolean;
  filteredFreeCreditUsageRows: BusinessCredit[];
  orderStatusFilter: string;
  setOrderStatusFilter: (value: string) => void;
  setOrderSkip: (value: number) => void;
  setOrderHasMore: (value: boolean) => void;
  loadChargeOrders: (
    status?: string,
    options?: { reset?: boolean },
  ) => void | Promise<void>;
  loadingOrders: boolean;
  chargeOrders: ChargeOrder[];
  orderScrollRef: RefObject<HTMLDivElement | null>;
  orderSentinelRef: RefObject<HTMLDivElement | null>;
  setSelectedOrder: (order: ChargeOrder | null) => void;
  setApproveModalOpen: (open: boolean) => void;
  setRejectNote: (value: string) => void;
  setRejectModalOpen: (open: boolean) => void;
  txTab: "auto" | "manual";
  setTxTab: (value: "auto" | "manual") => void;
  txStatusFilter: string;
  setTxStatusFilter: (value: string) => void;
  setTxSkip: (value: number) => void;
  setTxHasMore: (value: boolean) => void;
  loadBankTransactions: (
    status?: string,
    options?: { reset?: boolean },
  ) => void | Promise<void>;
  loadingTransactions: boolean;
  bankTransactions: BankTransaction[];
  txScrollRef: RefObject<HTMLDivElement | null>;
  txSentinelRef: RefObject<HTMLDivElement | null>;
  selectedTx: BankTransaction | null;
  setSelectedTx: (value: BankTransaction | null) => void;
  selectedOrder: ChargeOrder | null;
  matchNote: string;
  setMatchNote: (value: string) => void;
  matchForce: boolean;
  setMatchForce: (value: boolean) => void;
  handleManualMatch: () => void | Promise<void>;
  matching: boolean;
};

function won(n: number) {
  return `${n.toLocaleString()}원`;
}

export function RequestorCreditTab(props: RequestorCreditTabProps) {
  const requestorBusinesses = (
    props.allRequestorBusinesses.length > 0
      ? props.allRequestorBusinesses
      : props.businesses
  ).filter((business) => {
    if (typeof business.isFreeCreditEligible === "boolean") {
      return business.isFreeCreditEligible;
    }
    return String(business.businessType || "").trim() === "requestor";
  });

  const totalChargedPaid = Number(props.stats?.totalCharged || 0);
  const totalChargedFree = Number(
    props.stats?.totalChargedFreeAmount ??
      Number(props.stats?.totalFreeRequest ?? 0) +
        Number(props.stats?.totalFreeShipping ?? 0),
  );
  const totalPaidCredit = Number(props.stats?.totalPaidCredit || 0);
  const totalFreeCredit = Number(
    props.stats?.totalFreeRequestCredit ?? 0,
  ) + Number(props.stats?.totalFreeShippingCredit ?? 0);
  const totalSpentPaid = Number(props.stats?.totalSpentPaidAmount || 0);
  const totalSpentFree = Number(
    props.stats?.totalSpentFreeAmount ??
      Number(props.stats?.totalSpentFreeRequestAmount ?? 0) +
        Number(props.stats?.totalSpentFreeShippingAmount ?? 0),
  );

  const loading = props.loadingStats;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CreditStatTile
          label="치과 · 기공소"
          value={loading ? "…" : requestorBusinesses.length.toLocaleString()}
        />
        <CreditStatTile
          label="충전"
          value={
            loading ? "…" : won(totalChargedPaid + totalChargedFree)
          }
          hint={
            <>
              <div>유료 {won(totalChargedPaid)}</div>
              <div>무료 {won(totalChargedFree)}</div>
            </>
          }
        />
        <CreditStatTile
          label="잔여"
          value={loading ? "…" : won(totalPaidCredit + totalFreeCredit)}
          hint={
            <>
              <div>유료 {won(totalPaidCredit)}</div>
              <div>무료 {won(totalFreeCredit)}</div>
            </>
          }
        />
        <CreditStatTile
          label="사용"
          value={loading ? "…" : won(totalSpentPaid + totalSpentFree)}
          hint={
            <>
              <div>유료 {won(totalSpentPaid)}</div>
              <div>무료 {won(totalSpentFree)}</div>
            </>
          }
        />
        <CreditStatTile
          label="미매칭 입금"
          value={loading ? "…" : props.stats?.newBankTransactions || 0}
          tone="accent"
        />
      </div>

      <Tabs defaultValue="organizations" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-11 rounded-xl bg-slate-100/80 p-1">
            <TabsTrigger value="organizations" className="rounded-lg px-4">
              사업자
            </TabsTrigger>
            <TabsTrigger value="free-credit" className="rounded-lg px-4">
              무료 크레딧
            </TabsTrigger>
            <TabsTrigger value="verification" className="rounded-lg px-4">
              자동 매칭
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-lg px-4">
              충전 주문
            </TabsTrigger>
            <TabsTrigger value="transactions" className="rounded-lg px-4">
              입금 내역
            </TabsTrigger>
          </TabsList>
          <div className="w-full md:w-[340px]">
            <Input
              value={props.searchQuery}
              onChange={(e) => props.setSearchQuery(e.target.value)}
              placeholder="사업자명 · 번호 · 대표자 검색"
              className="h-10 rounded-xl border-slate-200"
            />
          </div>
        </div>

        <RequestorOrganizationsTab
          orgSortKey={props.orgSortKey}
          setOrgSortKey={props.setOrgSortKey}
          loadingOrgs={props.loadingOrgs}
          businesses={requestorBusinesses}
          orgScrollRef={props.orgScrollRef}
          orgSentinelRef={props.orgSentinelRef}
          onOpenLedger={props.onOpenOrgLedger}
        />

        <RequestorFreeCreditTab
          loadFreeCreditGrantHistory={props.loadFreeCreditGrantHistory}
          loadingFreeCreditGrantRows={props.loadingFreeCreditGrantRows}
          handleGrantFreeCredit={props.handleGrantFreeCredit}
          grantingFreeCredit={props.grantingFreeCredit}
          freeCreditGrantRows={props.freeCreditGrantRows}
          handleCancelFreeCredit={props.handleCancelFreeCredit}
          cancelingGrant={props.cancelingGrant}
          filteredFreeCreditUsageRows={props.filteredFreeCreditUsageRows}
        />

        <TabsContent value="verification" className="space-y-4">
          <AutoMatchVerificationTab />
        </TabsContent>

        <RequestorOrdersTab
          orderStatusFilter={props.orderStatusFilter}
          setOrderStatusFilter={props.setOrderStatusFilter}
          setOrderSkip={props.setOrderSkip}
          setOrderHasMore={props.setOrderHasMore}
          loadChargeOrders={props.loadChargeOrders}
          loadingOrders={props.loadingOrders}
          chargeOrders={props.chargeOrders}
          orderScrollRef={props.orderScrollRef}
          orderSentinelRef={props.orderSentinelRef}
          setSelectedOrder={props.setSelectedOrder}
          setApproveModalOpen={props.setApproveModalOpen}
          setRejectNote={props.setRejectNote}
          setRejectModalOpen={props.setRejectModalOpen}
        />

        <RequestorTransactionsTab
          txTab={props.txTab}
          setTxTab={props.setTxTab}
          txStatusFilter={props.txStatusFilter}
          setTxStatusFilter={props.setTxStatusFilter}
          setTxSkip={props.setTxSkip}
          setTxHasMore={props.setTxHasMore}
          loadBankTransactions={props.loadBankTransactions}
          loadingTransactions={props.loadingTransactions}
          bankTransactions={props.bankTransactions}
          txScrollRef={props.txScrollRef}
          txSentinelRef={props.txSentinelRef}
          loadingOrders={props.loadingOrders}
          chargeOrders={props.chargeOrders}
          selectedTx={props.selectedTx}
          setSelectedTx={props.setSelectedTx}
          selectedOrder={props.selectedOrder}
          setSelectedOrder={props.setSelectedOrder}
          matchNote={props.matchNote}
          setMatchNote={props.setMatchNote}
          matchForce={props.matchForce}
          setMatchForce={props.setMatchForce}
          handleManualMatch={props.handleManualMatch}
          matching={props.matching}
        />
      </Tabs>
    </>
  );
}
