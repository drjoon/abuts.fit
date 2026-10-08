// - 2026-10-08: 단일가 1.5만(거래처별 1.2~1.5만은 딜러 설정·비공개). 그룹할인·묶음배송·월 가입 폐지, 딜리버리는 딜러/어벗츠 부담.
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/shared/api/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useRequestorBusinessAccess } from '@/shared/business/useRequestorBusinessAccess';
import {
  DELIVERY_MONTHLY_FEE,
  REQUESTOR_UNIT_PRICE_BASE,
  REQUESTOR_UNIT_PRICE_MIN,
  formatRequestorWon
} from '@/shared/pricing/requestorUnitPricePolicy';
import {
  formatAbutsManwon
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
import {
  DELIVERY_MONTHLY_PAYER_LINE,
  EXPRESS_SHIPPING_ARRIVAL_LINE,
  EXPRESS_SHIPPING_LABEL,
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
  const remakeAudience: RemakePolicyAudience = effectiveIsLab
    ? 'lab'
    : 'practice';
  const remakeRows = remakePolicyRows(remakeAudience);
  const remakeNotes = remakePolicyNoteLines(remakeAudience);
  const { token } = useAuthStore();
  /** 거래처 본인에게만 보이는 내 의뢰비(딜러가 정한 가격). 기본 1.5만. */
  const [myUnitPrice, setMyUnitPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!open || variant !== 'default' || !token) return;
    let canceled = false;
    void request<any>({
      path: '/api/requests/my/pricing-referral-stats',
      method: 'GET',
      token,
    })
      .then((res) => {
        const price = Number(res.data?.data?.effectiveUnitPrice);
        if (!canceled && res.ok && Number.isFinite(price) && price > 0) {
          setMyUnitPrice(price);
        }
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [open, variant, token]);
  useEffect(() => {
    if (!open || !isRequestorPreview) return;
    setRequestorKindTab('practice');
  }, [open, isRequestorPreview]);
  void dealershipActivePct;
  void dealershipBasePct;
  void dealershipEventPct;
  void dealershipEventEnabled;

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
          ? '소개한 거래처에 안내할 단가와 출고 기준입니다.'
          : '단가와 출고 기준을 확인하세요.';

  const hasMyDiscount =
    myUnitPrice != null && myUnitPrice < REQUESTOR_UNIT_PRICE_BASE;
  const priceBody = (
    <div className='space-y-3'>
      <div className='grid gap-2.5 sm:grid-cols-2'>
        <div className='rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm'>
          <div className='text-xs text-slate-500'>
            {hasMyDiscount ? '내 의뢰비 · 1개당' : '의뢰비 · 1개당'}
          </div>
          <div className='mt-1 flex items-baseline gap-2 tabular-nums'>
            <span className='text-2xl font-semibold tracking-tight text-slate-900'>
              {formatAbutsManwon(myUnitPrice ?? REQUESTOR_UNIT_PRICE_BASE)}
            </span>
            {hasMyDiscount ? (
              <span className='text-sm text-slate-400 line-through'>
                {formatAbutsManwon(REQUESTOR_UNIT_PRICE_BASE)}
              </span>
            ) : null}
          </div>
        </div>
        <div className='rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm'>
          <div className='text-xs text-slate-500'>{EXPRESS_SHIPPING_LABEL}</div>
          <div className='mt-1 text-2xl font-semibold tracking-tight text-slate-900'>
            무료
          </div>
          <div className='mt-0.5 text-xs text-slate-500'>
            0시까지 주문 · 익일 도착
          </div>
        </div>
      </div>

      <section className='rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm'>
        <div className='mb-2 text-sm font-medium text-slate-700'>리메이크</div>
        <div className='space-y-1.5'>
          {remakeRows.map((row) => (
            <div
              key={row.pathLabel}
              className='flex items-baseline justify-between gap-3'
            >
              <div className='min-w-0 text-xs text-slate-500'>
                {row.pathLabel}
              </div>
              <div className='shrink-0 text-sm font-semibold tabular-nums text-slate-900'>
                {row.priceLabel}
              </div>
            </div>
          ))}
        </div>
        <p className='mt-2 text-xs leading-relaxed text-slate-500'>
          {remakeNotes.map((line, idx) => (
            <span key={line}>
              {idx > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      </section>

      {effectiveIsLab && !isRequestorPreview ? (
        <SettlementPolicyFact label='정산'>
          {LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE}
        </SettlementPolicyFact>
      ) : null}

      {isRequestorPreview ? (
        <div className={GUIDE_FACT_GRID_CLASS}>
          <SettlementPolicyFact label='거래처별 가격'>
            {formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}~
            {formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원 안에서 정합니다.
            <br />
            거래처 본인에게만 보입니다.
          </SettlementPolicyFact>
          <SettlementPolicyFact label={EXPRESS_SHIPPING_LABEL}>
            월 {formatAbutsManwon(DELIVERY_MONTHLY_FEE)}은 거래처 1곳당 딜러가
            부담합니다.
            <br />
            딜러가 없으면 어벗츠가 부담합니다.
          </SettlementPolicyFact>
        </div>
      ) : null}
    </div>
  );

  return (
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
                거래처 판매가 − 1만원(부가세 포함)입니다.
                <br />
                판매가는 거래처별로 1.2~1.5만원 안에서 정합니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='소개 코드' className='break-keep'>
                {REFERRAL_OWNERSHIP_RESET_POLICY_LINE}
                <br />
                {REFERRAL_OWNERSHIP_RESET_ANYONE_LINE}
              </SettlementPolicyFact>
              <SettlementPolicyFact label='배송' className='break-keep'>
                {EXPRESS_SHIPPING_LABEL}만 운영합니다.
                <br />
                {DELIVERY_MONTHLY_PAYER_LINE}
                <br />
                월 {formatAbutsManwon(DELIVERY_MONTHLY_FEE)}은 정산액에서
                차감합니다.
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
                어벗 1개당 제조 5,500 · 개발운영 1,000 · 어벗츠 3,500원입니다.
                <br />
                나머지는 딜러(판매가 − 1만원)이며, 부가세 포함입니다.
              </SettlementPolicyFact>
              <SettlementPolicyFact label='딜러 없음'>
                딜러가 없으면 딜러 몫은 어벗츠가 가져갑니다.
                <br />
                딜리버리 월정액도 어벗츠가 부담합니다.
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
  );
};
