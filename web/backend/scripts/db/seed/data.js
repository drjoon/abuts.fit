// NOTE:
// request/ledger/shipping 샘플 데이터 시딩은 운영/테스트 DB 오염 이슈로 비활성화되었습니다.
// `db:seed-data`는 core shared 데이터(connections, filenameRules, branding)만 시딩합니다.

export async function seedRequestData() {
  return {
    requestCount: 0,
    shippingPackageCount: 0,
    creditLedgerCount: 0,
    salesmanLedgerCount: 0,
    requestorCount: 0,
    disabled: true,
  };
}
