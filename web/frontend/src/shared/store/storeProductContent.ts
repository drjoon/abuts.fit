// change-log:
// - 2026-09-14: 제조단가표 동기 — Hex/NonHex 명칭·Surgical pkg 88·Prosthetic GS×3/Driver S/M/L·단품 제조가.
// - 2026-09-13: Surgical Kit·SA2 Hex/D-cut·SH2 12종·풀패키지 ×150·Kit Case 2종 동기.
// - 2026-09-13: 상단 hero와 동일 gallery-1만 제외, 나머지 상세 이미지 복구.
// - 2026-09-13: acrodent.com 상세 이미지 OCR → 텍스트 블록 + 순수 제품 이미지.
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/pages/requestor/store/RequestorStoreProductPage.tsx

export type StoreContentBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; src: string; alt?: string };

export type StoreProductContent = {
  blurb?: string;
  description?: string;
  specs?: { label: string; value: string }[];
  blocks: StoreContentBlock[];
};

/** acrodent 상세(이미지)에서 OCR·분리한 스토어 상세 콘텐츠. */
export const STORE_PRODUCT_CONTENT: Record<string, StoreProductContent> = {
  "simple-abutment-2": {
    blurb: "Hex · 2-piece · D-cut(B,L) with fillet",
    description:
      "Hex, 2-piece Simple Abutment. 직경·커프 사이즈를 인식할 수 있는 D-cut(B,L) with fillet. 높이 S·M·L·XL × 직경 6·7·9 — 12종. GingivalCap은 특수코팅으로 스프레이 없이 스캔 가능(Concave profile).",
    specs: [
      { label: "품명", value: "치과용임플란트상부구조물" },
      { label: "형태", value: "Hex, 2-piece, D-cut(B,L) with fillet" },
      { label: "높이", value: "S / M / L / XL" },
      { label: "직경", value: "6 · 7 · 9 (12종)" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "나사", value: "M2.0×0.4P" },
      { label: "HEX", value: "1.20 (Acodent/Osstem/Neo/Megagen/Dio) · 1.28 (Dentium/Dentis)" },
    ],
    blocks: [
      { type: "heading", text: "SimpleAbutment-Hex (Hex · 2-piece)" },
      {
        type: "text",
        text: "직경·커프 사이즈 인식용 D-cut(B,L) with fillet. 높이 4종 × 직경 3종 = 12종.",
      },
      { type: "heading", text: "제품의 규격" },
      {
        type: "list",
        items: [
          "높이: S / M / L / XL",
          "직경: 6 · 7 · 9",
          "Hex, 2-piece",
          "D-cut(B,L) with fillet",
        ],
      },
      {
        type: "image",
        src: "/store/content/simple-abutment-2/size-grid.jpg",
        alt: "치수 다이어그램: C/D/H/HD + 나사 M2.0×0.4P 도면",
      },
      {
        type: "image",
        src: "/store/content/simple-abutment-2/color-band.jpg",
        alt: "Simple Abutment 사이즈 그리드",
      },
      { type: "heading", text: "GingivalCap" },
      {
        type: "text",
        text: "특수코팅으로 스프레이 없이 스캔 가능. Concave profile.",
      },
      { type: "heading", text: "Follow color-band" },
      {
        type: "text",
        text: "SurgicalPen·SurgicalPin·BoneShaper·Healing·GingivalShaper와 동일 색상 밴드로 규격을 맞춰 Final까지 연결합니다.",
      },
    ],
  },
  "simple-abutment": {
    blurb: "For Submerged type",
    description: "서브머지드 타입용 Simple Abutment [Non-Hex]입니다. 커프 높이(S/M/L)와 직경 라인(6–10)으로 규격을 선택하며, Follow color-band로 시술·보철 기구와 색상을 맞춰 사용합니다.",
    specs: [
      { label: "품명", value: "치과용임플란트상부구조물" },
      { label: "모델명", value: "SS06-NC20 외 265건" },
      { label: "의료기기 허가, 신고 번호", value: "제인13-1673호" },
      { label: "사용목적", value: "환자의 저작 기능 회복을 위해 사용하는 인공 치아와 같은 보철물을 지지하기 위하여 삽입" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "1set" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "보험청구코드", value: "L7552057" },
      { label: "나사", value: "M2.0×P0.4" },
      { label: "HEX", value: "1.20 / 1.28 (임플란트 시스템별)" },
      { label: "커프(C)", value: "S 2.0 / M 3.5 / L 5.0 mm" },
    ],
    blocks: [
      { type: "heading", text: "Simple Abutment [Non-Hex]" },
      { type: "text", text: "보험청구코드 L7552057. 치수 C(커프)·D(직경)·H(포스트)·HD(HEX), 나사 M2.0×P0.4. 높이 S(2.0)·M(3.5)·L(5.0)·XL(6.5)." },
      { type: "heading", text: "제품의 규격" },
      { type: "list", items: ["적용: Acodent / Osstem / Neo-implant / Megagen / Dio — HEX 1.20 (S2061~ 계열)", "적용: Dentium / Dentis — HEX 1.28 (S2071~ 계열)", "Cuff Short 2.0 / Middle 3.5 / Long 5.0 mm", "직경 라인 6·7·8·9·10"] },
      { type: "image", src: "/store/content/simple-abutment/size-grid.jpg", alt: "치수 다이어그램 C/D/H/HD + 나사" },
      { type: "image", src: "/store/content/simple-abutment/color-band.jpg", alt: "Simple Abutment 사이즈 그리드 S/M/L × 6–10" },
      { type: "heading", text: "Follow color-band" },
      { type: "text", text: "Pen·Pin·BoneShaper·Healing·GingivalShaper와 동일 색상으로 규격을 맞춰 Final 보철까지 연결합니다." },
    ],
  },
  "simple-healing-2": {
    blurb: "높이 4종 × 직경 3종 · 12종",
    description:
      "높이 S(2.0)·M(3.5)·L(5.0)·XL(6.5), 직경 6·7·9 — 12종. Fixture 식립 후 치은 치유·형성. SimpleAbutment-Hex와 동일 규격 체계.",
    specs: [
      { label: "품명", value: "치과용임플란트상부구조물" },
      { label: "높이", value: "S 2.0 / M 3.5 / L 5.0 / XL 6.5 mm" },
      { label: "직경", value: "6 · 7 · 9 (12종)" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "HEX", value: "1.20 / 1.28 (임플란트 시스템별)" },
    ],
    blocks: [
      { type: "heading", text: "SimpleHealing-Hex" },
      {
        type: "text",
        text: "픽스처 식립 후 연조직 힐링용. SimpleAbutment-Hex와 높이·직경 조합이 같습니다(각 12종).",
      },
      { type: "heading", text: "제품의 규격" },
      {
        type: "list",
        items: [
          "높이: S(2.0) · M(3.5) · L(5.0) · XL(6.5)",
          "직경: 6 · 7 · 9",
          "심플힐링2 · 심플어벗2 각각 12종",
        ],
      },
      {
        type: "image",
        src: "/store/content/simple-healing-2/size-grid.jpg",
        alt: "치수 다이어그램 D/H/C/HD",
      },
      {
        type: "image",
        src: "/store/content/simple-healing-2/color-band.jpg",
        alt: "Healing Abutment 사이즈 그리드",
      },
      { type: "heading", text: "Follow color-band" },
      {
        type: "text",
        text: "SurgicalPen·SurgicalPin·BoneShaper와 동일 색상 밴드로 Healing → Simple Abut. → Final까지 규격을 유지합니다.",
      },
    ],
  },
  "surgical-kit": {
    blurb: "SurgicalPen · SurgicalPin · BoneShaper 통합 키트",
    description:
      "린데만 타입 SurgicalPen(Cup 포함), SurgicalPin(기존 CheckPin·InitialPin 겸용), BoneShaper S6·7·9 & M6·7·9(팁 조금 길게, 연마 없음)를 한 트레이에 구성한 시술 키트입니다.",
    specs: [
      { label: "포장단위", value: "1키트" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      {
        label: "구성",
        value: "SurgicalPen×2, Cup×5, SurgicalPin×5, BoneShaper×6, Kit Case×1",
      },
    ],
    blocks: [
      { type: "heading", text: "Surgical Kit" },
      {
        type: "text",
        text: "Initial·Check 단계를 하나의 Surgical Kit로 통합했습니다. 판매가 132만 · 패키지 구매자 pkg 88만.",
      },
      { type: "heading", text: "구성품" },
      {
        type: "list",
        items: [
          "SurgicalPen — 린데만 타입, 직경 2.3 (Pen ×2)",
          "Cup ×5",
          "SurgicalPin ×5 — 기존 CheckPin이며 InitialPin 역할도 겸함",
          "BoneShaper ×6 — S6·7·9 및 M6·7·9. 팁 조금 길게. 연마 없음",
          "Kit Case ×1",
        ],
      },
      {
        type: "image",
        src: "/store/content/initial-kit/tray.jpg",
        alt: "Surgical Kit 트레이·구성품",
      },
      {
        type: "image",
        src: "/store/content/check-kit/tray.jpg",
        alt: "BoneShaper·SurgicalPin 구성",
      },
      { type: "heading", text: "시술 흐름 요약" },
      {
        type: "list",
        items: [
          "1. SurgicalPen 드릴링 → SurgicalPin으로 수직·수평 확인",
          "2. Fixture 식립 후 BoneShaper로 cortical bone 성형",
          "3. SurgicalPin으로 패스·교합 높이 재확인",
          "4. Prosthetics — Healing → Simple Abutment",
        ],
      },
    ],
  },
  "initial-kit": {
    blurb: "매일 똑같이 잘 심기 위한 키트 · 수평·수직 위치 확인 · BonePen Kit 업그레이드",
    description: "TheSimple Kit Initial(TSKLv2, Pd.No T7188)은 InitialPen·Cup·InitialPin·Trimmer·GBR Pen을 한 트레이에 구성한 이니셜 드릴링 키트입니다. 2-Step 드릴(Ø2.2×Ø2.8)로 위치를 잡고, Pin으로 상하악 수직·수평을 육안 확인합니다.",
    specs: [
      { label: "품목명", value: "치과임플란트시술용드릴" },
      { label: "모델명", value: "TSKL 외 / TSKLv2" },
      { label: "의료기기 허가, 신고 번호", value: "부산제신19-1062호 외" },
      { label: "사용목적", value: "사용자 매뉴얼 참조" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
      { label: "포장단위", value: "Kit or EA" },
      { label: "제조자", value: "(주)애크로덴트" },
      { label: "제조국", value: "대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "Pd.No", value: "T7188" },
      { label: "키트 모델", value: "TSKLv2" },
    ],
    blocks: [
      { type: "heading", text: "매일 똑같이 잘 심기 위한 키트 \"Initial Kit\"" },
      { type: "text", text: "TheSimple Kit Initial — Pd.No T7188 · 모델 TSKLv2 · 의료기기 신고번호 부산제신19-1062호. ※ 현재 스토어는 Surgical Kit로 통합 판매합니다." },
      { type: "heading", text: "구성품" },
      { type: "list", items: ["InitialPen 2종 (Short / Middle) — 모델 4F2228S·4F2228M, Pd.No T7094·T7095", "Cup 5종 (Ø6·7·8·9·10, 색상 구분) — BPC06028~BPC10028", "InitialPin 5종 (IP06~IP10, Cup과 동일 직경·색상) — Pd.No T7101~T7105", "Bone Trimmer Ø4.0 (B140, Pd.No T7093)", "GBR Pen (BPGBR, Pd.No T7013)"] },
      { type: "image", src: "/store/content/initial-kit/tray.jpg", alt: "Initial Kit 트레이·구성품 다이어그램" },
      { type: "heading", text: "BonePen과의 차이" },
      { type: "list", items: ["2-Step 드릴(Ø2.2×Ø2.8)로 BonePen보다 위치 잡기가 용이", "다수치 식립 시 Pen은 핸드피스에 체결한 채 Cup만 다른 사이즈로 교체", "골 평탄화용 Ø4.0 Trimmer 포함"] },
      { type: "heading", text: "시술 흐름" },
      { type: "list", items: ["1. Initial — STEP1 InitialPen 드릴링 → STEP2 InitialPin 수직 확인", "2. Install — STEP3 Final drilling (필요 시 countersink)", "3. Check — STEP4 Fixture 식립 → STEP5 BoneShaping(순차) → STEP6 CheckPin으로 최종 위치·인접 임플란트 평행 확인", "4. Prosthetics — Healing Abutment → Simple Abutment", "인접치(#46·#47)에 STEP1~6 반복"] },
      { type: "heading", text: "직경 선택" },
      { type: "list", items: ["부적합(예: 8mm) — 인접치에 걸려 들어가지 않음", "적합(예: 7mm) — 드릴팁이 치조골에 접촉"] },
      { type: "heading", text: "InitialPen 사용 · 속도와 주수" },
      { type: "list", items: ["핸드피스 20:1 기어비, 300~1,500 RPM, 45~55 Torque, 주수하 사용", "Cup 측면을 인접치 측면에 살짝 밀착", "양손 파지 — 삭제 지점 이탈·Cup/드릴 분리 방지", "구강 내 이동 시 드릴 회전이 완전히 멈춘 뒤 이동"] },
      { type: "heading", text: "Pen 조립 · 분리" },
      { type: "list", items: ["조립: Pen 선택 → Cup 선택 → 딸깍 소리가 날 때까지 끼움 → 사용", "분리: 세 손가락으로 Cup을 잡고, 핸드피스(제품이 꽂힌 상태)를 다른 손으로 잡아 Cup을 당김"] },
      { type: "heading", text: "세척 · 멸균" },
      { type: "list", items: ["Cup과 드릴은 분리 세척 (멸균 시에는 조립)", "사용 후 내부 치조골을 제거하고 세척·멸균 후 보관", "Autoclave는 Cup·드릴을 조립한 상태로 실시"] },
      { type: "heading", text: "Trimmer · GBR Pen" },
      { type: "list", items: ["Trimmer Ø4.0 — 20:1 / 1,000 RPM / 45~55 Torque / 주수하 (골 평탄화)", "GBR Pen — 피질골 천공·자가골 채취. 20:1 / 300 RPM / 45~55 Torque / 주수하, 최대 약 0.4cc(8~10회 드릴링)"] },
      { type: "heading", text: "InitialPin" },
      { type: "text", text: "상하악 수직 높이 확인·가상 치아 역할로 수평 위치를 잡습니다. 티타늄 재사용. 3칸 눈금(각 1.5mm)으로 수직 공간을 육안 확인하며, 길이 측정 기능은 없고 분리 사용하지 않습니다. Long / Middle / Short." },
      { type: "heading", text: "Follow color-band · 15가지 규격" },
      { type: "text", text: "Pen·Pin 직경 5종 × 눈금 높이 3칸 = 15가지. 예: #7을 10Pen으로 이니셜 드릴링 후 Initial 10Pin(S) 확인 → Healing 10S · Simple Abut.(Final) 10S 적용으로 교합 조정을 줄입니다." },
    ],
  },
  "check-kit": {
    blurb: "임플란트 식립 후 눈에 보이지 않는 Connection 문제 해결 · 타사 호환",
    description: "TheSimple Kit Check(TSKC, Pd.No T7150)는 Fixture 식립 후 CheckPin으로 패스·교합 높이를 확인하고, BoneShaper S·M/L로 cortical bone를 성형해 연결부 간섭을 줄이는 키트입니다. Submerged Type Fixture(양측 22° 테이퍼)에 사용합니다.",
    specs: [
      { label: "품목명", value: "치과임플란트시술용드릴 외" },
      { label: "모델명", value: "TSKC 외" },
      { label: "의료기기 허가, 신고 번호", value: "제신19-1062호 외" },
      { label: "사용목적", value: "사용자 매뉴얼 참조" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
      { label: "포장단위", value: "KIT or EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질관리자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "Pd.No", value: "T7150" },
      { label: "키트 모델", value: "TSKC" },
    ],
    blocks: [
      { type: "heading", text: "잘 심은 임플란트에 깔끔한 보철을" },
      { type: "text", text: "식립 후 보이지 않는 Connection 문제를 해결합니다. ※ Submerged Type Fixture(양측 22° 테이퍼)에 사용 가능." },
      { type: "heading", text: "구성품" },
      { type: "list", items: ["CheckPin 5종 (CP06–CP10, Ø6.0–Ø10.0)", "BoneShaper S 5종 (BS06V3–BS10V3)", "BoneShaper M/L 5종 (BS06ML–BS10ML)"] },
      { type: "image", src: "/store/content/check-kit/tray.jpg", alt: "Check Kit 스펙·구성품 다이어그램" },
      { type: "heading", text: "CheckPin" },
      { type: "text", text: "픽스처 식립 후 내부에 삽입해 (1) 식립 패스 확인 (2) 픽스처–교합면 높이 재확인. 3칸 눈금(각 1.5mm)으로 상하악 수직 공간을 육안 확인합니다." },
      { type: "heading", text: "BoneShaper" },
      { type: "list", items: ["Cortical bone와 어버트먼트 간섭 제거를 위해 픽스처에 수직으로 세워 삭제", "안전한 보철을 위해 식립 후 항상 사용 권장", "작은 사이즈부터 순차 사용 (예: 9번 사용 시 6→7→8→9)", "20:1 / 1,000~1,500 rpm / 45~55 Torque / 주수하 / 3~5초, 부족 시 2~3회 반복"] },
      { type: "image", src: "/store/content/check-kit/boneshaper.jpg", alt: "BoneShaper Before/After 골성형 비교 다이어그램 (임상 갤러리 제외)" },
      { type: "heading", text: "주의사항" },
      { type: "list", items: ["인접치에 주의하여 수직으로 사용", "비멸균 의료기기 — 시술 전 Autoclave 습열멸균(132°C, 15분)"] },
    ],
  },
  "prosthetic-kit": {
    blurb: "GingivalShaper · Hex Driver · Torque — 스트레스 없는 보철",
    description:
      "GingivalShaper 6·7·9(3종), Hex Driver S/M/L(헥스 어벗 체결 가이드), Torque wrench를 구성한 보철 마무리 키트. 판매가 88만 · pkg 66만.",
    specs: [
      { label: "품명", value: "치과용임플란트시술기구 외" },
      { label: "모델명", value: "TSKP 외" },
      { label: "의료기기 허가, 신고 번호", value: "제신19-1054호 외" },
      { label: "사용목적", value: "상품상세설명 참조" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "Kit 또는 1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "Pd.No", value: "T7151" },
      { label: "키트 모델", value: "TSKP" },
    ],
    blocks: [
      { type: "heading", text: "Prosthetic Kit" },
      {
        type: "text",
        text: "의료기기 신고번호 제신19-1054호. Surgical Kit와 Follow color-band로 규격을 이어 보철을 마무리합니다.",
      },
      { type: "heading", text: "구성품" },
      {
        type: "list",
        items: [
          "GingivalShaper ×3 — 6 · 7 · 9",
          "Hex Driver S, M, L ×3 — 헥스 어벗 체결 가이드",
          "Torque wrench ×1",
          "Kit Case ×1",
        ],
      },
      {
        type: "image",
        src: "/store/content/prosthetic-kit/tray.jpg",
        alt: "Prosthetic Kit 트레이·구성품 다이어그램",
      },
      { type: "heading", text: "GingivalShaper" },
      {
        type: "text",
        text: "Simple Abutment 숄더를 덮는 치은을 삭제해 깔끔한 마진을 확보합니다. 타사 어버트먼트에는 호환되지 않으며, 동일 규격끼리 사용합니다.",
      },
      {
        type: "list",
        items: [
          "엔도용(추천) 또는 임플란트용 핸드피스에 체결",
          "주수하, 최대회전수 내에서 3~5초 (1:1 기준), 부족 시 1~2회 반복",
          "인접치 주의, 수직 사용",
        ],
      },
      { type: "heading", text: "HEX-driver · Torque wrench" },
      {
        type: "list",
        items: [
          "Hex Driver S/M/L: 헥스 어벗 체결 가이드",
          "Torque wrench: W-Adaptor 체결(A) → 방향 설정(B) → 눈금에 맞게 당김(C)",
        ],
      },
    ],
  },
  "initial-pen": {
    blurb: "린데만 타입 · 직경 2.3 (SurgicalPen)",
    description:
      "SurgicalPen은 린데만 타입, 직경 2.3 드릴입니다. Surgical Kit 구성품이며 Cup과 체결해 사용합니다.",
    specs: [
      { label: "타입", value: "린데만 타입, 직경 2.3" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "권장 RPM", value: "300~1,500 (20:1), Torque 45~55" },
    ],
    blocks: [
      { type: "heading", text: "SurgicalPen" },
      {
        type: "text",
        text: "린데만 타입 · 직경 2.3. Surgical Kit 구성품. 제조 6.6만 ×2 = 판매 13.2만.",
      },
      {
        type: "image",
        src: "/store/content/initial-pen/pens.jpg",
        alt: "SurgicalPen",
      },
      { type: "heading", text: "사용방법" },
      {
        type: "list",
        items: [
          "핸드피스 20:1, 300~1,500 RPM, 45~55 Torque, 주수하",
          "Cup 측면을 인접치에 살짝 밀착, 양손 파지",
          "이동 시 회전이 완전히 멈춘 후 이동",
        ],
      },
      { type: "heading", text: "펜 조립 · 분리" },
      {
        type: "list",
        items: [
          "조립: Pen 선택 → Cup 선택 → 딸깍까지 끼움 → 사용",
          "분리: 세 손가락으로 Cup을 잡고 핸드피스를 고정한 채 당김",
          "세척은 분리, Autoclave 멸균은 조립 상태",
        ],
      },
    ],
  },
  "pen": {
    blurb: "발치 즉시 식립 · 드릴링 패스 수정 · 플랩리스 이니셜 드릴링",
    description:
      "Lindemann Pen. 제조 6.6만 ×2 = 13.2만. Cup과 결합 가능(Cup 별매).",
    specs: [
      { label: "품목명", value: "치과임플란트시술용드릴" },
      { label: "모델명", value: "LD28L" },
      { label: "의료기기 허가, 신고 번호", value: "제신19-1047호" },
      { label: "사용목적", value: "사용자 매뉴얼 참조" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트 / 대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "길이", value: "Long 약 37.0mm" },
      { label: "직경", value: "Ø2.8" },
      { label: "권장 RPM", value: "300~1,500, Torque 45~55 N·cm" },
    ],
    blocks: [
      { type: "heading", text: "Lindemann Pen" },
      { type: "heading", text: "제품 특징" },
      {
        type: "list",
        items: [
          "끝이 뾰족해 초기 위치 결정이 쉽고, 날카로운 측방향 삭제 가능",
          "경사진 골에서도 미끄러짐 없이 삭제, 발치즉시 식립 시 측방 패스 수정에 활용",
          "Cup과 결합 가능 — 인접치 간격·교합 높이 가늠에 편리 (Cup 별매)",
          "스프링 구조로 Cup을 인접치와 비슷한 높이에 유지해 간격 잡기가 용이",
        ],
      },
      {
        type: "image",
        src: "/store/content/pen/full.jpg",
        alt: "Lindemann Pen 전체 + Cup 체결",
      },
      {
        type: "image",
        src: "/store/content/pen/tip.jpg",
        alt: "팁 클로즈업(나선·블레이드)",
      },
      { type: "heading", text: "사용방법 요지" },
      {
        type: "list",
        items: [
          "Autoclave 습열멸균(132°C, 15분) 후 사용",
          "주수하 수직 사용, 양손 파지, 권장 30회 이내",
          "마찰열 감소를 위해 식염수 주수 필수",
        ],
      },
    ],
  },
  "cup": {
    blurb: "Initial·Light Pen에 체결 · 크라운과 유사한 직경 선택",
    description: "Cup은 Initial Pen·BonePen Kit Light Pen에 꽂아 쓰는 가이드 기구입니다. 최종 크라운(보철)과 비슷한 직경(Ø6–10)을 색상으로 구분해 선택하며, 단독 사용하지 않고 반드시 Pen에 체결합니다.",
    specs: [
      { label: "품목명", value: "치과용임플란트시술기구" },
      { label: "모델명", value: "BPC06D24외 9건" },
      { label: "의료기기 허가, 신고 번호", value: "제신 17-512 호" },
      { label: "사용목적", value: "치과용 임플란트를 시술하는 데에 사용되는 기구이다." },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "규격", value: "Ø6.0 / Ø7.0 / Ø8.0 / Ø9.0 / Ø10.0" },
      { label: "모델 예", value: "BPC06028–BPC10028 (Pd.No T7078–T7082)" },
    ],
    blocks: [
      { type: "heading", text: "Cup [Light & Initial]" },
      { type: "heading", text: "규격 · 색상" },
      { type: "list", items: ["6 · Ø6.0 (예: BPC06028 / T7078)", "7 · Ø7.0 (BPC07028 / T7079)", "8 · Ø8.0 (BPC08028 / T7080)", "9 · Ø9.0 (BPC09028 / T7081)", "10 · Ø10.0 (BPC10028 / T7082)"] },
      { type: "image", src: "/store/content/cup/row.jpg", alt: "Cup Ø6–10 색상·모델 스펙표" },
      { type: "heading", text: "사용방법" },
      { type: "list", items: ["치간 거리·최종 보철 크기에 맞는 직경 선택 (인접치 간섭·여유 간격 육안 확인)", "드릴(Pen)에 결합 후 핸드피스 체결 — 20:1, 300~1,500 RPM, 45~55 Torque", "Cup 측면을 인접치에 살짝 밀착, 주수하·양손 사용", "Cup·드릴 분리 세척, 습열멸균 조건 준수"] },
    ],
  },
  "initial-pin": {
    blurb: "Pen 삭제 후 가상 크라운 역할 · 수평·수직 공간 확인",
    description: "InitialPin은 Initial Pen으로 삭제한 치조골에 Cup과 같은 직경(색상)의 핀을 꽂아 가상의 치아 역할을 합니다. 상하악 수직 높이와 수평 위치를 육안 확인하고, 티타늄 소재로 재사용이 가능합니다.",
    specs: [
      { label: "품목명", value: "치과용임플란트시술기구" },
      { label: "모델명", value: "EX14외 11건" },
      { label: "의료기기 허가, 신고 번호", value: "제신 19-1088 호" },
      { label: "사용목적", value: "치과용 임플란트를 시술하는 데에 사용되는 기구이다." },
      { label: "사용방법", value: "사용자 매뉴얼 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질관리자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "모델", value: "IP06–IP10" },
      { label: "직경", value: "Ø6.0–Ø10.0" },
      { label: "Pd.No", value: "T7101–T7105" },
      { label: "눈금", value: "3칸 × 1.5mm, 본체 약 7mm" },
    ],
    blocks: [
      { type: "heading", text: "InitialPin" },
      { type: "text", text: "임플란트 시술 시 상악·하악 간 수직 높이를 확인하고, 가상 치아로 수평 위치를 잡아 줍니다. ※ 티타늄으로 장기 재사용 가능." },
      { type: "image", src: "/store/content/initial-pin/hero.jpg", alt: "InitialPin 제품·치수 콜아웃" },
      { type: "heading", text: "규격" },
      { type: "list", items: ["IP06 Ø6.0 / IP07 Ø7.0 / IP08 Ø8.0 / IP09 Ø9.0 / IP10 Ø10.0", "높이 눈금 Long / Middle / Short (3칸)", "삽입부 Ø2.8 → 팁 Ø2.2"] },
      { type: "image", src: "/store/content/initial-pin/heights.jpg", alt: "Long / Middle / Short 높이 눈금" },
      { type: "heading", text: "사용방법" },
      { type: "list", items: ["삭제된 치조골에 삽입 후 상하악 수직 공간 육안 확인", "3칸 눈금이 상하로 움직여 수직 공간을 확인 (정밀 길이측정 기능 아님, 분리 사용 금지)", "안전홀(C)에 의료용 실(≥30cm) 매듭 → 체결부(A) 삽입 → 교합 밀착 후 눈금 확인 → 제거", "멸균: Autoclave 132°C, 15분"] },
      { type: "heading", text: "15가지 규격 매칭" },
      { type: "text", text: "Pen·Pin 직경 5종 × 눈금 3칸 = 15가지. 예: 10Pen → Initial 10Pin 확인 → Healing/Simple Abut. 10S 적용으로 교합 조정 시간 단축." },
    ],
  },
  "check-pin": {
    blurb: "CheckPin + InitialPin 겸용 · SurgicalPin",
    description:
      "SurgicalPin은 기존 CheckPin이며 InitialPin 역할도 겸합니다. Fixture 식립 전후 패스·교합 높이·수직 공간 확인에 사용합니다.",
    specs: [
      { label: "품목명", value: "치과용임플란트시술기구" },
      { label: "역할", value: "CheckPin + InitialPin 겸용" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "직경", value: "Ø6.0–Ø10.0 (5종)" },
    ],
    blocks: [
      { type: "heading", text: "SurgicalPin" },
      {
        type: "text",
        text: "기존 CheckPin이며 InitialPin 역할도 합니다. Surgical Kit에 5종 포함.",
      },
      { type: "heading", text: "규격" },
      {
        type: "list",
        items: [
          "5종 (Cup과 동일 색상·직경 체계)",
          "상하악 수직 공간·식립 패스·교합 높이 확인",
        ],
      },
      {
        type: "image",
        src: "/store/content/check-pin/row.jpg",
        alt: "SurgicalPin 색상 라인",
      },
      { type: "heading", text: "사용방법" },
      {
        type: "list",
        items: [
          "드릴링 후 삽입해 수평·수직 확인 (InitialPin 역할)",
          "Fixture 식립 후 내부에 삽입해 패스·교합 높이 재확인 (CheckPin 역할)",
          "Autoclave 132°C, 15분 후 사용",
        ],
      },
    ],
  },
  "bone-shaper": {
    blurb: "S6·7·9 & M6·7·9 · 6종",
    description:
      "BoneShaper S6·7·9 및 M6·7·9 = 총 6종. 팁 조금 길게, 연마 없음. Fixture 식립 후 Healing 체결용 cortical bone 성형.",
    specs: [
      { label: "품목명", value: "치과임플란트시술용드릴" },
      { label: "구성", value: "S6·7·9, M6·7·9 (6종)" },
      { label: "비고", value: "팁 조금 길게 · 연마 없음" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "권장 조건", value: "20:1 / 1,000~1,500 rpm / 45~55 Torque / 주수하" },
    ],
    blocks: [
      { type: "heading", text: "BoneShaper" },
      {
        type: "text",
        text: "S6·7·9 및 M6·7·9 = 총 6종. 팁 조금 길게. 연마는 하지 않습니다. Surgical Kit 구성품.",
      },
      {
        type: "image",
        src: "/store/content/bone-shaper/s-row.jpg",
        alt: "BoneShaper S 라인",
      },
      {
        type: "image",
        src: "/store/content/bone-shaper/ml-row.jpg",
        alt: "BoneShaper M 라인",
      },
      { type: "heading", text: "사용방법" },
      {
        type: "list",
        items: [
          "적합한 사이즈 선택 후 핸드피스 체결",
          "작은 사이즈부터 순차 사용",
          "수직으로 살짝 가압, 주수하 3~5초",
          "비멸균 — Autoclave 132°C, 15분",
        ],
      },
    ],
  },
  "gingival-shaper": {
    blurb: "GingivalShaper · 6·7·9",
    description:
      "GingivalShaper 6·7·9 = 3종. Simple Abutment 마진 치은 삭제. 제조 4.4만 ×2 = 8.8만.",
    specs: [
      { label: "품명", value: "의료용절삭기구" },
      { label: "모델명", value: "GS06V1외 41건" },
      { label: "의료기기 허가, 신고 번호", value: "부산 제신 11-98 호" },
      { label: "사용목적", value: "천자기, 천공기 및 핸드피스 등에 사용하는 절삭용 버(burr), 절삭용 디스크, 광택용 휠, 스트립 등의 기구. 레이저, 수술기용 디스크를 포함한다." },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "구성", value: "6 · 7 · 9 (3종)" },
      { label: "모델", value: "GS06V1–GS010V1" },
      { label: "직경 예", value: "Ø5.6–Ø9.6대" },
    ],
    blocks: [
      { type: "heading", text: "GingivalShaper" },
      { type: "text", text: "깔끔한 마진 확보로 간편한 인상 채득이 가능합니다. ※ 타사 어버트먼트에는 호환되지 않습니다. 키트 구성 3종(6·7·9)." },
      { type: "heading", text: "규격 매칭" },
      { type: "text", text: "예: GingivalShaper 8 사용 시 Simple Abutment 8S 또는 8M 사용." },
      { type: "list", items: ["GS06V1–GS010V1 (Pd.No T7026–T7030)", "신고번호: 부산 제신11-98호"] },
      { type: "image", src: "/store/content/gingival-shaper/row.jpg", alt: "GingivalShaper 규격 라인" },
      { type: "heading", text: "사용방법" },
      { type: "list", items: ["상부구조물 규격에 맞는 제품 선택 → 핸드피스 체결 (엔도용 추천 또는 임플란트용)", "상부구조물에 밀착 후 주수하, 최대회전수 내 3~5초 (1:1 기준), 부족 시 1~2회", "이동 전 완전 정지, 내면 치은 잔사 제거 후 초음파 세척", "인접치 주의, 수직 사용"] },
    ],
  },
  "hex-driver": {
    blurb: "S/M/L · 헥스 어벗 체결 가이드",
    description:
      "Hex Driver S, M, L 3종. 헥스 어벗 체결 가이드. 제조 3.3만 ×2 = 6.6만.",
    specs: [
      { label: "품명", value: "치과임플란트시술용스크루드라이버" },
      { label: "모델명", value: "HA25S외 7건" },
      { label: "의료기기 허가, 신고 번호", value: "제신 19-1048 호" },
      { label: "사용목적", value: "임플란트 시술시 구성품들을 결합하는 과정에서 나사를 조이는 기구이다." },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "구성", value: "S / M / L (3종)" },
      { label: "모델", value: "WD12S (Short) / WD12M (Middle) / WD12L (Long)" },
      { label: "길이", value: "Short · Middle · Long" },
      { label: "HEX", value: "1.20" },
      { label: "Pd.No", value: "T7145 / T7146" },
    ],
    blocks: [
      { type: "heading", text: "Wrench HEX-driver (S / M / L)" },
      { type: "text", text: "임플란트 시술 시 구성품을 결합하는 과정에서 나사를 조이는 기구. 신고번호 제신19-1048호. 헥스 어벗 체결 가이드." },
      { type: "image", src: "/store/content/hex-driver/drivers.jpg", alt: "HEX-driver S / M / L" },
      { type: "heading", text: "사용방법" },
      { type: "list", items: ["제품을 선택해 렌치에 체결", "상부구조물(또는 고정체)에 체결해 대상물로 이동 후 결합", "시술 전 Autoclave 습열멸균(132°C, 15분)"] },
    ],
  },
  "torque-wrench": {
    blurb: "나사를 설정 토크로 조이는 Hand Type 토크 렌치",
    description:
      "Torque wrench(Hand Type). 제조 8.8만 ×2 = 17.6만. W-Adaptor를 체결하고 방향·눈금을 설정해 사용합니다.",
    specs: [
      { label: "품명", value: "치과용임플란트시술기구" },
      { label: "모델명", value: "EX14외 11건" },
      { label: "의료기기 허가, 신고 번호", value: "제신 19-1088 호" },
      { label: "사용목적", value: "치과용 임플란트를 시술하는 데에 사용되는 기구이다." },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "품질책임자/전화번호", value: "이상훈 / Tel : 055-314-4607" },
      { label: "모델", value: "TWH (Hand Type)" },
      { label: "Pd.No", value: "T7121" },
    ],
    blocks: [
      { type: "heading", text: "Torque wrench" },
      { type: "text", text: "치과용 임플란트 시술 기구. 신고번호 제신19-1088호." },
      { type: "image", src: "/store/content/torque-wrench/body.jpg", alt: "Torque wrench 본체" },
      { type: "image", src: "/store/content/torque-wrench/parts.jpg", alt: "토크 방향·눈금(A/B/C) 사용 다이어그램" },
      { type: "heading", text: "사용방법" },
      { type: "list", items: ["W-Adaptor를 체결부(A)에 체결", "B 부분을 당겨 회전시켜 토크 방향 설정", "C 부분을 천천히 당겨 토크 눈금에 맞게 사용", "시술 전 Autoclave 132°C, 15분"] },
    ],
  },
  "simple-healing": {
    blurb: "For Submerged type · Non-Hex",
    description: "서브머지드 타입용 Healing Abutment [Non-Hex]입니다. 힐링·어벗 각 12종. Simple Abutment와 같은 Follow color-band로 규격을 맞춥니다.",
    specs: [
      { label: "품명", value: "치과용임플란트상부구조물" },
      { label: "모델명", value: "SH06-H0C20 외 44건" },
      { label: "의료기기 허가, 신고 번호", value: "제인19-4012호" },
      { label: "사용목적", value: "환자의 저작 기능 회복을 위해 사용하는 인공 치아와 같은 보철물을 지지하기 위하여 삽입" },
      { label: "사용방법", value: "상품상세설명 참조" },
      { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      { label: "HEX", value: "1.20 / 1.28 (임플란트 시스템별)" },
      { label: "헤드 높이(H)", value: "약 3.5 mm" },
      { label: "커프(C)", value: "S 2.0 / M 3.5 / L 5.0 mm" },
    ],
    blocks: [
      { type: "heading", text: "Healing Abutment" },
      { type: "text", text: "픽스처 식립 후 연조직 힐링을 위한 어버트먼트. 상단 표기(예: 8M)로 규격을 확인하고 HEX 드라이버로 체결합니다." },
      { type: "heading", text: "제품의 규격" },
      { type: "list", items: ["Acodent / Osstem / Neo / Megagen / Dio — HEX 1.20 (S1061~ 계열)", "Dentium / Dentis — HEX 1.28 (S1071~ 계열)", "Cuff S 2.0 / M 3.5 / L 5.0 mm", "직경 라인 6·7·8·9·10 (예: Ø5.4~Ø9.0대)"] },
      { type: "image", src: "/store/content/simple-healing/size-grid.jpg", alt: "치수 다이어그램 D/H/C/HD + 상단 8M 표기 예시" },
      { type: "heading", text: "Follow color-band" },
      { type: "text", text: "Pen·Pin·BoneShaper와 동일 색상 밴드로 Healing → Simple Abut. → Final까지 규격을 유지합니다." },
    ],
  },
  "full-package": {
    blurb: "키트 2종 + Abutment 300EA 일괄",
    description:
      "Surgical·Prosthetic Kit 각 1키트, SimpleAbutment-Hex 150EA, SimpleHealing-Hex 150EA. 구성 판매합 682만 → 패키지 판매가 500만.",
    blocks: [
      { type: "heading", text: "500만 패키지 구성" },
      {
        type: "list",
        items: [
          "Surgical Kit ×1",
          "Prosthetic Kit ×1",
          "SimpleAbutment-Hex ×150",
          "SimpleHealing-Hex ×150",
        ],
      },
      {
        type: "text",
        text: "500만원 패키지 구매 시 pkg 가격이 적용됩니다. 각 구성품 상세는 해당 단품/키트 페이지를 참고하세요.",
      },
      {
        type: "image",
        src: "/store/content/full-package/initial-kit.jpg",
        alt: "Surgical Kit",
      },
      {
        type: "image",
        src: "/store/content/full-package/prosthetic-kit.jpg",
        alt: "Prosthetic Kit",
      },
      {
        type: "image",
        src: "/store/content/full-package/simple-abutment-2.jpg",
        alt: "SimpleAbutment-Hex",
      },
      {
        type: "image",
        src: "/store/content/full-package/simple-healing-2.jpg",
        alt: "SimpleHealing-Hex",
      },
    ],
  },
  "kit-case": {
    blurb: "Surgical / Prosthetic · 2종",
    description:
      "시술 키트 수납용 케이스. Surgical(제조 13.2만)×2 · Prosthetic(제조 12.1만)×2.",
    specs: [
      { label: "포장단위", value: "1EA" },
      { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
      {
        label: "옵션",
        value: "Surgical Kit Case · Prosthetic Kit Case",
      },
    ],
    blocks: [
      { type: "heading", text: "Kit Case 2종" },
      {
        type: "text",
        text: "시술 키트 구성품을 수납·보관하는 케이스입니다. Surgical / Prosthetic 키트에 맞는 케이스를 선택해 주세요.",
      },
      {
        type: "list",
        items: [
          "Surgical Kit Case — Surgical Kit 전용 (판매가 264,000원)",
          "Prosthetic Kit Case — Prosthetic Kit 전용 (판매가 242,000원)",
        ],
      },
    ],
  },
};

export function getStoreProductContent(productId: string | undefined) {
  if (!productId) return undefined;
  return STORE_PRODUCT_CONTENT[productId];
}
