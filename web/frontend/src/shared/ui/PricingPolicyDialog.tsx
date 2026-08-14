// change-log:
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
// - web/frontend/src/features/platform/PracticeMembershipJoinDialog.tsx
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { request } from '@/shared/api/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useRequestorBusinessAccess } from '@/shared/business/useRequestorBusinessAccess';
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings
} from '@/hooks/useSystemSettings';
import { usePracticeMembershipStatus } from '@/shared/pricing/useAbutsAbutmentPricingTier';
import { PracticeMembershipJoinDialog } from '@/features/platform/PracticeMembershipJoinDialog';
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  formatAbutsAbutmentServiceWon,
  formatAbutsManwon
} from '@/shared/pricing/abutsAbutmentService';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'default' | 'devops' | 'salesman';
};

type LeadTimeRange = { minBusinessDays: number; maxBusinessDays: number };
type DiameterKey = 'd6' | 'd8' | 'd10' | 'd12';

const DEFAULT_LEAD_TIMES: Record<DiameterKey, LeadTimeRange> = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 }
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

function resolveRoundBarPriceRow(regular: number, membership: number) {
  const hasRegular = regular > 0;
  const hasMembership = membership > 0;
  if (!hasRegular && !hasMembership) {
    return {
      value: '가격 별도 고지',
      strikeValue: undefined as string | undefined,
      unitLabel: '1개당'
    };
  }
  if (hasRegular && hasMembership) {
    return {
      value: `멤버십 ${formatAbutsManwon(membership)}`,
      strikeValue: formatAbutsManwon(regular),
      unitLabel: '1개당'
    };
  }
  if (hasMembership) {
    return {
      value: `멤버십 ${formatAbutsManwon(membership)}`,
      strikeValue: undefined as string | undefined,
      unitLabel: '1개당'
    };
  }
  return {
    value: formatAbutsManwon(regular),
    strikeValue: undefined as string | undefined,
    unitLabel: '1개당'
  };
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
  variant = 'default'
}: Props) => {
  const { token } = useAuthStore();
  const { kind } = useRequestorBusinessAccess();
  const membership = usePracticeMembershipStatus();
  const showWelcomeCredit = kind === 'lab';
  const showMembershipJoin = kind === 'practice';
  const isPracticeMember = membership.active;
  const cancelScheduled = isPracticeMember && membership.cancelAtPeriodEnd;
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [leadTimes, setLeadTimes] = useState(DEFAULT_LEAD_TIMES);
  const { data: systemSettings, refetch: refetchSystemSettings } =
    useSystemSettings();
  const welcomeRequestCredit = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.defaultRequestFreeCredit ??
        CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit
    ) || CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit
  );
  const membershipMonthlyFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.practiceMembershipMonthlyFee ??
        CREDIT_SETTINGS_DEFAULTS.practiceMembershipMonthlyFee ??
        ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT
    ) || ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT
  );
  const productionRegular = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.regularProductionPrice ??
        ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE
    ) || ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE
  );
  const productionMembership = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.membershipProductionPrice ??
        ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
    ) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
  );
  const designAndProductionRegular = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.regularDesignAndProductionPrice ??
        ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE
    ) || ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE
  );
  const designAndProductionMembership = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.membershipDesignAndProductionPrice ??
        ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE
    ) || ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE
  );
  const roundBarProductionRegular = Math.max(
    0,
    Number(systemSettings?.creditSettings?.regularRoundBarProductionPrice) || 0
  );
  const roundBarProductionMembership = Math.max(
    0,
    Number(systemSettings?.creditSettings?.membershipRoundBarProductionPrice) ||
      0
  );
  const roundBarDesignRegular = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.regularRoundBarDesignAndProductionPrice
    ) || 0
  );
  const roundBarDesignMembership = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.membershipRoundBarDesignAndProductionPrice
    ) || 0
  );

  const roundBarProductionRow = resolveRoundBarPriceRow(
    roundBarProductionRegular,
    roundBarProductionMembership
  );
  const roundBarDesignRow = resolveRoundBarPriceRow(
    roundBarDesignRegular,
    roundBarDesignMembership
  );

  useEffect(() => {
    if (!open) return;
    void refetchSystemSettings();
    if (!token) {
      setLeadTimes(DEFAULT_LEAD_TIMES);
      return;
    }
    const load = async () => {
      try {
        const res = await request<any>({
          path: `/api/businesses/manufacturer-lead-times`,
          method: 'GET',
          token
        });
        if (!res.ok) return;
        const data = res.data?.data || res.data || {};
        const serverLeadTimes = data?.leadTimes;
        const normalized: Record<DiameterKey, LeadTimeRange> = {
          ...DEFAULT_LEAD_TIMES
        };
        (Object.keys(normalized) as DiameterKey[]).forEach((key) => {
          const entry = serverLeadTimes?.[key];
          if (!entry) return;
          const min = Number.isFinite(entry.minBusinessDays)
            ? Math.max(0, Math.floor(entry.minBusinessDays))
            : normalized[key].minBusinessDays;
          const max = Number.isFinite(entry.maxBusinessDays)
            ? Math.max(0, Math.floor(entry.maxBusinessDays))
            : normalized[key].maxBusinessDays;
          normalized[key] = {
            minBusinessDays: Math.min(min, max),
            maxBusinessDays: Math.max(min, max)
          };
        });
        setLeadTimes(normalized);
      } catch (err) {
        console.error('[PricingPolicyDialog] load leadTimes failed', err);
      }
    };
    void load();
  }, [open, token, refetchSystemSettings]);

  const diameterRows: { label: string; key: DiameterKey }[] = [
    { label: '6mm', key: 'd6' },
    { label: '8mm', key: 'd8' },
    { label: '10mm', key: 'd10' },
    { label: '12mm', key: 'd12' }
  ];

  const title =
    variant === 'devops'
      ? '개발운영사 분배 기준'
      : variant === 'salesman'
        ? '영업자 수수료 정책'
        : '커스텀 어벗 생산 가격 · 출고 정책 안내';

  const subtitle =
    variant === 'devops'
      ? '유료의뢰비 정산 비율과 화면 안내를 확인하세요.'
      : variant === 'salesman'
        ? '소개 수수료 지급 기준과 정산 주기를 확인하세요.'
        : '단가 · 출고 기준을 한눈에 확인하세요.';

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl'>
        <DialogHeader className='border-b border-slate-100 px-6 pb-4 pt-6'>
          <DialogTitle className='text-xl font-semibold tracking-tight text-slate-900'>
            {title}
          </DialogTitle>
          <DialogDescription className='text-sm text-slate-500'>
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className='max-h-[calc(85vh-5.5rem)] overflow-y-auto px-6 py-5'>
          {variant === 'salesman' ? (
            <div className='space-y-3'>
              <PolicySection title='소개 수수료 (10%)'>
                <p>
                  소개한 의뢰자의 유료의뢰비에서{' '}
                  <span className='font-semibold text-slate-900'>10%</span>가
                  수수료로 지급됩니다.
                </p>
                <BulletList
                  items={[
                    '소개 관계 기준: 의뢰자 가입 시 입력한 영업자 코드',
                    '집계 범위: 1단계 소개만 포함',
                    '유료 매출 기준: 의뢰 결제 완료 시점'
                  ]}
                />
              </PolicySection>

              <PolicySection title='집계 및 지급'>
                <BulletList
                  items={[
                    '매일 자정(KST 00:00) 사업자 기준으로 업데이트',
                    <>
                      지급 계좌는 <b className='text-slate-800'>설정 &gt; 결제</b>
                      에서 관리
                    </>,
                    '정산 원장은 사이드바 크레딧 페이지에서 확인 가능'
                  ]}
                />
              </PolicySection>
            </div>
          ) : variant === 'devops' ? (
            <div className='space-y-3'>
              <PolicySection title='분배 구조'>
                <p>
                  개발·운영사는 유료의뢰비 기준{' '}
                  <span className='font-semibold text-slate-900'>10%</span>가
                  정산됩니다.
                </p>
                <p>영업자 소개 유무와 무관하게 개발·운영사 비율은 동일합니다.</p>
              </PolicySection>

              <PolicySection title='네트워크 반영'>
                <p>
                  영업자 소개 없이 가입한 의뢰 건은 제조사 65% / 관리자 25% /
                  개발·운영사 10% 규칙이 적용됩니다.
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
                    label='CNC어벗 생산만'
                    strikeValue={formatAbutsManwon(productionRegular)}
                    value={`멤버십 ${formatAbutsManwon(productionMembership)}`}
                    unitLabel='1개당'
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='CNC어벗 디자인+생산 의뢰'
                    strikeValue={formatAbutsManwon(designAndProductionRegular)}
                    value={`멤버십 ${formatAbutsManwon(
                      designAndProductionMembership
                    )}`}
                    unitLabel='1개당'
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='환봉어벗 생산만'
                    strikeValue={roundBarProductionRow.strikeValue}
                    value={roundBarProductionRow.value}
                    unitLabel={roundBarProductionRow.unitLabel}
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='환봉어벗 디자인+생산'
                    strikeValue={roundBarDesignRow.strikeValue}
                    value={roundBarDesignRow.value}
                    unitLabel={roundBarDesignRow.unitLabel}
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='치과 멤버십'
                    value={`월 ${formatAbutsAbutmentServiceWon(
                      membershipMonthlyFee
                    )}`}
                    note={
                      cancelScheduled
                        ? '해지 예약 · 다음 결제일까지 유지'
                        : '매월 구독료 자동 결제'
                    }
                    noteAction={
                      showMembershipJoin ? (
                        isPracticeMember ? (
                          <Button
                            type='button'
                            variant='link'
                            className='h-auto shrink-0 px-0 py-0 text-xs font-semibold'
                            onClick={() => setMembershipOpen(true)}
                          >
                            {cancelScheduled ? '해지 예약' : '이용 중'}
                          </Button>
                        ) : (
                          <Button
                            type='button'
                            variant='link'
                            className='h-auto shrink-0 px-0 py-0 text-xs font-semibold'
                            onClick={() => setMembershipOpen(true)}
                          >
                            멤버십 가입
                          </Button>
                        )
                      ) : null
                    }
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='커스텀 어벗 신속 출고'
                    value='+2,000원'
                    unitLabel='1개당'
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='배송비'
                    value='3,500원'
                    unitLabel='1박스당'
                  />
                </div>
                <div className='mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600'>
                  <span className='font-medium text-slate-800'>
                    리메이크 무료
                  </span>
                  : 사업자(기공소) 기준 월 3건까지 0원.
                  <br />
                  동일 치과·환자·치식, 최근 90일 조건 충족 건에 한함.
                </div>
              </section>

              {showWelcomeCredit ? (
                <div className='grid gap-3 sm:grid-cols-2'>
                  <PolicySection title='가입 환영 무료 크레딧'>
                    <p className='text-2xl font-semibold tracking-tight text-slate-900'>
                      {welcomeRequestCredit.toLocaleString('ko-KR')}원
                    </p>
                    <p className='text-xs text-slate-500'>
                      신규 가입 기공소에 무료크레딧으로 1회 지급
                    </p>
                  </PolicySection>
                  <PolicySection title='의뢰 취소'>
                    <p>
                      <span className='font-semibold text-slate-900'>
                        준비 단계
                      </span>
                      에서만 취소 가능하며, 가공 단계부터는 취소할 수 없습니다.
                    </p>
                  </PolicySection>
                </div>
              ) : (
                <PolicySection title='의뢰 취소'>
                  <p>
                    <span className='font-semibold text-slate-900'>
                      준비 단계
                    </span>
                    에서만 취소 가능하며, 가공 단계부터는 취소할 수 없습니다.
                  </p>
                </PolicySection>
              )}

              <PolicySection title='출고 리드타임 (최대 직경 기준)'>
                <BulletList
                  items={[
                    <>
                      <span className='font-medium text-slate-800'>묶음</span>
                      : 0시까지 접수 → 익영업일부터 리드타임 (
                      <span className='font-medium text-slate-800'>
                        +1영업일 = 다음 영업일 16:00 출고
                      </span>
                      )
                    </>,
                    <>
                      <span className='font-medium text-slate-800'>신속</span>
                      : 낮 12시 컷오프 (당일 / 익영업일)
                    </>,
                    <>
                      <span className='font-medium text-slate-800'>
                        디자인+생산
                      </span>
                      : 아래 리드타임에 +1영업일
                    </>
                  ]}
                />
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  {diameterRows.map(({ label, key }) => {
                    const min = leadTimes[key]?.minBusinessDays;
                    const max = leadTimes[key]?.maxBusinessDays;
                    const minText = Number.isFinite(min) ? min : '-';
                    const maxText = Number.isFinite(max) ? max : '-';
                    return (
                      <div
                        key={key}
                        className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'
                      >
                        <div className='text-xs font-medium text-slate-500'>
                          {label}
                        </div>
                        <div className='mt-1 text-sm font-semibold tabular-nums text-slate-900'>
                          +{minText}~{maxText}영업일
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PolicySection>

              <PolicySection title='출고 방식'>
                <div className='space-y-2.5'>
                  <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'>
                    <div className='text-sm font-semibold text-slate-900'>
                      묶음 출고
                    </div>
                    <p className='mt-1 text-xs leading-relaxed text-slate-600'>
                      설정한 출고 요일 중 가장 빠른 날에 함께 출고합니다.
                      디자인+생산은 +1영업일 후 요일에 맞춥니다.
                    </p>
                  </div>
                  <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'>
                    <div className='text-sm font-semibold text-slate-900'>
                      신속 출고
                    </div>
                    <p className='mt-1 text-xs leading-relaxed text-slate-600'>
                      영업일 12시 이전은 당일 16:00, 이후·휴일은 익영업일
                      16:00 목표. 디자인+생산은 +1영업일. 묶음보다 빠를 때만
                      선택 가능하며, 1개당 +2,000원이 추가됩니다.
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
      <PracticeMembershipJoinDialog
        open={membershipOpen}
        onOpenChange={setMembershipOpen}
      />
    </>
  );
};
