// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/pages/admin/credits/components/RequestorOrganizationsTab.tsx
// - web/frontend/src/components/ui/input.tsx
import type { RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoMatchVerificationTab } from "./AutoMatchVerificationTab";
import { RequestorFreeCreditTab } from "./RequestorFreeCreditTab";
import { RequestorOrdersTab } from "./RequestorOrdersTab";
import { RequestorOrganizationsTab } from "./RequestorOrganizationsTab";
import { RequestorTransactionsTab } from "./RequestorTransactionsTab";
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
  orgSortKey: "paidBalance" | "bonusBalance" | "spentPaid" | "name";
  setOrgSortKey: (
    value: "paidBalance" | "bonusBalance" | "spentPaid" | "name",
  ) => void;
  loadingOrgs: boolean;
  allRequestorBusinesses: BusinessCredit[];
  businesses: BusinessCredit[];
  orgScrollRef: RefObject<HTMLDivElement | null>;
  orgSentinelRef: RefObject<HTMLDivElement | null>;
  onOpenOrgLedger: (business: BusinessCredit) => void;
  selectedFreeCreditBusinessAnchorId: string;
  setSelectedFreeCreditBusinessAnchorId: (value: string) => void;
  freeCreditGrantSearch: string;
  setFreeCreditGrantSearch: (value: string) => void;
  loadFreeCreditGrantHistory: () => void | Promise<void>;
  loadingFreeCreditGrantRows: boolean;
  freeCreditMenu:
    | "grant"
    | "grant-cancel"
    | "grant-history"
    | "usage-history"
    | "shipping-credit";
  setFreeCreditMenu: (
    value:
      | "grant"
      | "grant-cancel"
      | "grant-history"
      | "usage-history"
      | "shipping-credit",
  ) => void;
  grantCreditType: "general" | "shipping";
  setGrantCreditType: (value: "general" | "shipping") => void;
  selectedShippingCreditBusinessAnchorId: string;
  setSelectedShippingCreditBusinessAnchorId: (value: string) => void;
  selectedFreeCreditAmount: FreeCreditAmount;
  setSelectedFreeCreditAmount: (value: FreeCreditAmount) => void;
  selectedShippingCreditAmount: number;
  setSelectedShippingCreditAmount: (value: number) => void;
  freeCreditReason: string;
  setFreeCreditReason: (value: string) => void;
  shippingCreditReason: string;
  setShippingCreditReason: (value: string) => void;
  handleGrantFreeCredit: () => void | Promise<void>;
  handleGrantShippingCredit: () => void | Promise<void>;
  grantingFreeCredit: boolean;
  grantingShippingCredit: boolean;
  selectedFreeCreditBusiness: BusinessCredit | null;
  selectedShippingCreditBusiness: BusinessCredit | null;
  cancelStartDate: string;
  setCancelStartDate: (value: string) => void;
  cancelEndDate: string;
  setCancelEndDate: (value: string) => void;
  setCancelSkip: (value: number) => void;
  setFreeCreditGrantRows: (
    value:
      | FreeCreditGrantHistoryRow[]
      | ((prev: FreeCreditGrantHistoryRow[]) => FreeCreditGrantHistoryRow[]),
  ) => void;
  setCancelHasMore: (value: boolean) => void;
  filteredFreeCreditGrantRows: FreeCreditGrantHistoryRow[];
  selectedCancelGrantId: string;
  setSelectedCancelGrantId: (value: string) => void;
  cancelHasMore: boolean;
  loadMoreCancelGrants: () => void | Promise<void>;
  cancelGrantReason: string;
  setCancelGrantReason: (value: string) => void;
  handleCancelFreeCredit: () => void | Promise<void>;
  cancelingGrant: boolean;
  freeCreditGrantRows: FreeCreditGrantHistoryRow[];
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
  const totalChargedFreeRequest = Number(
    props.stats?.totalFreeRequest ?? props.stats?.totalBonusRequest ?? 0,
  );
  const totalChargedFreeShipping = Number(
    props.stats?.totalFreeShipping ?? props.stats?.totalBonusShipping ?? 0,
  );
  const totalPaidCredit = Number(props.stats?.totalPaidCredit || 0);
  const totalFreeRequestCredit = Number(
    props.stats?.totalFreeRequestCredit ?? props.stats?.totalBonusRequestCredit ?? 0,
  );
  const totalFreeShippingCredit = Number(
    props.stats?.totalFreeShippingCredit ?? props.stats?.totalBonusShippingCredit ?? 0,
  );
  const totalSpentPaid = Number(props.stats?.totalSpentPaidAmount || 0);
  const totalSpentFreeRequest = Number(
    props.stats?.totalSpentFreeRequestAmount ??
      props.stats?.totalSpentBonusRequestAmount ??
      0,
  );
  const totalSpentFreeShipping = Number(
    props.stats?.totalSpentFreeShippingAmount ??
      props.stats?.totalSpentBonusShippingAmount ??
      0,
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 사업자 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {props.loadingStats
                ? "..."
                : requestorBusinesses.length.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">크레딧 충전액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {props.loadingStats
                ? "..."
                : `${(
                    totalChargedPaid +
                    totalChargedFreeRequest +
                    totalChargedFreeShipping
                  ).toLocaleString()}원`}
            </div>
            <div className="text-xs text-muted-foreground">
              유료 {totalChargedPaid.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(의뢰) {totalChargedFreeRequest.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(배송) {totalChargedFreeShipping.toLocaleString()}원
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">크레딧 잔여액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {props.loadingStats
                ? "..."
                : `${(
                    totalPaidCredit +
                    totalFreeRequestCredit +
                    totalFreeShippingCredit
                  ).toLocaleString()}원`}
            </div>
            <div className="text-xs text-muted-foreground">
              유료 {totalPaidCredit.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(의뢰) {totalFreeRequestCredit.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(배송) {totalFreeShippingCredit.toLocaleString()}원
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">크레딧 사용액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {props.loadingStats
                ? "..."
                : `${(props.stats?.totalSpent || 0).toLocaleString()}원`}
            </div>
            <div className="text-xs text-muted-foreground">
              유료 {totalSpentPaid.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(의뢰) {totalSpentFreeRequest.toLocaleString()}원
            </div>
            <div className="text-xs text-muted-foreground">
              무료(배송) {totalSpentFreeShipping.toLocaleString()}원
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">미매칭 입금</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {props.loadingStats
                ? "..."
                : props.stats?.newBankTransactions || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="organizations" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="organizations">사업자별 크레딧</TabsTrigger>
            <TabsTrigger value="free-credit">무료 크레딧</TabsTrigger>
            <TabsTrigger value="verification">자동 매칭 검증</TabsTrigger>
            <TabsTrigger value="orders">충전 주문</TabsTrigger>
            <TabsTrigger value="transactions">입금 내역</TabsTrigger>
          </TabsList>
          <div className="w-full md:w-[360px]">
            <Input
              value={props.searchQuery}
              onChange={(e) => props.setSearchQuery(e.target.value)}
              placeholder="사업자명 / 사업자번호 / 대표자 / anchor ID 검색"
              className="h-10"
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
          businesses={requestorBusinesses}
          selectedFreeCreditBusinessAnchorId={props.selectedFreeCreditBusinessAnchorId}
          setSelectedFreeCreditBusinessAnchorId={
            props.setSelectedFreeCreditBusinessAnchorId
          }
          freeCreditGrantSearch={props.freeCreditGrantSearch}
          setFreeCreditGrantSearch={props.setFreeCreditGrantSearch}
          loadFreeCreditGrantHistory={props.loadFreeCreditGrantHistory}
          loadingFreeCreditGrantRows={props.loadingFreeCreditGrantRows}
          freeCreditMenu={props.freeCreditMenu}
          setFreeCreditMenu={props.setFreeCreditMenu}
          grantCreditType={props.grantCreditType}
          setGrantCreditType={props.setGrantCreditType}
          selectedShippingCreditBusinessAnchorId={
            props.selectedShippingCreditBusinessAnchorId
          }
          setSelectedShippingCreditBusinessAnchorId={
            props.setSelectedShippingCreditBusinessAnchorId
          }
          selectedFreeCreditAmount={props.selectedFreeCreditAmount}
          setSelectedFreeCreditAmount={props.setSelectedFreeCreditAmount}
          selectedShippingCreditAmount={props.selectedShippingCreditAmount}
          setSelectedShippingCreditAmount={
            props.setSelectedShippingCreditAmount
          }
          freeCreditReason={props.freeCreditReason}
          setFreeCreditReason={props.setFreeCreditReason}
          shippingCreditReason={props.shippingCreditReason}
          setShippingCreditReason={props.setShippingCreditReason}
          handleGrantFreeCredit={props.handleGrantFreeCredit}
          handleGrantShippingCredit={props.handleGrantShippingCredit}
          grantingFreeCredit={props.grantingFreeCredit}
          grantingShippingCredit={props.grantingShippingCredit}
          selectedFreeCreditBusiness={props.selectedFreeCreditBusiness}
          selectedShippingCreditBusiness={props.selectedShippingCreditBusiness}
          cancelStartDate={props.cancelStartDate}
          setCancelStartDate={props.setCancelStartDate}
          cancelEndDate={props.cancelEndDate}
          setCancelEndDate={props.setCancelEndDate}
          setCancelSkip={props.setCancelSkip}
          setFreeCreditGrantRows={props.setFreeCreditGrantRows}
          setCancelHasMore={props.setCancelHasMore}
          filteredFreeCreditGrantRows={props.filteredFreeCreditGrantRows}
          selectedCancelGrantId={props.selectedCancelGrantId}
          setSelectedCancelGrantId={props.setSelectedCancelGrantId}
          cancelHasMore={props.cancelHasMore}
          loadMoreCancelGrants={props.loadMoreCancelGrants}
          cancelGrantReason={props.cancelGrantReason}
          setCancelGrantReason={props.setCancelGrantReason}
          handleCancelFreeCredit={props.handleCancelFreeCredit}
          cancelingGrant={props.cancelingGrant}
          freeCreditGrantRows={props.freeCreditGrantRows}
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
