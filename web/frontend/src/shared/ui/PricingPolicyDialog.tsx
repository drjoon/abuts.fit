// - 2026-09-23: 런칭 이벤트 1만 / 정상가 1.3만 · FM덴탈 월정액 배송 선택.
// - 2026-09-22: 기공소 정책 안내 — 지정 플랫폼 수수료 카피 제거. 하청만.
// - 2026-09-21: 딜러십 정책 — 90일 주문 없음 시 소개 귀속 리셋 조항.
// - 2026-09-20: 딜러십 요율 10/15/20% · 가입 당시 요율 적용 안내.
// - 2026-09-20: 기공소 정책 안내 — 하청 % · 작업시작 적립 시 공제.
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
import { useLabTradingPartnerWindow } from '@/shared/lab/useLabTradingPartnerWindow';
import {
  REFERRAL_OWNERSHIP_RESET_POLICY_LINE,
} from '@/shared/sales/dealershipPolicyCopy';
import { apiFetch } from '@/shared/api/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useToast } from '@/shared/hooks/use-toast';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'default' | 'devops' | 'salesman';
  /** 딜러십 표준 요율 %(추후 공지 후). salesman variant. */
  dealershipBasePct?: number;
  /** 딜러십 이벤트 요율 %. salesman variant. */
  dealershipEventPct?: number;
  /** 이벤트 요율 적용 여부. salesman variant. */
  dealershipEventEnabled?: boolean;
};

function PolicySection({
  title,
  children,
  className = ''
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-slate-50 px-4 py-3.5 ${className}`}>
      <h3 className='text-sm font-semibold tracking-tight text-slate-900'>
        {title}
      </h3>
      <div className='mt-2.5 space-y-2 text-sm leading-relaxed text-slate-600'>
        {children}
      </div>
    </section>
  );
}

function PriceRow({
  label,
  value,
  unitLabel,
  secondaryValue,
  strikeValue,
  note,
  noteAction
}: {
  label: string;
  value: string;
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
        <div className='flex shrink-0 items-baseline gap-2 tabular-nums'>
          {strikeValue ? (
            <span className='text-base font-normal text-slate-400 line-through'>
              {strikeValue}
            </span>
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

function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className='space-y-1.5'>
      {items.map((item, i) => (
        <li key={i} className='flex gap-2'>
          <span className='mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400' />
          <span className='min-w-0'>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export const PricingPolicyDialog = ({
  open,
  onOpenChange,
  variant = 'default',
  dealershipBasePct = 10,
  dealershipEventPct = 20,
  dealershipEventEnabled = true,
}: Props) => {
  const { kind } = useRequestorBusinessAccess();
  const isLab = kind === 'lab';
  const { data: systemSettings, refetch: refetchSystemSettings } =
    useSystemSettings();
  const {
    windowInfo: labFeeWindow,
    refresh: refreshLabFeeWindow,
  } = useLabTradingPartnerWindow();
  const basePct = Math.max(0, Math.round(Number(dealershipBasePct) || 10));
  const eventPct = Math.max(0, Math.round(Number(dealershipEventPct) || 20));
  const eventOn = dealershipEventEnabled !== false;
  const effectivePct = eventOn ? eventPct : basePct;
  const credit = systemSettings?.creditSettings;
  const launchResolved = resolveCustomAbutmentProductionPriceForAt(new Date(), {
    membershipProductionPrice:
      credit?.membershipProductionPrice ??
      ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
    customAbutmentLaunchEventEnabled: credit?.customAbutmentLaunchEventEnabled,
    customAbutmentLaunchEventStartedAt: credit?.customAbutmentLaunchEventStartedAt,
    customAbutmentLaunchEventEndedAt: credit?.customAbutmentLaunchEventEndedAt,
    customAbutmentLaunchEventProductionPrice:
      credit?.customAbutmentLaunchEventProductionPrice ??
      ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  });
  const productionPrice = Math.max(
    0,
    Number(
      credit?.effectiveProductionPrice ??
        launchResolved.price ??
        ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
    ) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const regularPrice = Math.max(
    0,
    Number(
      credit?.membershipProductionPrice ??
        ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
    ) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const eventPrice = Math.max(
    0,
    Number(
      credit?.customAbutmentLaunchEventProductionPrice ??
        ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
    ) || ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  );
  const isLaunchEvent = launchResolved.tier === 'event';
  const shippingFee = Math.max(
    0,
    Number(
      credit?.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee,
    ) || CREDIT_SETTINGS_DEFAULTS.shippingFee,
  );
  const expressFee = Math.max(
    0,
    Number(
      credit?.expressFee ?? CREDIT_SETTINGS_DEFAULTS.expressFee,
    ) || CREDIT_SETTINGS_DEFAULTS.expressFee,
  );
  const fmMonthlyFee = Math.max(
    0,
    Number(credit?.fmDentalMonthlyShippingFee ?? 0) || 0,
  );
  const subcontractFeePct = Math.round(
    Number(labFeeWindow?.feeRates?.subcontractFeeRate ?? 0.05) * 100,
  );
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [fmState, setFmState] = useState<{
    active: boolean;
    cancelAtPeriodEnd: boolean;
    nextBillingAt: string | null;
    monthlyFee: number;
    joinAllowed: boolean;
    busy: boolean;
  }>({
    active: false,
    cancelAtPeriodEnd: false,
    nextBillingAt: null,
    monthlyFee: fmMonthlyFee,
    joinAllowed: false,
    busy: false,
  });

  useEffect(() => {
    if (!open) return;
    void refetchSystemSettings();
    if (isLab) void refreshLabFeeWindow();
  }, [open, isLab, refetchSystemSettings, refreshLabFeeWindow]);

  useEffect(() => {
    if (!open || variant !== 'default' || !token) return;
    let cancelled = false;
    void (async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: {
          fmDentalShippingActive?: boolean;
          fmDentalShippingCancelAtPeriodEnd?: boolean;
          fmDentalShippingNextBillingAt?: string | null;
          monthlyFee?: number;
          joinAllowed?: boolean;
        };
      }>({
        path: '/api/businesses/me/fm-dental-shipping',
        method: 'GET',
        token,
      });
      if (cancelled || !res.ok) return;
      const data = res.data?.data;
      setFmState((prev) => ({
        ...prev,
        active: Boolean(data?.fmDentalShippingActive),
        cancelAtPeriodEnd: Boolean(data?.fmDentalShippingCancelAtPeriodEnd),
        nextBillingAt: data?.fmDentalShippingNextBillingAt ?? null,
        monthlyFee: Math.max(0, Number(data?.monthlyFee ?? fmMonthlyFee) || 0),
        joinAllowed: data?.joinAllowed !== false && !isLaunchEvent,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, variant, token, fmMonthlyFee, isLaunchEvent]);

  const setFmDentalShipping = async (active: boolean) => {
    if (!token || fmState.busy) return;
    setFmState((prev) => ({ ...prev, busy: true }));
    try {
      const res = await apiFetch<{
        success?: boolean;
        message?: string;
        data?: {
          fmDentalShippingActive?: boolean;
          fmDentalShippingCancelAtPeriodEnd?: boolean;
          fmDentalShippingNextBillingAt?: string | null;
          monthlyFee?: number;
        };
      }>({
        path: '/api/businesses/me/fm-dental-shipping',
        method: 'POST',
        token,
        body: { active },
      });
      if (!res.ok) {
        toast({
          title: active ? '가입 실패' : '해지 실패',
          description:
            (res.data as { message?: string } | undefined)?.message ||
            '다시 시도해 주세요.',
          variant: 'destructive',
        });
        return;
      }
      const data = res.data?.data;
      setFmState((prev) => ({
        ...prev,
        active: Boolean(data?.fmDentalShippingActive),
        cancelAtPeriodEnd: Boolean(data?.fmDentalShippingCancelAtPeriodEnd),
        nextBillingAt: data?.fmDentalShippingNextBillingAt ?? null,
        monthlyFee: Math.max(
          0,
          Number(data?.monthlyFee ?? prev.monthlyFee) || 0,
        ),
      }));
      toast({
        title: res.data?.message || (active ? '가입했습니다.' : '해지 예약했습니다.'),
      });
    } finally {
      setFmState((prev) => ({ ...prev, busy: false }));
    }
  };

  const title =
    variant === 'devops'
      ? '개발운영사 분배 기준'
      : variant === 'salesman'
        ? '딜러십 정책'
        : '가격 · 출고 정책 안내';

  const subtitle =
    variant === 'devops'
      ? '유료의뢰비 정산 비율과 화면 안내를 확인하세요.'
      : variant === 'salesman'
        ? '기본·이벤트 요율과 배송비 수신자 부담을 확인하세요.'
        : isLab
          ? ''
          : '기공소에 · 어벗츠에 단가와 출고 기준을 확인하세요.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem] sm:rounded-2xl'>
        <DialogHeader className='shrink-0 border-b border-slate-100 px-6 pb-4 pt-6'>
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

        <div className='min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-8'>
          {variant === 'salesman' ? (
            <div className='space-y-3'>
              <PolicySection title='영업 수수료'>
                <p>
                  심플웨이·커스텀어벗 판매가 대비(
                  <span className='font-semibold text-slate-900'>
                    {eventOn ? eventPct : basePct}%
                  </span>
                  ). 배송비·월정액 배송 제외.
                </p>
                <BulletList
                  items={[
                    eventOn
                      ? `이벤트 기간인 지금은 ${eventPct}%. 요율 변경 예약으로 15%·10% 조정이 가능합니다.`
                      : `현재 표준 요율 ${basePct}%.`,
                    '대상: 심플웨이(스토어) · 커스텀어벗(런칭 1만 / 정상 1.3만)',
                    '소개 관계: 의뢰자 가입 시 입력한 딜러 코드',
                    REFERRAL_OWNERSHIP_RESET_POLICY_LINE,
                  ]}
                />
              </PolicySection>

              <PolicySection title='배송비'>
                <p>
                  배송비는{' '}
                  <span className='font-semibold text-slate-900'>
                    수신자(치과 또는 기공소)
                  </span>
                  가 부담합니다. 런칭 이벤트는 박스당 배송비, 정상가는 박스당 또는
                  FM덴탈 월정액 배송 중 선택합니다. 딜러 수수료 산정에서 배송비·월정액은
                  제외됩니다.
                </p>
              </PolicySection>

              <PolicySection title='집계 및 지급'>
                <BulletList
                  items={[
                    '매일 자정(KST 00:00) 사업자 기준으로 업데이트',
                    <>
                      지급 계좌는 <b className='text-slate-800'>설정 &gt; 결제</b>
                      에서 관리
                    </>,
                    '정산 원장은 사이드바 정산 페이지에서 확인'
                  ]}
                />
              </PolicySection>
            </div>
          ) : variant === 'devops' ? (
            <div className='space-y-3'>
              <PolicySection title='분배 구조'>
                <p>
                  커스텀어벗 판매가에서 제조사 매입 공급가를 선차감한 뒤, 잔여를
                  딜러·개발운영·어벗츠 비중으로 나눕니다. 개발운영사 몫은 지급 시
                  부가세가 합산됩니다.
                </p>
                <p>
                  딜러사 소개가 없으면 잔여를 개발운영·어벗츠(기본 20:80)로
                  분배합니다.
                </p>
              </PolicySection>

              <PolicySection title='화면 안내'>
                <BulletList
                  items={[
                    '정산 예정액: 미지급 누적 금액',
                    '지급 완료액: 지급 완료 누적 금액',
                    '사업자 요약: 기간별 사업자 매출·주문·정산 요약',
                    '정산 원장: 적립·정산·조정 내역'
                  ]}
                />
              </PolicySection>

              <PolicySection title='지급 계좌'>
                <p>
                  지급 계좌 정보는{' '}
                  <b className='text-slate-800'>설정 &gt; 수익 분배</b>에서
                  관리합니다.
                </p>
              </PolicySection>
            </div>
          ) : (
            <div className='space-y-3'>
              <section className='rounded-xl border border-slate-200 bg-white px-4 py-4'>
                <div className='space-y-3'>
                  <PriceRow
                    label={
                      isLab
                        ? '커스텀 어벗 생산'
                        : '어벗츠에 · 커스텀 어벗 생산'
                    }
                    value={formatAbutsManwon(productionPrice)}
                    unitLabel='1개당'
                    secondaryValue={
                      isLaunchEvent
                        ? `런칭 이벤트 가격 (정상가는 ${formatAbutsManwon(regularPrice)})`
                        : eventPrice !== regularPrice
                          ? `이벤트 시 ${formatAbutsManwon(eventPrice)}`
                          : undefined
                    }
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='커스텀 어벗 신속 출고'
                    value={`+${formatAbutsAbutmentServiceWon(expressFee)}`}
                    unitLabel='1개당'
                  />
                  <div className='h-px bg-slate-100' />
                  {isLaunchEvent || fmState.active ? (
                    <PriceRow
                      label='배송비'
                      value={
                        fmState.active
                          ? '월정액 포함'
                          : formatAbutsAbutmentServiceWon(shippingFee)
                      }
                      unitLabel={fmState.active ? undefined : '1박스당'}
                      note={
                        fmState.active
                          ? 'FM덴탈 월정액 배송 이용 중'
                          : '런칭 이벤트 기간 · 박스당 배송비'
                      }
                    />
                  ) : (
                    <div className='space-y-2'>
                      <div className='text-sm text-slate-600'>배송 (둘 중 선택)</div>
                      <PriceRow
                        label='박스당 배송비'
                        value={formatAbutsAbutmentServiceWon(shippingFee)}
                        unitLabel='1박스당'
                      />
                      <PriceRow
                        label='FM덴탈 월정액 배송'
                        value={
                          fmState.monthlyFee > 0
                            ? formatAbutsAbutmentServiceWon(fmState.monthlyFee)
                            : '관리자 설정 후'
                        }
                        unitLabel={fmState.monthlyFee > 0 ? '매월' : undefined}
                        note='가입 시 박스 배송비 0원'
                        noteAction={
                          variant === 'default' && !isLab ? (
                            <Button
                              type='button'
                              size='sm'
                              variant={fmState.active ? 'outline' : 'default'}
                              disabled={
                                fmState.busy ||
                                (!fmState.active &&
                                  (!fmState.joinAllowed ||
                                    fmState.monthlyFee <= 0))
                              }
                              onClick={() =>
                                void setFmDentalShipping(!fmState.active)
                              }
                            >
                              {fmState.active
                                ? fmState.cancelAtPeriodEnd
                                  ? '해지 예약됨'
                                  : '해지 예약'
                                : '가입'}
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                  <div className='h-px bg-slate-100' />
                  <div className='space-y-1.5'>
                    <div className='text-sm text-slate-600'>리메이크</div>
                    <div className='flex items-baseline justify-between gap-3'>
                      <div className='min-w-0 text-xs text-slate-500'>
                        치과로부터 의뢰
                      </div>
                      <div className='shrink-0 text-base font-semibold tracking-tight tabular-nums text-slate-900'>
                        기간 내 무료
                      </div>
                    </div>
                    <div className='flex items-baseline justify-between gap-3'>
                      <div className='min-w-0 text-xs text-slate-500'>
                        어벗츠로 의뢰
                      </div>
                      <div className='shrink-0 text-base font-semibold tracking-tight tabular-nums text-slate-900'>
                        10,000원
                      </div>
                    </div>
                    <p className='text-xs leading-relaxed text-slate-500'>
                      치과→기공소: 기공소 설정 무료 리메이크 기간(년) 이내.
                      <br />
                      어벗츠: 동일 치과·환자·치식·최근 180일.
                    </p>
                  </div>
                </div>
              </section>

              {isLab ? (
                <>
                  <PolicySection title='하청 수수료'>
                    <p>
                      하청 수행 의뢰는 작업시작 적립 시 매출액의{" "}
                      <span className='font-semibold tabular-nums text-slate-900'>
                        {subcontractFeePct}%
                      </span>
                      가 공제됩니다.
                    </p>
                  </PolicySection>
                  <PolicySection title='정산'>
                    <p>{LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE}</p>
                  </PolicySection>
                </>
              ) : null}

              <PolicySection title='출고 방식'>
                <div className='space-y-2.5'>
                  <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'>
                    <div className='text-sm font-semibold text-slate-900'>
                      묶음 출고
                    </div>
                    <p className='mt-1 text-xs leading-relaxed text-slate-600'>
                      설정한 출고 요일 중 가장 빠른 날에 함께 출고합니다.
                    </p>
                  </div>
                  <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'>
                    <div className='text-sm font-semibold text-slate-900'>
                      신속 출고
                    </div>
                    <p className='mt-1 text-xs leading-relaxed text-slate-600'>
                      영업일 12시 이전은 당일 16:00, 이후·휴일은 익영업일
                      16:00 목표. 묶음보다 빠를 때만 선택 가능하며, 1개당 +
                      {formatAbutsAbutmentServiceWon(expressFee)}이 추가됩니다.
                    </p>
                  </div>
                </div>
              </PolicySection>

              <PolicySection title='출고 일정 (KST)'>
                <div className='grid gap-2 sm:grid-cols-3'>
                  {[
                    { time: '0시', desc: '당일 의뢰 접수 마감' },
                    { time: '15:00', desc: '포장 마감' },
                    { time: '16:00', desc: '출고 (제조사 출발)' }
                  ].map((row) => (
                    <div
                      key={row.time}
                      className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-center sm:text-left'
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
              </PolicySection>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
