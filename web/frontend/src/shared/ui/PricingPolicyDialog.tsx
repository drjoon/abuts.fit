// - 2026-10-06: 택배 묶음 출고(박스당)·딜리버리 익일 도착(월 정액 VAT 포함).
// - 2026-10-06: 안내 모달 공통 크롬·fact 카드. 딜러·개발운영 문구 단축.
// - 2026-10-05: 딜러십 정책 — 커스텀어벗 10~20% 누적 구간. 심플웨이 지급 없음.
// - 2026-09-27: 딜러십 정책 — 심플웨이 10% · 커스텀어벗 20% · 기공 제외 · 소개 코드 리셋.
// - 2026-09-26: 기공소 정책 — 수수료 제목·협력·하청 문장.
// - 2026-10-05: 플랫폼 사용료·하청 수수료 안내 삭제(미부과).
// - 2026-09-26: 기공소 정책 — 플랫폼 사용료·영업 수수료 안내를 단축.
// - 2026-09-23: 런칭 이벤트 중 — 정상가 취소선 + 이벤트가 · 「이벤트 중」.
// - 2026-09-23: FM덴탈 월정액 가입 — 기공소만(치과 제외).
// - 2026-10-01: 취소선은 플랫폼 정상가. 열 때 서버 설정을 다시 읽음.
// - 2026-10-01: 런칭 이벤트 1.3만 / 정상가 1.5만.
// - 2026-09-23: 런칭 이벤트 1만 / 정상가 1.3만 · FM덴탈 월정액 배송 선택.
// - 2026-09-24: 딜러「의뢰자 정책」variant=requestor — 단가·출고 + 기공소 플랫폼 사용료(~~2%~~→0%).
// - 2026-09-24: 기공소 정책 안내 — 플랫폼 사용료 정책 2% · 이벤트 0% 복원.
// - 2026-09-21: 딜러십 정책 — 90일 주문 없음 시 소개 귀속 리셋 조항.
// - 2026-09-20: 딜러십 요율 10/15/20% · 가입 당시 요율 적용 안내.
// - 2026-09-20: 기공소 정책 안내 — 하청 % · 작업시작 적립 시 공제.
// - 2026-10-07: 모달 가로폭 sm:max-w-3xl → 80%(38.4rem).
// - 2026-10-07: 리메이크 — 행 라벨에 플랫폼 이용 조건, 노트는 180일·배송비.
// - 2026-10-07: 리메이크 — 역할별 라벨(기공소/치과/공개) + remakePolicyCopy SSOT.
// - 2026-10-07: 리메이크 — 어벗츠로부터=무료, 어벗츠로=건당 1만원.
// - 2026-10-07: 리메이크 — 경로 구분 제거, 월 3건 무료 / 4건부터 개당 1만원(폐지).
// - 2026-10-07: 리메이크 — 치과로부터·어벗츠로 모두 월 3건 무료 / 4건부터 개당 1만원(폐지).
// - 2026-09-21: 치과→기공소 리메이크=기공소 freeRemakeYears 기간 내 무료.
// - 2026-09-20: 기공소 정책 안내 — 커스텀어벗 정산은 STL·생산비 지급 뒤.
// - 2026-09-12: 리메이크를 가격 카드(배송비 아래)로 이동. 치과로부터=무료, 어벗츠로=1만원.
// - 2026-09-09: 리메이크 월 3건 무료 → 건당 10,000원 안내.
// - 2026-09-03: 기공소 정책 — 단가 라벨·안내 문장 단축. 출고 리드타임(직경) 섹션 제거.
// - 2026-09-03: 기공소 정책 안내 부제(기공의뢰수신·어벗생산의뢰…) 제거.
// - 2026-08-23: 정책 안내 모달 flex 스크롤 + 하단 여백(pb-8).
// - 2026-08-23: 의뢰자 변형에 부가세 없음(면세) 안내. devops 레거시 65% 문구 제거.
// - 2026-08-22: design_custom_abutment 청구 폐기. 생산 단가·신속·배송만 안내.
// - 2026-08-19: 치과·기공소 디자인+생산 모두 구강지그 제외.
// - 2026-08-19: 치과 고시 단가=creditSettings 멤버십 생산/디자인+생산. 크레딧 차감과 동일 SSOT.
// - 2026-08-18: 치과 리메이크를 의뢰 취소와 같은 카드로 분리. 가격 카드 하단 구강스캔/보철 안내 삭제.
// - 2026-08-18: 치과 정책 — 멤버십/구독 제거. 서비스 3종 단일가(어벗디자인·구강스캔·풀세트).
// - 2026-08-17: 디자인비+지그제작비(수락 기공소 지급) 행 추가. 견적 요약의 기공비(보철+디자인) 분류와 맞춤.
// - 2026-08-16: 기공소는 멤버십 없이 CNC 1만/2만·환봉 2만/3만(지그 제외) 고정 단가. 치과는 기존 멤버십 안내 유지.
// - 2026-08-14: 환봉어벗 단가를 creditSettings에서 읽어 표시(0원이면 별도 고지).
// - 2026-08-14: CNC어벗 디자인+생산 의뢰 멤버십/일반가 복구.
// - 2026-08-14: CNC어벗 생산만(2만/멤버십 1.5만) · CNC어벗 디자인+생산(4만) · 환봉어벗 별도 고지 순.
// - 2026-08-14: 환봉 커스텀어벗 1개당 가격 별도 고지 행 추가.
// - 2026-08-13: 생산·디자인+생산 단가를 creditSettings(멤버십/일반)에서 읽음.
// - 2026-08-13: 생산 일반 2.0만→멤버십 1.5만, 디자인+생산 일반 4.0만→멤버십 2.5만. 단가 글자 확대.
// - 2026-08-13: 이용 중/해지 예약 클릭 시 멤버십 모달.
// - 2026-08-13: 생산·디자인+생산 일반가 취소선, 멤버십 단가 강조.
// - 2026-08-13: 치과 멤버십 가입 → 가입 모달.
// - 2026-08-13: 가입 축하 크레딧 — 치과 숨김, 기공소는 금액·1회 지급만 표시.
// - 2026-08-13: 기본 가격 제목 삭제. 멤버십 단가+일반 소형 병기, 치과 멤버십 자동결제 안내.
// - 2026-08-13: 생산만 15,000·디자인+생산 25,000 기재, 배송비 박스단위 별도.
// - 2026-08-12: 모달 제목을 커스텀 어벗 생산 가격 · 출고 정책 안내로 변경, 디자인 10,000원 행 삭제.
// - 2026-08-11: 기본가 12,000/디자인 10,000·주문량할인·소개합산·런칭이벤트·디자인+생산 장문 삭제, 출고 안내 단축.
// - 2026-08-09: 디자인+생산 신속비=어벗 수 배수 안내.
// - 2026-08-09: 디자인+생산 출고 +1영업일 안내(가격·리드타임·출고 방식).
// - 2026-08-06: 배송/발송 표기를 출고로 통일 (제조사 출발일). 배송비(수수료) 표기는 유지.
// - 2026-08-08: 정책 안내 모달 섹션 카드·가격 하이라이트·리드타임 그리드로 스타일 개선.
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
import { useRequestorBusinessAccess } from '@/shared/business/useRequestorBusinessAccess';
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings
} from '@/hooks/useSystemSettings';
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
  const remakeAudience: RemakePolicyAudience = isRequestorPreview
    ? 'public'
    : isLab
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
          ? '가격 · 출고 정책 안내'
          : '가격 · 출고 정책 안내';

  const subtitle =
    variant === 'devops'
      ? '유료의뢰비 정산 비율과 화면 안내를 확인하세요.'
      : variant === 'salesman'
        ? `커스텀어벗 ${DEALERSHIP_CUMULATIVE_BAND_LINE} · 90일 무주문이면 소개 코드 리셋.`
        : variant === 'requestor'
          ? '소개한 치과·기공소에 안내할 단가와 출고 기준입니다.'
          : isLab
            ? ''
            : '기공소에 · 어벗츠에 단가와 출고 기준을 확인하세요.';

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(GUIDE_DIALOG_CONTENT_CLASS, 'sm:max-w-[38.4rem]')}
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
              <SettlementPolicyFact label="영업 수수료">
                커스텀어벗은 {DEALERSHIP_CUMULATIVE_BAND_LINE}입니다.
                <br />
                기공·스토어·배송비·월정액은 제외합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label="소개 코드">
                {REFERRAL_OWNERSHIP_RESET_POLICY_LINE}
                <br />
                {REFERRAL_OWNERSHIP_RESET_ANYONE_LINE}
              </SettlementPolicyFact>
              <SettlementPolicyFact label="배송">
                {BULK_SHIPPING_LABEL}은 1박스당 배송비가 별도입니다.
                <br />
                {EXPRESS_SHIPPING_LABEL}은 월 정액(VAT 포함)입니다.
                <br />
                딜러 수수료 산정에서 배송비·월정액은 빠집니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label="집계 · 지급">
                매일 자정(KST) 사업자 기준으로 업데이트합니다.
                <br />
                계좌는 설정 › 결제, 원장은 정산 페이지입니다.
              </SettlementPolicyFact>
            </div>
          ) : variant === 'devops' ? (
            <div className={GUIDE_FACT_GRID_CLASS}>
              <SettlementPolicyFact label="분배 구조">
                판매가에서 제조 매입을 뺀 뒤 딜러·개발운영·어벗츠로
                나눕니다.
                <br />
                개발운영 몫은 지급 시 부가세가 합산됩니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label="딜러 없음">
                딜러 소개가 없으면 잔여를 개발운영·어벗츠(기본 20:80)로
                분배합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label="화면">
                정산 예정액·지급 완료액·사업자 요약·정산 원장으로
                확인합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label="지급 계좌">
                설정 › 수익 분배에서 관리합니다.
              </SettlementPolicyFact>
            </div>
          ) : (
            <div className='space-y-3'>
              <section className='rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-slate-900/[0.02]'>
                <div className='space-y-3'>
                  <PriceRow
                    label={
                      isLab && !isRequestorPreview
                        ? '커스텀 어벗 생산'
                        : isRequestorPreview
                          ? '커스텀 어벗 생산'
                          : '어벗츠에 · 커스텀 어벗 생산'
                    }
                    value={formatAbutsManwon(productionPrice)}
                    strikeValue={
                      isLaunchEvent && regularPrice !== productionPrice
                        ? formatAbutsManwon(regularPrice)
                        : undefined
                    }
                    unitLabel='1개당'
                    secondaryValue={
                      isLaunchEvent
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

              {isLab && !isRequestorPreview ? (
                <SettlementPolicyFact label="정산">
                  {LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE}
                </SettlementPolicyFact>
              ) : null}

              <div className={GUIDE_FACT_GRID_CLASS}>
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
                    { time: '지정 요일', desc: '택배 묶음 출고' }
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
