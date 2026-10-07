// - 2026-10-08: 의뢰자 정책 기공소 — 그룹할인(소개 그룹 주문량 합산) 안내.
// - 2026-10-08: 딜러 의뢰자 정책 — 치과/기공소 탭 분리. 치과=런칭 이벤트 단일가, 기공소=주문량 의뢰비.
// - 2026-10-08: 딜러십·의뢰자 모달 폭 sm:max-w-3xl(어중간 줄바꿈 완화).
// - 2026-10-08: 기공소 의뢰비 — 가입 90일 1만원·지난 30일 주문량 할인(최대 1만원)·매일 자정 확정. 치과는 기존 단일가·런칭 이벤트.
// - 2026-10-06: 택배 묶음 출고(박스당)·딜리버리 익일 도착(월 정액 VAT 포함).
// - 2026-10-06: 안내 모달 공통 크롬·fact 카드. 딜러·개발운영 문구 단축.
// - 2026-10-05: 딜러십 정책 — 커스텀어벗 10~20% 누적 구간. 심플웨이 지급 없음.
// - 2026-09-24: 딜러「의뢰자 정책」variant=requestor — 단가·출고.
// - 2026-10-07: 리메이크 — 역할별 라벨(기공소/치과) + remakePolicyCopy SSOT.
// - 2026-10-01: 런칭 이벤트 1.3만 / 정상가 1.5만.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRequestorBusinessAccess } from '@/shared/business/useRequestorBusinessAccess';
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings
} from '@/hooks/useSystemSettings';
import {
  REQUESTOR_UNIT_PRICE_BASE,
  REQUESTOR_UNIT_PRICE_FLOOR,
  REQUESTOR_UNIT_PRICE_INTRO_DAYS,
  REQUESTOR_UNIT_PRICE_INTRO_PRICE,
  REQUESTOR_UNIT_PRICE_MAX_DISCOUNT_ORDERS,
  REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT,
  formatRequestorWon
} from '@/shared/pricing/requestorUnitPricePolicy';
import {
  ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  formatAbutsAbutmentServiceWon,
  formatAbutsManwon,
  resolveCustomAbutmentProductionPriceForAt
} from '@/shared/pricing/abutsAbutmentService';
import { LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE } from '@/shared/settlement/labPayoutBankbook';
import { cn } from '@/shared/ui/cn';
import {
  GUIDE_DIALOG_BODY_CLASS,
  GUIDE_DIALOG_CONTENT_CLASS,
  GUIDE_DIALOG_HEADER_CLASS,
  GUIDE_FACT_GRID_CLASS,
  SettlementPolicyFact,
  SettlementPolicySection,
} from '@/shared/settlement/settlementUi';
import {
  DEALERSHIP_CUMULATIVE_BAND_LINE,
  REFERRAL_OWNERSHIP_RESET_ANYONE_LINE,
  REFERRAL_OWNERSHIP_RESET_POLICY_LINE,
} from '@/shared/sales/dealershipPolicyCopy';
import { DeliverySubscribeDialog } from '@/shared/shipping/DeliverySubscribeDialog';
import {
  BULK_SHIPPING_LABEL,
  BULK_SHIPPING_POLICY_LINE,
  DELIVERY_SUBSCRIBE_COMING_SOON_LINE,
  DELIVERY_SUBSCRIBE_CREDIT_LINE,
  DELIVERY_SUBSCRIBE_PERIOD_LINE,
  EXPRESS_SHIPPING_ARRIVAL_LINE,
  EXPRESS_SHIPPING_FEE_LINE,
  EXPRESS_SHIPPING_LABEL,
  resolveDeliveryNextDayMonthlyFee,
} from '@/shared/shipping/shippingPolicyCopy';
import {
  remakePolicyNoteLines,
  remakePolicyRows,
  type RemakePolicyAudience,
} from '@/shared/pricing/remakePolicyCopy';

type RequestorKindTab = 'practice' | 'lab';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * default=본인(치과·기공소) · requestor=딜러가 보는 의뢰자 안내 ·
   * salesman=딜러십 · devops=개발운영 분배
   */
  variant?: 'default' | 'devops' | 'salesman' | 'requestor';
  /** 지금 신규 유치 요율 %. salesman variant. */
  dealershipActivePct?: number;
  /** @deprecated */
  dealershipCommissionTiers?: unknown;
  /** @deprecated */
  dealershipBasePct?: number;
  /** @deprecated */
  dealershipEventPct?: number;
  /** @deprecated */
  dealershipEventEnabled?: boolean;
};

function PriceRow({
  label,
  value,
  valuePrefix,
  unitLabel,
  secondaryValue,
  strikeValue,
  note,
  noteAction
}: {
  label: string;
  value: string;
  valuePrefix?: string;
  unitLabel?: string;
  secondaryValue?: string;
  strikeValue?: string;
  note?: string;
  noteAction?: ReactNode;
}) {
  return (
    <div className='space-y-0.5'>
      <div className='flex items-baseline justify-between gap-3'>
        <div className='min-w-0 text-sm text-slate-600'>{label}</div>
        <div className='flex shrink-0 items-baseline gap-1.5 tabular-nums'>
          {strikeValue ? (
            <span className='text-base font-normal text-slate-400 line-through'>
              {strikeValue}
            </span>
          ) : null}
          {valuePrefix ? (
            <span className='text-sm font-normal text-slate-600'>{valuePrefix}</span>
          ) : null}
          <div className='text-xl font-semibold tracking-tight text-slate-900'>
            {value}
          </div>
        </div>
      </div>
      {unitLabel || secondaryValue ? (
        <div className='flex items-baseline justify-between gap-3'>
          <div className='min-w-0 text-xs text-slate-500'>{unitLabel}</div>
          {secondaryValue ? (
            <div className='shrink-0 text-xs tabular-nums text-slate-500'>
              {secondaryValue}
            </div>
          ) : null}
        </div>
      ) : note || noteAction ? (
        <div className='flex items-center justify-between gap-3'>
          {note ? (
            <div className='min-w-0 text-xs text-slate-500'>{note}</div>
          ) : (
            <span />
          )}
          {noteAction}
        </div>
      ) : null}
    </div>
  );
}

export const PricingPolicyDialog = ({
  open,
  onOpenChange,
  variant = 'default',
  dealershipActivePct = 20,
  dealershipBasePct = 10,
  dealershipEventPct = 20,
  dealershipEventEnabled = true,
}: Props) => {
  const { kind } = useRequestorBusinessAccess();
  const isLab = kind === 'lab';
  const isRequestorPreview = variant === 'requestor';
  const [requestorKindTab, setRequestorKindTab] =
    useState<RequestorKindTab>('practice');
  /** 딜러 미리보기 탭 · 본인 역할에 따라 기공소/치과 정책 분기. */
  const effectiveIsLab = isRequestorPreview
    ? requestorKindTab === 'lab'
    : isLab;
  /** 기공소=자정 스냅샷 의뢰비, 치과=런칭 이벤트 단일가. */
  const useLabUnitPricePolicy = effectiveIsLab;
  const remakeAudience: RemakePolicyAudience = effectiveIsLab
    ? 'lab'
    : 'practice';
  const remakeRows = remakePolicyRows(remakeAudience);
  const remakeNotes = remakePolicyNoteLines(remakeAudience);
  const showDeliveryJoin = variant === 'default' && !isRequestorPreview;
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { data: systemSettings, refetch: refetchSystemSettings } =
    useSystemSettings();
  useEffect(() => {
    if (!open) return;
    void refetchSystemSettings();
  }, [open, refetchSystemSettings]);
  useEffect(() => {
    if (!open || !isRequestorPreview) return;
    setRequestorKindTab('practice');
  }, [open, isRequestorPreview]);
  void dealershipActivePct;
  void dealershipBasePct;
  void dealershipEventPct;
  void dealershipEventEnabled;
  const credit = systemSettings?.creditSettings;
  const platformRegularPrice = Math.max(
    0,
    Number(
      credit?.listProductionPrice ??
        credit?.membershipProductionPrice ??
        ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
    ) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const launchResolved = resolveCustomAbutmentProductionPriceForAt(new Date(), {
    membershipProductionPrice: platformRegularPrice,
    customAbutmentLaunchEventEnabled: credit?.customAbutmentLaunchEventEnabled,
    customAbutmentLaunchEventStartedAt: credit?.customAbutmentLaunchEventStartedAt,
    customAbutmentLaunchEventEndedAt: credit?.customAbutmentLaunchEventEndedAt,
    customAbutmentLaunchEventProductionPrice:
      credit?.customAbutmentLaunchEventProductionPrice ??
      ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  });
  const regularPrice = platformRegularPrice;
  const eventPrice = Math.max(
    0,
    Number(
      credit?.customAbutmentLaunchEventProductionPrice ??
        ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
    ) || ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  );
  const isLaunchEvent =
    credit?.customAbutmentPricingTier === 'event' ||
    launchResolved.tier === 'event';
  const productionPrice = isLaunchEvent
    ? eventPrice
    : Math.max(
        0,
        Number(
          credit?.effectiveProductionPrice ??
            launchResolved.price ??
            regularPrice,
        ) || regularPrice,
      );
  const shippingFee = Math.max(
    0,
    Number(
      credit?.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee,
    ) || CREDIT_SETTINGS_DEFAULTS.shippingFee,
  );
  /** 딜리버리 익일 도착 월정액(VAT 포함). 표시 폴백 5.5만원. */
  const deliveryMonthlyFee = resolveDeliveryNextDayMonthlyFee(
    credit?.fmDentalMonthlyShippingFee,
  );

  const title =
    variant === 'devops'
      ? '개발운영사 분배 기준'
      : variant === 'salesman'
        ? '딜러십 정책'
        : variant === 'requestor'
          ? '의뢰자 정책'
          : '가격 · 출고 정책 안내';

  const subtitle =
    variant === 'devops'
      ? '유료의뢰비 정산 비율과 화면 안내를 확인하세요.'
      : variant === 'salesman'
        ? `커스텀어벗 ${DEALERSHIP_CUMULATIVE_BAND_LINE} · 90일 무주문이면 소개 코드 리셋.`
        : variant === 'requestor'
          ? requestorKindTab === 'lab'
            ? '소개한 기공소에 안내할 단가와 출고 기준입니다.'
            : '소개한 치과에 안내할 단가와 출고 기준입니다.'
          : isLab
            ? ''
            : '기공소에 · 어벗츠에 단가와 출고 기준을 확인하세요.';

  const priceBody = (
    <div className='space-y-3'>
      <section className='rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-slate-900/[0.02]'>
        <div className='space-y-3'>
          <PriceRow
            label={
              isRequestorPreview || effectiveIsLab
                ? '커스텀 어벗 생산'
                : '어벗츠에 · 커스텀 어벗 생산'
            }
            value={formatAbutsManwon(
              useLabUnitPricePolicy
                ? REQUESTOR_UNIT_PRICE_FLOOR
                : productionPrice,
            )}
            strikeValue={
              useLabUnitPricePolicy
                ? formatAbutsManwon(REQUESTOR_UNIT_PRICE_BASE)
                : isLaunchEvent && regularPrice !== productionPrice
                  ? formatAbutsManwon(regularPrice)
                  : undefined
            }
            unitLabel={useLabUnitPricePolicy ? '1개당 의뢰비' : '1개당'}
            secondaryValue={
              useLabUnitPricePolicy
                ? '최저가'
                : isLaunchEvent
                  ? '이벤트 중'
                  : eventPrice !== regularPrice
                    ? `이벤트 시 ${formatAbutsManwon(eventPrice)}`
                    : undefined
            }
          />
          <div className='h-px bg-slate-100' />
          <PriceRow
            label={BULK_SHIPPING_LABEL}
            value={formatAbutsAbutmentServiceWon(shippingFee)}
            valuePrefix='VAT 포함'
            unitLabel='1박스당'
            note='별도 부과'
          />
          <div className='h-px bg-slate-100' />
          <PriceRow
            label={EXPRESS_SHIPPING_LABEL}
            value={formatAbutsManwon(deliveryMonthlyFee)}
            valuePrefix='VAT 포함'
            unitLabel='매월'
            note={EXPRESS_SHIPPING_FEE_LINE}
            noteAction={
              showDeliveryJoin ? (
                <Button
                  type='button'
                  size='sm'
                  onClick={() => setSubscribeOpen(true)}
                >
                  가입
                </Button>
              ) : undefined
            }
          />
          <div className='h-px bg-slate-100' />
          <div className='space-y-1.5'>
            <div className='text-sm text-slate-600'>리메이크</div>
            {remakeRows.map((row) => (
              <div
                key={row.pathLabel}
                className='flex items-baseline justify-between gap-3'
              >
                <div className='min-w-0 text-xs text-slate-500'>
                  {row.pathLabel}
                </div>
                <div className='shrink-0 text-base font-semibold tracking-tight tabular-nums text-slate-900'>
                  {row.priceLabel}
                </div>
              </div>
            ))}
            <p className='text-xs leading-relaxed text-slate-500'>
              {remakeNotes.map((line, idx) => (
                <span key={line}>
                  {idx > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {effectiveIsLab && !isRequestorPreview ? (
        <SettlementPolicyFact label='정산'>
          {LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE}
        </SettlementPolicyFact>
      ) : null}

      <div className={GUIDE_FACT_GRID_CLASS}>
        {useLabUnitPricePolicy ? (
          <>
            <SettlementPolicyFact label='기공소 의뢰비 정책'>
              가입 후 {REQUESTOR_UNIT_PRICE_INTRO_DAYS}일간{' '}
              {formatRequestorWon(REQUESTOR_UNIT_PRICE_INTRO_PRICE)}원 고정
              <br />
              {REQUESTOR_UNIT_PRICE_INTRO_DAYS + 1}일부터 지난 30일 주문량으로
              결정
              <br />
              1건당 {REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT}원 할인,{' '}
              {REQUESTOR_UNIT_PRICE_MAX_DISCOUNT_ORDERS}건 이상이면 최대 할인
              <br />
              매일 자정(KST)에 정해 그날 하루 적용
            </SettlementPolicyFact>
            <SettlementPolicyFact label='그룹할인'>
              소개한 기공소 주문량을 합산해 할인합니다.
            </SettlementPolicyFact>
          </>
        ) : null}
        <SettlementPolicyFact label={BULK_SHIPPING_LABEL}>
          설정한 출고 요일 중 가장 빠른 날에 함께 출고합니다.
          <br />
          {BULK_SHIPPING_POLICY_LINE}
        </SettlementPolicyFact>
        <SettlementPolicyFact label={EXPRESS_SHIPPING_LABEL}>
          {EXPRESS_SHIPPING_ARRIVAL_LINE}
          <br />
          {DELIVERY_SUBSCRIBE_PERIOD_LINE}
          <br />
          {DELIVERY_SUBSCRIBE_CREDIT_LINE}
          <br />
          {DELIVERY_SUBSCRIBE_COMING_SOON_LINE}
        </SettlementPolicyFact>
      </div>

      <SettlementPolicySection title='출고 일정 (KST)'>
        <div className='grid gap-2 sm:grid-cols-3'>
          {[
            { time: '0시', desc: '당일 주문 마감' },
            { time: '익일', desc: '기공소(치과) 도착' },
            { time: '지정 요일', desc: '택배 묶음 출고' },
          ].map((row) => (
            <div
              key={row.time}
              className='rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-center shadow-sm sm:text-left'
            >
              <div className='text-base font-semibold tabular-nums text-slate-900'>
                {row.time}
              </div>
              <div className='mt-0.5 text-xs leading-relaxed text-slate-500'>
                {row.desc}
              </div>
            </div>
          ))}
        </div>
      </SettlementPolicySection>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          GUIDE_DIALOG_CONTENT_CLASS,
          variant === 'salesman' && 'sm:max-w-[52rem]',
        )}
      >
        <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
          <DialogTitle className='text-xl font-semibold tracking-tight text-slate-900'>
            {title}
          </DialogTitle>
          {subtitle ? (
            <DialogDescription className='text-sm text-slate-500'>
              {subtitle}
            </DialogDescription>
          ) : (
            <DialogDescription className='sr-only'>{title}</DialogDescription>
          )}
        </DialogHeader>

        <div className={GUIDE_DIALOG_BODY_CLASS}>
          {variant === 'salesman' ? (
            <div className={GUIDE_FACT_GRID_CLASS}>
              <SettlementPolicyFact
                label='영업 수수료'
                className='break-keep'
              >
                커스텀어벗은 {DEALERSHIP_CUMULATIVE_BAND_LINE}입니다.
                <br />
                기공·스토어·배송비·월정액은 제외합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='소개 코드' className='break-keep'>
                {REFERRAL_OWNERSHIP_RESET_POLICY_LINE}
                <br />
                {REFERRAL_OWNERSHIP_RESET_ANYONE_LINE}
              </SettlementPolicyFact>
              <SettlementPolicyFact label='배송' className='break-keep'>
                {BULK_SHIPPING_LABEL}은 1박스당 배송비가 별도입니다.
                <br />
                {EXPRESS_SHIPPING_LABEL}은 월 정액(VAT 포함)입니다.
                <br />
                딜러 수수료 산정에서 배송비·월정액은 빠집니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='집계 · 지급' className='break-keep'>
                매일 자정(KST) 사업자 기준으로 업데이트합니다.
                <br />
                계좌는 설정 › 결제, 원장은 정산 페이지입니다.
              </SettlementPolicyFact>
            </div>
          ) : variant === 'devops' ? (
            <div className={GUIDE_FACT_GRID_CLASS}>
              <SettlementPolicyFact label='분배 구조'>
                판매가에서 제조 매입을 뺀 뒤 딜러·개발운영·어벗츠로
                나눕니다.
                <br />
                개발운영 몫은 지급 시 부가세가 합산됩니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='딜러 없음'>
                딜러 소개가 없으면 잔여를 개발운영·어벗츠(기본 20:80)로
                분배합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='화면'>
                정산 예정액·지급 완료액·사업자 요약·정산 원장으로
                확인합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='지급 계좌'>
                설정 › 수익 분배에서 관리합니다.
              </SettlementPolicyFact>
            </div>
          ) : isRequestorPreview ? (
            <Tabs
              value={requestorKindTab}
              onValueChange={(v) =>
                setRequestorKindTab(v === 'lab' ? 'lab' : 'practice')
              }
            >
              <TabsList className='grid h-10 w-full grid-cols-2'>
                <TabsTrigger value='practice'>치과</TabsTrigger>
                <TabsTrigger value='lab'>기공소</TabsTrigger>
              </TabsList>
              <div className='mt-3'>{priceBody}</div>
            </Tabs>
          ) : (
            priceBody
          )}
        </div>
      </DialogContent>
    </Dialog>
    <DeliverySubscribeDialog
      open={subscribeOpen}
      onOpenChange={setSubscribeOpen}
      monthlyFee={deliveryMonthlyFee}
    />
    </>
  );
};
