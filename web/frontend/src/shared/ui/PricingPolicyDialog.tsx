// change-log:
// - 2026-08-09: 디자인+생산 신속비=어벗 수 배수 안내.
// - 2026-08-09: 디자인+생산 출고 +1영업일 안내(가격·리드타임·출고 방식).
// - 2026-08-06: 배송/발송 표기를 출고로 통일 (제조사 출발일). 배송비(수수료) 표기는 유지.
// - 2026-08-08: 정책 안내 모달 섹션 카드·가격 하이라이트·리드타임 그리드로 스타일 개선.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPricingReferralPolicyCard.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/utils/creditSettingsDefaults.js
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { request } from '@/shared/api/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings
} from '@/hooks/useSystemSettings';

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
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <div className='text-sm text-slate-600'>{label}</div>
        {hint ? (
          <div className='mt-0.5 text-xs leading-relaxed text-slate-500'>
            {hint}
          </div>
        ) : null}
      </div>
      <div className='shrink-0 text-base font-semibold tabular-nums text-slate-900'>
        {value}
      </div>
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
  variant = 'default'
}: Props) => {
  const { token } = useAuthStore();
  const [leadTimes, setLeadTimes] = useState(DEFAULT_LEAD_TIMES);
  const { data: systemSettings } = useSystemSettings();
  const shippingFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.shippingFee ??
        CREDIT_SETTINGS_DEFAULTS.shippingFee
    ) || CREDIT_SETTINGS_DEFAULTS.shippingFee
  );
  const expressFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.expressFee ??
        CREDIT_SETTINGS_DEFAULTS.expressFee
    ) || CREDIT_SETTINGS_DEFAULTS.expressFee
  );
  const designFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.designFee ??
        CREDIT_SETTINGS_DEFAULTS.designFee
    ) || CREDIT_SETTINGS_DEFAULTS.designFee
  );
  const welcomeRequestCredit = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.defaultRequestFreeCredit ??
        CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit
    ) || CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit
  );

  useEffect(() => {
    if (!open) return;
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
  }, [open, token]);

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
        : '가격 · 소개 정책 안내';

  const subtitle =
    variant === 'devops'
      ? '유료의뢰비 정산 비율과 화면 안내를 확인하세요.'
      : variant === 'salesman'
        ? '소개 수수료 지급 기준과 정산 주기를 확인하세요.'
        : '단가 · 할인 · 출고 기준을 한눈에 확인하세요.';

  return (
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
                    '정산 원장은 보유 크레딧 모달에서 확인 가능'
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
                <h3 className='text-sm font-semibold tracking-tight text-slate-900'>
                  기본 가격
                </h3>
                <div className='mt-3 space-y-3'>
                  <PriceRow label='커스텀 어벗' value='15,000원' hint='1개당 · 생산' />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='디자인비'
                    value={`${designFee.toLocaleString('ko-KR')}원`}
                    hint='1어벗당 · 디자인+생산 시 생산비에 별도 추가'
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='배송비'
                    value={`${shippingFee.toLocaleString('ko-KR')}원`}
                    hint='출고 1회당 · 한 번에 여러 제품이어도 1회'
                  />
                  <div className='h-px bg-slate-100' />
                  <PriceRow
                    label='신속 출고'
                    value={`+${expressFee.toLocaleString('ko-KR')}원`}
                    hint='1어벗당(디자인+생산) · 생산 의뢰는 건당 · 묶음보다 빠른 출고일이 있을 때만 선택 가능(생산 당일 16:00 목표)'
                  />
                </div>
                <p className='mt-3 text-xs text-slate-500'>배송비 별도 · 부가세 없음</p>
                <div className='mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600'>
                  <span className='font-medium text-slate-800'>
                    디자인+생산
                  </span>
                  : 디자인비는 생산비와 별도이며, 한 STL에 여러 어벗이 있으면{" "}
                  <span className='font-medium text-slate-800'>
                    (생산단가 + 디자인비) × 어벗 수
                  </span>
                  로 의뢰크레딧에서 차감합니다. 신속 출고 추가비도 어벗 수만큼
                  곱합니다. Pontic 등 커스텀어벗이 아닌 치아는 과금하지 않습니다.
                  출고 일정에는 디자인 작업으로{" "}
                  <span className='font-medium text-slate-800'>
                    묶음·신속 모두 +1영업일
                  </span>
                  이 더해집니다.
                </div>
                <div className='mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600'>
                  <span className='font-medium text-slate-800'>
                    리메이크 무료
                  </span>
                  : 사업자(기공소) 기준 월 3건까지 0원
                  <br />
                  동일 치과·환자·치식, 최근 90일 조건 충족 건에 한함 / 3건 초과 시
                  건당 10,000원
                </div>
                <p className='mt-2 text-xs leading-relaxed text-slate-500'>
                  신속 출고는 생산이 지연되면 다음날 출고하며, 추가 의뢰크레딧은
                  취소됩니다.
                </p>
              </section>

              <div className='grid gap-3 sm:grid-cols-2'>
                <PolicySection title='가입 축하 무료 크레딧'>
                  <p className='text-2xl font-semibold tracking-tight text-slate-900'>
                    {welcomeRequestCredit.toLocaleString('ko-KR')}원
                  </p>
                  <p className='text-xs text-slate-500'>신규 가입 기공소 1회 지급</p>
                  <BulletList
                    items={[
                      '커스텀 어벗 의뢰 결제에만 사용 가능',
                      '배송비에는 사용할 수 없습니다.'
                    ]}
                  />
                </PolicySection>

                <PolicySection title='주문량 할인'>
                  <p>
                    <span className='font-semibold text-slate-900'>
                      최근 30일 완료 주문 수
                    </span>
                    에 따라 자동 할인 (매일 자정 KST 갱신)
                  </p>
                  <BulletList
                    items={[
                      '주문 1건당 100원 할인',
                      '최대 5,000원 할인 (50건 이상 시 개당 10,000원 고정)'
                    ]}
                  />
                </PolicySection>
              </div>

              <PolicySection title='소개 그룹 합산'>
                <p>
                  할인 단가는{' '}
                  <span className='font-semibold text-slate-900'>
                    나를 소개한 기공소 + 나 + 내가 소개한 기공소
                  </span>
                  의 최근 30일 주문량을 합산해 계산합니다.
                </p>
                <p className='text-xs text-slate-500'>
                  각 사업자의 할인 단가는 자신이 속한 모든 그룹 구성원의 주문량을
                  합산해 개별 계산합니다.
                </p>
                <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600'>
                  <p className='font-medium text-slate-800'>
                    예: A가 B·C를 소개하고, B가 D를 소개한 경우
                  </p>
                  <ul className='mt-1.5 grid gap-1 sm:grid-cols-2'>
                    <li>A: A+B+C 합산 (자녀: B·C)</li>
                    <li>B: A+B+D 합산 (부모: A, 자녀: D)</li>
                    <li>C: A+C 합산 (부모: A)</li>
                    <li>D: B+D 합산 (부모: B)</li>
                  </ul>
                </div>
              </PolicySection>

              <div className='grid gap-3 sm:grid-cols-2'>
                <PolicySection title='런칭 이벤트 (신규 기공소)'>
                  <BulletList
                    items={[
                      <>
                        가입 승인일로부터{' '}
                        <span className='font-semibold text-slate-900'>
                          90일간 개당 10,000원
                        </span>{' '}
                        고정
                      </>,
                      '이 기간에는 주문량 할인과 무관하게 우선 적용',
                      '종료 시점은 별도 공지로 안내'
                    ]}
                  />
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

              <PolicySection title='출고 리드타임 (최대 직경 기준)'>
                <p className='text-xs text-slate-500'>
                  KST 기준{' '}
                  <span className='font-medium text-slate-700'>
                    묶음 출고
                  </span>
                  는 자정(0시)까지 접수 건을 익영업일부터 리드타임을 계산하며,{' '}
                  <span className='font-medium text-slate-700'>
                    +1영업일
                  </span>
                  리드타임이면 다음 영업일 16:00 출고입니다.{' '}
                  <span className='font-medium text-slate-700'>
                    신속 출고
                  </span>
                  는 낮 12시 컷오프로 당일/익영업일을 구분합니다.{' '}
                  <span className='font-medium text-slate-700'>
                    디자인+생산
                  </span>
                  은 아래 직경 리드타임에{' '}
                  <span className='font-medium text-slate-700'>
                    +1영업일
                  </span>
                  (디자인)이 추가로 더해집니다.
                </p>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  {diameterRows.map(({ label, key }) => {
                    const min = leadTimes[key]?.minBusinessDays;
                    const max = leadTimes[key]?.maxBusinessDays;
                    const minText = Number.isFinite(min) ? min : '-';
                    const maxText = Number.isFinite(max) ? max : '-';
                    const hasSameDayNote = Number(minText) === 1;
                    return (
                      <div
                        key={key}
                        className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'
                      >
                        <div className='text-xs font-medium text-slate-500'>
                          {label}
                        </div>
                        <div className='mt-1 text-sm font-semibold tabular-nums text-slate-900'>
                          +{minText}영업일
                        </div>
                        <div className='mt-0.5 text-[11px] text-slate-500'>
                          최대 +{maxText}영업일
                        </div>
                        {hasSameDayNote ? (
                          <div className='mt-1.5 text-[11px] leading-snug text-blue-700'>
                            묶음 · 자정까지 접수 시 익영업일 16:00 출고
                          </div>
                        ) : null}
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
                      설정한 출고 요일 중 가장 먼저 도래하는 날에 제조사에서 함께
                      출고합니다. 디자인+생산은 직경 리드타임에 +1영업일(디자인)을
                      더한 뒤 출고 요일에 맞춥니다.
                    </p>
                  </div>
                  <div className='rounded-lg border border-slate-200/80 bg-white px-3 py-2.5'>
                    <div className='text-sm font-semibold text-slate-900'>
                      신속 출고
                    </div>
                    <p className='mt-1 text-xs leading-relaxed text-slate-600'>
                      생산: KST 낮 12시 이전·영업일 의뢰는{' '}
                      <span className='font-medium text-slate-800'>
                        당일 16:00
                      </span>{' '}
                      출고를 목표하고, 12시 이후(또는 휴일)에는 다음 영업일
                      16:00으로 잡습니다.{' '}
                      <span className='font-medium text-slate-800'>
                        디자인+생산은 그 기준에 +1영업일
                      </span>
                      입니다. 예상 출고일이 묶음 출고보다 빠를 때만 선택할 수
                      이며, 같거나 늦으면 선택 불가합니다. 의뢰크레딧 1,000원이
                      추가되며 디자인+생산은 커스텀어벗 수만큼 곱합니다. 약속
                      출고일에 집하되지 않으면(16시 이후 당일 수동 집하는 정시)
                      자정 이후 신속 출고 실패로 처리하고 추가 크레딧은
                      취소됩니다.
                    </p>
                  </div>
                </div>
              </PolicySection>

              <PolicySection title='출고 일정 (KST)'>
                <div className='grid gap-2 sm:grid-cols-3'>
                  {[
                    { time: '0시', desc: '당일 의뢰 접수 마감' },
                    { time: '15:00', desc: '포장 마감 후 택배 수거 신청' },
                    { time: '16:00', desc: '택배 집하 (제조사 출발)' }
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
