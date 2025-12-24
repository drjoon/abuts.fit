function requiredStr(v) {
  const s = String(v || "").trim();
  return s;
}

function kstYmd(date) {
  const d = date ? new Date(date) : new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function ensureEnv(key) {
  const v = requiredStr(process.env[key]);
  if (!v) throw new Error(`env:${key} is required for bolta mode`);
  return v;
}

function buildBoltaPayload(draft) {
  const buyerBizNo = requiredStr(draft?.buyer?.bizNo);
  const buyerCorpName = requiredStr(draft?.buyer?.corpName);
  if (!buyerBizNo || !buyerCorpName) {
    throw new Error("세금계산서 매입자 정보(bizNo, corpName)가 필요합니다.");
  }

  const supplier = {
    identificationNumber: ensureEnv("BOLTA_SUPPLIER_ID_NUMBER"),
    taxRegistrationId: requiredStr(
      process.env.BOLTA_SUPPLIER_TAX_REG_ID || "0000"
    ),
    organizationName: ensureEnv("BOLTA_SUPPLIER_ORG_NAME"),
    representativeName: ensureEnv("BOLTA_SUPPLIER_REP_NAME"),
    address: ensureEnv("BOLTA_SUPPLIER_ADDRESS"),
    businessItem: ensureEnv("BOLTA_SUPPLIER_BIZ_ITEM"),
    businessType: ensureEnv("BOLTA_SUPPLIER_BIZ_TYPE"),
    manager: {
      email: ensureEnv("BOLTA_SUPPLIER_MANAGER_EMAIL"),
      name: ensureEnv("BOLTA_SUPPLIER_MANAGER_NAME"),
      telephone: ensureEnv("BOLTA_SUPPLIER_MANAGER_TEL"),
    },
  };

  const supplied = {
    identificationNumber: buyerBizNo,
    taxRegistrationId: requiredStr(draft?.buyer?.taxRegistrationId || "0000"),
    organizationName: buyerCorpName,
    representativeName: requiredStr(draft?.buyer?.ceoName || ""),
    address: requiredStr(draft?.buyer?.addr || ""),
    businessItem: requiredStr(draft?.buyer?.bizClass || ""),
    businessType: requiredStr(draft?.buyer?.bizType || ""),
    managers: [
      {
        email: requiredStr(draft?.buyer?.contactEmail || ""),
        name: requiredStr(draft?.buyer?.contactName || ""),
        telephone: requiredStr(draft?.buyer?.contactTel || ""),
      },
    ],
  };

  const supplyCost = Number(draft?.supplyAmount || 0);
  const tax = Number(draft?.vatAmount || 0);
  if (!Number.isFinite(supplyCost) || !Number.isFinite(tax)) {
    throw new Error("공급가/부가세 금액이 유효하지 않습니다.");
  }

  const itemDate = kstYmd(draft?.approvedAt || draft?.createdAt || new Date());
  const itemName = requiredStr(draft?.description || "크레딧 충전금");

  return {
    date: itemDate,
    purpose: "RECEIPT",
    supplier,
    supplied,
    items: [
      {
        date: itemDate,
        name: itemName,
        unitPrice: supplyCost,
        quantity: 1,
        supplyCost,
        tax,
        specification: "",
        description: "",
      },
    ],
    description: itemName,
  };
}

async function sendWithBolta(draft) {
  const axios = (await import("axios")).default;
  const apiKey = ensureEnv("BOLTA_API_KEY");
  const customerKey = ensureEnv("BOLTA_CUSTOMER_KEY");
  const baseURL = requiredStr(
    process.env.BOLTA_BASE_URL || "https://xapi.bolta.io"
  );
  const clientRefId = String(draft?._id || "").trim();

  const payload = buildBoltaPayload(draft);
  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const { data } = await axios.post("/v1/taxInvoices/issue", payload, {
    baseURL,
    headers: {
      Authorization: `Basic ${auth}`,
      "Customer-Key": customerKey,
      "Content-Type": "application/json",
      ...(clientRefId ? { "Bolta-Client-Reference-Id": clientRefId } : {}),
    },
    timeout: 15000,
  });

  const issuanceKey = requiredStr(data?.issuanceKey);
  if (!issuanceKey) throw new Error("bolta 응답에 issuanceKey가 없습니다.");

  return { hometaxTrxId: issuanceKey };
}

export async function sendTaxInvoiceDraft(draft) {
  const mode = String(process.env.HOMETAX_MODE || "mock")
    .trim()
    .toLowerCase();

  const buyerBizNo = requiredStr(draft?.buyer?.bizNo);
  const buyerCorpName = requiredStr(draft?.buyer?.corpName);

  if (!buyerBizNo || !buyerCorpName) {
    throw new Error("세금계산서 매입자 정보(bizNo, corpName)가 필요합니다.");
  }

  if (mode === "mock") {
    const id = `mock-hometax:${String(draft?._id)}:${Date.now()}`;
    return { hometaxTrxId: id };
  }

  if (mode === "bolta" || mode === "asp") {
    return sendWithBolta(draft);
  }

  if (mode === "real") {
    throw new Error("Hometax REAL 모드는 아직 구현되지 않았습니다.");
  }

  throw new Error(`HOMETAX_MODE가 유효하지 않습니다. mode=${mode}`);
}
