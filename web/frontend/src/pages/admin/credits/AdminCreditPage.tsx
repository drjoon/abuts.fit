// change-log:
// - 2026-09-01: fillHeight 작업영역 — workspace-nested-scroll로 카드 오른쪽 끝 수직 스크롤.
// - 2026-08-14: 의뢰자 탭 라벨을 「치과 · 기공소」로 표기.
// - 2026-08-13: 무료 일반/배송 통합에 맞춰 페이지 props·탭 스타일 정리.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/components/SalesmanCreditTab.tsx
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { RequestorCreditTab } from "./components/RequestorCreditTab";
import { SalesmanCreditTab } from "./components/SalesmanCreditTab";
import { AdminCreditApprovalDialogs } from "./components/AdminCreditApprovalDialogs";
import { useAdminCreditPage } from "./hooks/useAdminCreditPage";

export default function AdminCreditPage() {
  const state = useAdminCreditPage();

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredBusinesses = useMemo(() => {
    if (!normalizedSearch) return state.businesses;
    return state.businesses.filter((business) => {
      const haystack = [
        business._id,
        business.name,
        business.companyName,
        business.businessNumber,
        business.representativeName,
        business.ownerName,
        business.ownerEmail,
      ]
        .map((value) => String(value || ""))
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [state.businesses, normalizedSearch]);

  const filteredAllRequestorBusinesses = useMemo(() => {
    if (!normalizedSearch) return state.allRequestorBusinesses;
    return state.allRequestorBusinesses.filter((business) => {
      const haystack = [
        business._id,
        business.name,
        business.companyName,
        business.businessNumber,
        business.representativeName,
        business.ownerName,
        business.ownerEmail,
      ]
        .map((value) => String(value || ""))
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [state.allRequestorBusinesses, normalizedSearch]);

  const filteredSalesmen = useMemo(() => {
    if (!normalizedSearch) return state.salesmen;
    return state.salesmen.filter((salesman) => {
      const haystack = [
        salesman.salesmanId,
        salesman.name,
        salesman.email,
        salesman.referralCode,
      ]
        .map((value) => String(value || ""))
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [state.salesmen, normalizedSearch]);

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="space-y-5">
      <Tabs
        value={state.creditTab}
        onValueChange={(v) => state.setCreditTab(v as "requestor" | "salesman")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto min-w-0 flex-wrap rounded-xl bg-slate-100/80 p-1">
            <TabsTrigger value="requestor" className="rounded-lg px-5 text-sm">
              치과 · 기공소
            </TabsTrigger>
            <TabsTrigger value="salesman" className="rounded-lg px-5 text-sm">
              딜러
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {state.creditTab === "salesman" ? (
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="딜러명 · 이메일 · 추천코드"
                className="h-10 w-full rounded-xl border-slate-200 sm:w-[280px] lg:w-[360px]"
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => navigate("/dashboard/businesses?reconcile=1")}
            >
              <Wrench className="mr-2 h-4 w-4" />
              크레딧 업데이트
            </Button>
          </div>
        </div>

        <TabsContent value="requestor" className="mt-4 space-y-4">
          <RequestorCreditTab
            loadingStats={state.loadingStats}
            stats={state.stats}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            orgSortKey={state.orgSortKey}
            setOrgSortKey={state.setOrgSortKey}
            loadingOrgs={state.loadingOrgs}
            allRequestorBusinesses={filteredAllRequestorBusinesses}
            businesses={filteredBusinesses}
            orgScrollRef={state.orgScrollRef}
            orgSentinelRef={state.orgSentinelRef}
            onOpenOrgLedger={(business) => {
              state.setOrgLedgerBusiness(business);
              state.setOrgLedgerOpen(true);
            }}
            loadFreeCreditGrantHistory={state.loadFreeCreditGrantHistory}
            loadingFreeCreditGrantRows={state.loadingFreeCreditGrantRows}
            handleGrantFreeCredit={state.handleGrantFreeCredit}
            grantingFreeCredit={state.grantingFreeCredit}
            freeCreditGrantRows={state.freeCreditGrantRows}
            handleCancelFreeCredit={state.handleCancelFreeCredit}
            cancelingGrant={state.cancelingGrant}
            filteredFreeCreditUsageRows={state.filteredFreeCreditUsageRows}
            orderStatusFilter={state.orderStatusFilter}
            setOrderStatusFilter={state.setOrderStatusFilter}
            setOrderSkip={state.setOrderSkip}
            setOrderHasMore={state.setOrderHasMore}
            loadChargeOrders={state.loadChargeOrders}
            loadingOrders={state.loadingOrders}
            chargeOrders={state.chargeOrders}
            orderScrollRef={state.orderScrollRef}
            orderSentinelRef={state.orderSentinelRef}
            setApproveModalOpen={state.setApproveModalOpen}
            setRejectNote={state.setRejectNote}
            setRejectModalOpen={state.setRejectModalOpen}
            txTab={state.txTab}
            setTxTab={state.setTxTab}
            txStatusFilter={state.txStatusFilter}
            setTxStatusFilter={state.setTxStatusFilter}
            setTxSkip={state.setTxSkip}
            setTxHasMore={state.setTxHasMore}
            loadBankTransactions={state.loadBankTransactions}
            loadingTransactions={state.loadingTransactions}
            bankTransactions={state.bankTransactions}
            txScrollRef={state.txScrollRef}
            txSentinelRef={state.txSentinelRef}
            selectedTx={state.selectedTx}
            setSelectedTx={state.setSelectedTx}
            selectedOrder={state.selectedOrder}
            setSelectedOrder={state.setSelectedOrder}
            matchNote={state.matchNote}
            setMatchNote={state.setMatchNote}
            matchForce={state.matchForce}
            setMatchForce={state.setMatchForce}
            handleManualMatch={state.handleManualMatch}
            matching={state.matching}
          />
        </TabsContent>

        <SalesmanCreditTab
          loadingSalesmanOverview={state.loadingSalesmanOverview}
          salesmanSummary={state.salesmanSummary}
          salesmanSortKey={state.salesmanSortKey}
          setSalesmanSortKey={state.setSalesmanSortKey}
          loadingSalesmen={state.loadingSalesmen}
          salesmen={filteredSalesmen}
          salesmanScrollRef={state.salesmanScrollRef}
          salesmanSentinelRef={state.salesmanSentinelRef}
          onOpenLedger={(row) => {
            state.setSalesmanLedgerRow(row);
            state.setSalesmanLedgerOpen(true);
          }}
        />
      </Tabs>

      <CreditLedgerModal
        open={state.orgLedgerOpen}
        onOpenChange={(open) => {
          state.setOrgLedgerOpen(open);
          if (!open) state.setOrgLedgerBusiness(null);
        }}
        businessAnchorId={state.orgLedgerBusiness?._id}
        titleSuffix={state.orgLedgerBusiness?.name}
      />

      <SalesmanLedgerModal
        open={state.salesmanLedgerOpen}
        onOpenChange={(open) => {
          state.setSalesmanLedgerOpen(open);
          if (!open) state.setSalesmanLedgerRow(null);
        }}
        salesmanId={state.salesmanLedgerRow?.salesmanId}
        titleSuffix={state.salesmanLedgerRow?.name}
      />

      <AdminCreditApprovalDialogs
        approveModalOpen={state.approveModalOpen}
        setApproveModalOpen={state.setApproveModalOpen}
        rejectModalOpen={state.rejectModalOpen}
        setRejectModalOpen={state.setRejectModalOpen}
        selectedOrder={state.selectedOrder}
        rejectNote={state.rejectNote}
        setRejectNote={state.setRejectNote}
        processingApproval={state.processingApproval}
        onApprove={state.handleApprove}
        onReject={state.handleReject}
      />
      </div>
    </div>
  );
}
