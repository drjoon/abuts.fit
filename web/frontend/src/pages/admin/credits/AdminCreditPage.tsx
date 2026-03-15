import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { SnapshotRecalcAllButton } from "@/shared/components/SnapshotRecalcAllButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { RequestorCreditTab } from "./components/RequestorCreditTab";
import { SalesmanCreditTab } from "./components/SalesmanCreditTab";
import { AdminCreditApprovalDialogs } from "./components/AdminCreditApprovalDialogs";
import { useAdminCreditPage } from "./hooks/useAdminCreditPage";

export default function AdminCreditPage() {
  const state = useAdminCreditPage();
  const { setPeriod } = usePeriodStore();

  return (
    <div className="space-y-6 p-6 overflow-hidden">
      <Tabs
        value={state.creditTab}
        onValueChange={(v) => state.setCreditTab(v as "requestor" | "salesman")}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TabsList className="h-12">
              <TabsTrigger value="requestor" className="px-6 text-base">
                의뢰자
              </TabsTrigger>
              <TabsTrigger value="salesman" className="px-6 text-base">
                소개자
              </TabsTrigger>
            </TabsList>
            <PeriodFilter value={state.period} onChange={setPeriod} />
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground text-right">
              <div>
                마지막 재계산{' '}
                {state.loadingSnapshotStatus
                  ? '...'
                  : state.snapshotStatus?.lastComputedAt
                    ? new Date(state.snapshotStatus.lastComputedAt).toLocaleString('ko-KR')
                    : '-'}
              </div>
              <div>
                기준{' '}
                {state.snapshotStatus?.baseYmd
                  ? `${state.snapshotStatus.baseYmd} 자정 기준 30일`
                  : '-'}
                {state.snapshotStatus?.snapshotMissing ? ' · 누락' : ''}
              </div>
            </div>
            <SnapshotRecalcAllButton
              token={state.token}
              periodKey="30d"
              className="h-9"
              onSuccess={async () => {
                await Promise.all([
                  state.loadSalesmanOverview(),
                  state.loadSnapshotStatus(),
                  state.loadSalesmen({ reset: true }),
                ]);
              }}
            />
          </div>
        </div>

        <TabsContent value="requestor" className="space-y-4">
          <RequestorCreditTab
            loadingStats={state.loadingStats}
            stats={state.stats}
            orgSortKey={state.orgSortKey}
            setOrgSortKey={state.setOrgSortKey}
            loadingOrgs={state.loadingOrgs}
            businesses={state.businesses}
            orgScrollRef={state.orgScrollRef}
            orgSentinelRef={state.orgSentinelRef}
            onOpenOrgLedger={(business) => {
              state.setOrgLedgerBusiness(business);
              state.setOrgLedgerOpen(true);
            }}
            selectedBonusBusinessAnchorId={state.selectedBonusBusinessAnchorId}
            setSelectedBonusBusinessAnchorId={state.setSelectedBonusBusinessAnchorId}
            bonusGrantSearch={state.bonusGrantSearch}
            setBonusGrantSearch={state.setBonusGrantSearch}
            loadBonusGrantHistory={state.loadBonusGrantHistory}
            loadingBonusGrantRows={state.loadingBonusGrantRows}
            freeCreditMenu={state.freeCreditMenu}
            setFreeCreditMenu={state.setFreeCreditMenu}
            grantCreditType={state.grantCreditType}
            setGrantCreditType={state.setGrantCreditType}
            selectedShippingCreditBusinessAnchorId={state.selectedShippingCreditBusinessAnchorId}
            setSelectedShippingCreditBusinessAnchorId={state.setSelectedShippingCreditBusinessAnchorId}
            selectedBonusAmount={state.selectedBonusAmount}
            setSelectedBonusAmount={state.setSelectedBonusAmount}
            selectedShippingCreditAmount={state.selectedShippingCreditAmount}
            setSelectedShippingCreditAmount={state.setSelectedShippingCreditAmount}
            bonusReason={state.bonusReason}
            setBonusReason={state.setBonusReason}
            shippingCreditReason={state.shippingCreditReason}
            setShippingCreditReason={state.setShippingCreditReason}
            handleGrantFreeCredit={state.handleGrantFreeCredit}
            handleGrantShippingCredit={state.handleGrantShippingCredit}
            grantingBonus={state.grantingBonus}
            grantingShippingCredit={state.grantingShippingCredit}
            selectedBonusBusiness={state.selectedBonusBusiness}
            selectedShippingCreditBusiness={state.selectedShippingCreditBusiness}
            cancelStartDate={state.cancelStartDate}
            setCancelStartDate={state.setCancelStartDate}
            cancelEndDate={state.cancelEndDate}
            setCancelEndDate={state.setCancelEndDate}
            setCancelSkip={state.setCancelSkip}
            setBonusGrantRows={state.setBonusGrantRows}
            setCancelHasMore={state.setCancelHasMore}
            filteredBonusGrantRows={state.filteredBonusGrantRows}
            selectedCancelGrantId={state.selectedCancelGrantId}
            setSelectedCancelGrantId={state.setSelectedCancelGrantId}
            cancelHasMore={state.cancelHasMore}
            loadMoreCancelGrants={state.loadMoreCancelGrants}
            cancelGrantReason={state.cancelGrantReason}
            setCancelGrantReason={state.setCancelGrantReason}
            handleCancelFreeCredit={state.handleCancelFreeCredit}
            cancelingGrant={state.cancelingGrant}
            bonusGrantRows={state.bonusGrantRows}
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
            setSelectedOrder={state.setSelectedOrder}
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
          salesmen={state.salesmen}
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
  );
}
