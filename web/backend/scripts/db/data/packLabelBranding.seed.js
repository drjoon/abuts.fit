// SSOT: DB SystemSettings.packLabelBranding
// EBS 환경변수 한글 인코딩 버그로 인해 환경변수 대신 DB에서 관리합니다.
// 이 파일의 값을 수정한 뒤 `npm run db:seed-branding`을 실행하면 DB에 반영됩니다.
// rules.md 섹션 16 참고.
export const PACK_LABEL_BRANDING_SEED = {
  productName: "치과용임플란트 상부구조물",
  modelName: "CA6512",
  licenseNo: "제3583호",
  manufacturerName: "(주)애크로덴트",
  manufacturerAddr: "경남 김해시 전하로85번길 5, 나동(흥동)",
  manufacturerTelFax: "T 055-314-4607  F 055-901-0241",
  manufacturerPermitNo: "제3583호",
  sellerName: "어벗츠 주식회사",
  sellerPermit: "제00001호",
  sellerAddr: "경남 거제시 거제중앙로29길 6, 3층",
  sellerTel: "1588-3948",
  udiGtin: "08800123600154",
  certInfo: "품목인증번호: 제인 26-0000호, 포장단위:1set, 보관방법: 실온보관",
  homepageUrl: "www.acrodent.com",
  manualQrLabel: "사용자매뉴얼",
};
